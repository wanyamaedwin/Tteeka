import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import type { ReplaceOrderItemsInput } from './order-items.schema';
import { orderCreateRequestHash } from './order-idempotency';
import type { OrderListQuery } from './order-query.schema';
import type { CreateOrderInput, OrderPatchInput } from './order.schema';
import {
  ORDER_STORE,
  OrderArithmeticOverflowError,
  OrderCurrencyMismatchError,
  OrderIdempotencyConflictError,
  OrderInvalidTransitionError,
  OrderItemIneligibleError,
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
    };
  }

  private mapItem(item: OrderItemRecord) {
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
    };
  }

  private mapError(error: unknown): never {
    if (error instanceof OrderIdempotencyConflictError)
      throw new ConflictException('Idempotency key already used.');
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
