import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type { ReplaceOrderItemsInput } from './order-items.schema';
import type { OrderListQuery } from './order-query.schema';
import type { OrderPatchInput } from './order.schema';
import {
  type CreateOrderCommand,
  OrderArithmeticOverflowError,
  OrderCurrencyMismatchError,
  OrderIdempotencyConflictError,
  OrderInvalidTransitionError,
  OrderItemIneligibleError,
  type OrderItemRecord,
  type OrderListResult,
  OrderNotEditableError,
  type OrderRecord,
  OrderReferenceUnavailableError,
  type OrderStore,
} from './order.store';

const MAX_BIGINT = 9_223_372_036_854_775_807n;

const orderSelect = {
  id: true,
  merchantId: true,
  customerId: true,
  status: true,
  customerNameSnapshot: true,
  customerPhoneSnapshot: true,
  deliveryLocationId: true,
  deliveryAreaSnapshot: true,
  deliveryLandmarkSnapshot: true,
  deliveryPhoneSnapshot: true,
  deliveryInstructionsSnapshot: true,
  deliveryMapPinUrlSnapshot: true,
  currency: true,
  subtotal: true,
  requestHash: true,
  createdAt: true,
  updatedAt: true,
  abandonedAt: true,
  cancelledAt: true,
} as const;

const itemSelect = {
  id: true,
  variantId: true,
  productNameSnapshot: true,
  skuSnapshot: true,
  sizeSnapshot: true,
  colourSnapshot: true,
  quantity: true,
  unitSellingPrice: true,
  currency: true,
  lineTotal: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Injectable()
export class PrismaOrderStore implements OrderStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async create(
    merchantId: string,
    command: CreateOrderCommand,
  ): Promise<OrderRecord> {
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const replay = await transaction.order.findUnique({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: orderSelect,
        });
        if (replay !== null) {
          if (replay.requestHash !== command.requestHash)
            throw new OrderIdempotencyConflictError();
          return replay;
        }
        const customer = await transaction.customer.findUnique({
          where: { merchantId_id: { merchantId, id: command.customerId } },
          select: { id: true, name: true, phone: true, status: true },
        });
        if (customer?.status !== 'ACTIVE')
          throw new OrderReferenceUnavailableError();
        const location =
          command.deliveryLocationId === null
            ? null
            : await transaction.deliveryLocation.findFirst({
                where: {
                  merchantId,
                  customerId: customer.id,
                  id: command.deliveryLocationId,
                  status: 'ACTIVE',
                },
                select: {
                  id: true,
                  area: true,
                  landmark: true,
                  phone: true,
                  instructions: true,
                  mapPinUrl: true,
                },
              });
        if (command.deliveryLocationId !== null && location === null)
          throw new OrderReferenceUnavailableError();
        return transaction.order.create({
          data: {
            merchantId,
            customerId: customer.id,
            customerNameSnapshot: customer.name,
            customerPhoneSnapshot: customer.phone,
            deliveryLocationId: location?.id ?? null,
            deliveryAreaSnapshot: location?.area ?? null,
            deliveryLandmarkSnapshot: location?.landmark ?? null,
            deliveryPhoneSnapshot: location?.phone ?? null,
            deliveryInstructionsSnapshot: location?.instructions ?? null,
            deliveryMapPinUrlSnapshot: location?.mapPinUrl ?? null,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
          },
          select: orderSelect,
        });
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      const replay = await this.database.client.order.findUnique({
        where: {
          merchantId_idempotencyKey: {
            merchantId,
            idempotencyKey: command.idempotencyKey,
          },
        },
        select: orderSelect,
      });
      if (replay !== null && replay.requestHash === command.requestHash)
        return replay;
      throw new OrderIdempotencyConflictError();
    }
  }

  public async list(
    merchantId: string,
    query: OrderListQuery,
  ): Promise<OrderListResult> {
    const where = {
      merchantId,
      ...(query.customerId === undefined
        ? {}
        : { customerId: query.customerId }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              {
                customerNameSnapshot: {
                  contains: query.q,
                  mode: 'insensitive' as const,
                },
              },
              { customerPhoneSnapshot: { contains: query.q } },
            ],
          }),
      ...(query.createdFrom === undefined && query.createdTo === undefined
        ? {}
        : {
            createdAt: {
              ...(query.createdFrom === undefined
                ? {}
                : { gte: query.createdFrom }),
              ...(query.createdTo === undefined ? {} : { lt: query.createdTo }),
            },
          }),
    };
    const [total, rows] = await this.database.client.$transaction([
      this.database.client.order.count({ where }),
      this.database.client.order.findMany({
        where,
        select: orderSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows, total };
  }

  public find(
    merchantId: string,
    orderId: string,
  ): Promise<OrderRecord | null> {
    return this.database.client.order.findFirst({
      where: { merchantId, id: orderId },
      select: orderSelect,
    });
  }

  public patch(
    merchantId: string,
    orderId: string,
    patch: OrderPatchInput,
  ): Promise<OrderRecord | null> {
    return this.database.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<readonly { id: string }[]>`
        SELECT "id" FROM "orders" WHERE "merchant_id" = ${merchantId}::uuid AND "id" = ${orderId}::uuid FOR UPDATE`;
      if (locked.length === 0) return null;
      const current = await transaction.order.findUniqueOrThrow({
        where: { merchantId_id: { merchantId, id: orderId } },
        select: orderSelect,
      });
      if (current.status !== 'DRAFT') throw new OrderNotEditableError();
      const customerChanged =
        patch.customerId !== undefined &&
        patch.customerId !== current.customerId;
      const targetCustomerId = patch.customerId ?? current.customerId;
      const targetLocationId =
        patch.deliveryLocationId !== undefined
          ? patch.deliveryLocationId
          : customerChanged
            ? null
            : current.deliveryLocationId;
      const locationChanged = targetLocationId !== current.deliveryLocationId;
      if (!customerChanged && !locationChanged) return current;
      const customer = customerChanged
        ? await transaction.customer.findFirst({
            where: { merchantId, id: targetCustomerId, status: 'ACTIVE' },
            select: { id: true, name: true, phone: true },
          })
        : null;
      if (customerChanged && customer === null)
        throw new OrderReferenceUnavailableError();
      const location =
        targetLocationId === null
          ? null
          : await transaction.deliveryLocation.findFirst({
              where: {
                merchantId,
                customerId: targetCustomerId,
                id: targetLocationId,
                status: 'ACTIVE',
              },
              select: {
                id: true,
                area: true,
                landmark: true,
                phone: true,
                instructions: true,
                mapPinUrl: true,
              },
            });
      if (targetLocationId !== null && location === null)
        throw new OrderReferenceUnavailableError();
      return transaction.order.update({
        where: { merchantId_id: { merchantId, id: orderId } },
        data: {
          customerId: targetCustomerId,
          ...(customer === null
            ? {}
            : {
                customerNameSnapshot: customer.name,
                customerPhoneSnapshot: customer.phone,
              }),
          deliveryLocationId: location?.id ?? null,
          deliveryAreaSnapshot: location?.area ?? null,
          deliveryLandmarkSnapshot: location?.landmark ?? null,
          deliveryPhoneSnapshot: location?.phone ?? null,
          deliveryInstructionsSnapshot: location?.instructions ?? null,
          deliveryMapPinUrlSnapshot: location?.mapPinUrl ?? null,
        },
        select: orderSelect,
      });
    });
  }

  public replaceItems(
    merchantId: string,
    orderId: string,
    input: ReplaceOrderItemsInput,
  ): Promise<{
    order: OrderRecord;
    items: readonly OrderItemRecord[];
  } | null> {
    return this.database.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<readonly { id: string }[]>`
        SELECT "id" FROM "orders" WHERE "merchant_id" = ${merchantId}::uuid AND "id" = ${orderId}::uuid FOR UPDATE`;
      if (locked.length === 0) return null;
      const order = await transaction.order.findUniqueOrThrow({
        where: { merchantId_id: { merchantId, id: orderId } },
        select: orderSelect,
      });
      if (order.status !== 'DRAFT') throw new OrderNotEditableError();
      const current = await transaction.orderItem.findMany({
        where: { merchantId, orderId },
        select: itemSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const currentByVariant = new Map(
        current.map((item) => [item.variantId, item]),
      );
      const newIds = input.items
        .filter(({ variantId }) => !currentByVariant.has(variantId))
        .map(({ variantId }) => variantId);
      const variants =
        newIds.length === 0
          ? []
          : await transaction.productVariant.findMany({
              where: { merchantId, id: { in: newIds } },
              select: {
                id: true,
                sku: true,
                size: true,
                colour: true,
                status: true,
                sellingPrice: true,
                priceCurrency: true,
                product: { select: { name: true, status: true } },
              },
            });
      if (
        variants.length !== newIds.length ||
        variants.some(
          (variant) =>
            variant.status !== 'ACTIVE' ||
            variant.product.status !== 'ACTIVE' ||
            variant.sellingPrice === null ||
            variant.priceCurrency === null,
        )
      ) {
        throw new OrderItemIneligibleError();
      }
      const variantById = new Map(
        variants.map((variant) => [variant.id, variant]),
      );
      const desired = input.items.map(
        ({ variantId, quantity: quantityText }) => {
          const quantity = BigInt(quantityText);
          const existing = currentByVariant.get(variantId);
          const variant = variantById.get(variantId);
          const unitSellingPrice =
            existing?.unitSellingPrice ?? variant?.sellingPrice;
          const currency = existing?.currency ?? variant?.priceCurrency;
          if (unitSellingPrice == null || currency == null)
            throw new OrderItemIneligibleError();
          if (quantity > MAX_BIGINT / unitSellingPrice)
            throw new OrderArithmeticOverflowError();
          return {
            variantId,
            quantity,
            lineTotal: quantity * unitSellingPrice,
            unitSellingPrice,
            currency,
            existing,
            variant,
          };
        },
      );
      const currencies = new Set(desired.map(({ currency }) => currency));
      if (currencies.size > 1) throw new OrderCurrencyMismatchError();
      let subtotal = 0n;
      for (const item of desired) {
        if (subtotal > MAX_BIGINT - item.lineTotal)
          throw new OrderArithmeticOverflowError();
        subtotal += item.lineTotal;
      }
      const unchanged =
        desired.length === current.length &&
        desired.every(
          ({ existing, quantity }) => existing?.quantity === quantity,
        );
      if (unchanged) return { order, items: current };
      const desiredIds = desired.map(({ variantId }) => variantId);
      await transaction.orderItem.deleteMany({
        where: { merchantId, orderId, variantId: { notIn: desiredIds } },
      });
      for (const item of desired) {
        if (item.existing !== undefined) {
          if (item.existing.quantity !== item.quantity) {
            await transaction.orderItem.update({
              where: {
                merchantId_orderId_variantId: {
                  merchantId,
                  orderId,
                  variantId: item.variantId,
                },
              },
              data: { quantity: item.quantity, lineTotal: item.lineTotal },
            });
          }
        } else {
          const variant = item.variant;
          if (variant === undefined) throw new OrderItemIneligibleError();
          await transaction.orderItem.create({
            data: {
              merchantId,
              orderId,
              variantId: variant.id,
              productNameSnapshot: variant.product.name,
              skuSnapshot: variant.sku,
              sizeSnapshot: variant.size,
              colourSnapshot: variant.colour,
              quantity: item.quantity,
              unitSellingPrice: item.unitSellingPrice,
              currency: item.currency,
              lineTotal: item.lineTotal,
            },
          });
        }
      }
      const updatedOrder = await transaction.order.update({
        where: { merchantId_id: { merchantId, id: orderId } },
        data: {
          currency: desired[0]?.currency ?? null,
          subtotal,
        },
        select: orderSelect,
      });
      const items = await transaction.orderItem.findMany({
        where: { merchantId, orderId },
        select: itemSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return { order: updatedOrder, items };
    });
  }

  public listItems(
    merchantId: string,
    orderId: string,
  ): Promise<{
    order: OrderRecord;
    items: readonly OrderItemRecord[];
  } | null> {
    return this.database.client.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: { merchantId, id: orderId },
        select: orderSelect,
      });
      if (order === null) return null;
      const items = await transaction.orderItem.findMany({
        where: { merchantId, orderId },
        select: itemSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return { order, items };
    });
  }

  public transition(
    merchantId: string,
    orderId: string,
    target: 'ABANDONED' | 'CANCELLED',
  ): Promise<OrderRecord | null> {
    return this.database.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<readonly { id: string }[]>`
        SELECT "id" FROM "orders" WHERE "merchant_id" = ${merchantId}::uuid AND "id" = ${orderId}::uuid FOR UPDATE`;
      if (locked.length === 0) return null;
      const current = await transaction.order.findUniqueOrThrow({
        where: { merchantId_id: { merchantId, id: orderId } },
        select: orderSelect,
      });
      if (current.status === target) return current;
      if (current.status !== 'DRAFT') throw new OrderInvalidTransitionError();
      const now = new Date();
      return transaction.order.update({
        where: { merchantId_id: { merchantId, id: orderId } },
        data:
          target === 'ABANDONED'
            ? { status: target, abandonedAt: now }
            : { status: target, cancelledAt: now },
        select: orderSelect,
      });
    });
  }
}
