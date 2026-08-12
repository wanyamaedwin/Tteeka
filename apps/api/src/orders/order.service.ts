import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import type { ReplaceOrderItemsInput } from './order-items.schema';
import {
  orderConfirmationRequestHash,
  orderCreateRequestHash,
} from './order-idempotency';
import type { OrderListQuery } from './order-query.schema';
import type {
  ConfirmOrderInput,
  CreateOrderInput,
  OrderPatchInput,
} from './order.schema';
import {
  ORDER_STORE,
  OrderArithmeticOverflowError,
  OrderCurrencyMismatchError,
  OrderConfirmationConflictError,
  OrderEmptyError,
  OrderIdempotencyConflictError,
  OrderInvalidTransitionError,
  OrderItemIneligibleError,
  OrderInsufficientSellableInventoryError,
  type OrderItemRecord,
  OrderNotEditableError,
  type OrderRecord,
  OrderReferenceUnavailableError,
  type OrderStore,
} from './order.store';

@Injectable()
export class OrderService {
  public constructor(@Inject(ORDER_STORE) private readonly store: OrderStore) {}

  public async create(
    context: ResolvedMerchantContext,
    input: CreateOrderInput,
    idempotencyKey: string,
  ) {
    try {
      return this.mapOrder(
        await this.store.create(context.merchant.id, {
          ...input,
          idempotencyKey,
          requestHash: orderCreateRequestHash(input),
        }),
      );
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  public async list(context: ResolvedMerchantContext, query: OrderListQuery) {
    const result = await this.store.list(context.merchant.id, query);
    return {
      orders: result.rows.map((row) => this.mapOrderSummary(row)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
  }

  public async detail(context: ResolvedMerchantContext, orderId: string) {
    const order = await this.store.find(context.merchant.id, orderId);
    if (order === null) throw new NotFoundException('Not found.');
    return this.mapOrder(order);
  }

  public async patch(
    context: ResolvedMerchantContext,
    orderId: string,
    patch: OrderPatchInput,
  ) {
    try {
      const order = await this.store.patch(context.merchant.id, orderId, patch);
      if (order === null) throw new NotFoundException('Not found.');
      return this.mapOrder(order);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  public async replaceItems(
    context: ResolvedMerchantContext,
    orderId: string,
    input: ReplaceOrderItemsInput,
  ) {
    try {
      const result = await this.store.replaceItems(
        context.merchant.id,
        orderId,
        input,
      );
      if (result === null) throw new NotFoundException('Not found.');
      return {
        order: this.mapOrder(result.order),
        items: result.items.map((item) => this.mapItem(item)),
      };
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  public async items(context: ResolvedMerchantContext, orderId: string) {
    const result = await this.store.listItems(context.merchant.id, orderId);
    if (result === null) throw new NotFoundException('Not found.');
    return {
      orderId: result.order.id,
      currency: result.order.currency,
      subtotal: result.order.subtotal.toString(),
      items: result.items.map((item) => this.mapItem(item)),
    };
  }

  public async transition(
    context: ResolvedMerchantContext,
    orderId: string,
    target: 'ABANDONED' | 'CANCELLED',
  ) {
    try {
      const order = await this.store.transition(
        context.merchant.id,
        orderId,
        target,
      );
      if (order === null) throw new NotFoundException('Not found.');
      return this.mapOrder(order);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  public async confirm(
    context: ResolvedMerchantContext,
    orderId: string,
    input: ConfirmOrderInput,
    idempotencyKey: string,
  ) {
    const now = new Date();
    const expiresAtDate = new Date(input.expiresAt);
    if (expiresAtDate <= now) {
      throw new UnprocessableEntityException(
        'Hold expiry must be in the future.',
      );
    }
    try {
      const order = await this.store.confirm(context.merchant.id, orderId, {
        ...input,
        expiresAtDate,
        idempotencyKey,
        requestHash: orderConfirmationRequestHash(orderId, input),
        now,
      });
      if (order === null) throw new NotFoundException('Not found.');
      return this.mapOrder(order);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  private mapOrderSummary(order: OrderRecord) {
    return {
      id: order.id,
      customerId: order.customerId,
      customerNameSnapshot: order.customerNameSnapshot,
      customerPhoneSnapshot: order.customerPhoneSnapshot,
      status: order.status,
      currency: order.currency,
      subtotal: order.subtotal.toString(),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      stockHoldExpiresAt: order.stockHoldExpiresAt?.toISOString() ?? null,
    };
  }

  private mapOrder(order: OrderRecord) {
    return {
      id: order.id,
      merchantId: order.merchantId,
      customerId: order.customerId,
      status: order.status,
      customerNameSnapshot: order.customerNameSnapshot,
      customerPhoneSnapshot: order.customerPhoneSnapshot,
      deliveryLocationId: order.deliveryLocationId,
      deliveryAreaSnapshot: order.deliveryAreaSnapshot,
      deliveryLandmarkSnapshot: order.deliveryLandmarkSnapshot,
      deliveryPhoneSnapshot: order.deliveryPhoneSnapshot,
      deliveryInstructionsSnapshot: order.deliveryInstructionsSnapshot,
      deliveryMapPinUrlSnapshot: order.deliveryMapPinUrlSnapshot,
      currency: order.currency,
      subtotal: order.subtotal.toString(),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      abandonedAt: order.abandonedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      stockHoldExpiresAt: order.stockHoldExpiresAt?.toISOString() ?? null,
    };
  }

  private mapItem(item: OrderItemRecord) {
    const stockHold = item.stockHolds[0];
    const effectivelyExpired =
      stockHold?.status === 'ACTIVE' && stockHold.expiresAt <= new Date();
    return {
      id: item.id,
      variantId: item.variantId,
      productNameSnapshot: item.productNameSnapshot,
      skuSnapshot: item.skuSnapshot,
      sizeSnapshot: item.sizeSnapshot,
      colourSnapshot: item.colourSnapshot,
      quantity: item.quantity.toString(),
      unitSellingPrice: item.unitSellingPrice.toString(),
      currency: item.currency,
      lineTotal: item.lineTotal.toString(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      stockHold:
        stockHold === undefined
          ? null
          : {
              id: stockHold.id,
              quantity: stockHold.quantity.toString(),
              status: effectivelyExpired ? 'EXPIRED' : stockHold.status,
              expiresAt: stockHold.expiresAt.toISOString(),
              releasedAt: stockHold.releasedAt?.toISOString() ?? null,
              expiredAt:
                stockHold.expiredAt?.toISOString() ??
                (effectivelyExpired ? stockHold.expiresAt.toISOString() : null),
            },
    };
  }

  private mapError(error: unknown): never {
    if (error instanceof OrderIdempotencyConflictError)
      throw new ConflictException('Idempotency key already used.');
    if (error instanceof OrderConfirmationConflictError)
      throw new ConflictException('Order confirmation conflict.');
    if (error instanceof OrderEmptyError)
      throw new UnprocessableEntityException(
        'An order must contain at least one item before it can be confirmed.',
      );
    if (error instanceof OrderInsufficientSellableInventoryError)
      throw new UnprocessableEntityException(
        'Insufficient sellable inventory to confirm this order.',
      );
    if (
      error instanceof OrderNotEditableError ||
      error instanceof OrderInvalidTransitionError
    )
      throw new ConflictException('Order transition is not allowed.');
    if (error instanceof OrderReferenceUnavailableError)
      throw new UnprocessableEntityException('Order reference is unavailable.');
    if (error instanceof OrderItemIneligibleError)
      throw new UnprocessableEntityException(
        'One or more Order items are unavailable.',
      );
    if (error instanceof OrderCurrencyMismatchError)
      throw new UnprocessableEntityException(
        'Order items must use one currency.',
      );
    if (error instanceof OrderArithmeticOverflowError)
      throw new UnprocessableEntityException('Order total exceeds limits.');
    throw error;
  }
}
