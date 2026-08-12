import type { ReplaceOrderItemsInput } from './order-items.schema';
import type { OrderListQuery } from './order-query.schema';
import type {
  ConfirmOrderInput,
  CreateOrderInput,
  OrderPatchInput,
} from './order.schema';

export const ORDER_STORE = Symbol('ORDER_STORE');

export type OrderStatusValue =
  'DRAFT' | 'CONFIRMED' | 'FULFILLED' | 'COMPLETED' | 'ABANDONED' | 'CANCELLED';

export interface OrderRecord {
  readonly id: string;
  readonly merchantId: string;
  readonly customerId: string;
  readonly status: OrderStatusValue;
  readonly customerNameSnapshot: string | null;
  readonly customerPhoneSnapshot: string;
  readonly deliveryLocationId: string | null;
  readonly deliveryAreaSnapshot: string | null;
  readonly deliveryLandmarkSnapshot: string | null;
  readonly deliveryPhoneSnapshot: string | null;
  readonly deliveryInstructionsSnapshot: string | null;
  readonly deliveryMapPinUrlSnapshot: string | null;
  readonly currency: string | null;
  readonly subtotal: bigint;
  readonly requestHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly abandonedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly stockHoldExpiresAt: Date | null;
  readonly confirmationIdempotencyKey: string | null;
  readonly confirmationRequestHash: string | null;
}

export interface OrderItemStockHoldRecord {
  readonly id: string;
  readonly quantity: bigint;
  readonly status: 'ACTIVE' | 'RELEASED' | 'EXPIRED';
  readonly expiresAt: Date;
  readonly releasedAt: Date | null;
  readonly expiredAt: Date | null;
}

export interface OrderItemRecord {
  readonly id: string;
  readonly variantId: string;
  readonly productNameSnapshot: string;
  readonly skuSnapshot: string;
  readonly sizeSnapshot: string | null;
  readonly colourSnapshot: string | null;
  readonly quantity: bigint;
  readonly unitSellingPrice: bigint;
  readonly currency: string;
  readonly lineTotal: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly stockHolds: readonly OrderItemStockHoldRecord[];
}

export interface OrderListResult {
  readonly rows: readonly OrderRecord[];
  readonly total: number;
}

export interface CreateOrderCommand extends CreateOrderInput {
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

export interface ConfirmOrderCommand extends ConfirmOrderInput {
  readonly expiresAtDate: Date;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly now: Date;
}

export interface OrderStore {
  create(merchantId: string, command: CreateOrderCommand): Promise<OrderRecord>;
  list(merchantId: string, query: OrderListQuery): Promise<OrderListResult>;
  find(merchantId: string, orderId: string): Promise<OrderRecord | null>;
  patch(
    merchantId: string,
    orderId: string,
    patch: OrderPatchInput,
  ): Promise<OrderRecord | null>;
  replaceItems(
    merchantId: string,
    orderId: string,
    input: ReplaceOrderItemsInput,
  ): Promise<{ order: OrderRecord; items: readonly OrderItemRecord[] } | null>;
  listItems(
    merchantId: string,
    orderId: string,
  ): Promise<{ order: OrderRecord; items: readonly OrderItemRecord[] } | null>;
  confirm(
    merchantId: string,
    orderId: string,
    command: ConfirmOrderCommand,
  ): Promise<OrderRecord | null>;
  transition(
    merchantId: string,
    orderId: string,
    target: 'ABANDONED' | 'CANCELLED',
  ): Promise<OrderRecord | null>;
}

export class OrderIdempotencyConflictError extends Error {}
export class OrderReferenceUnavailableError extends Error {}
export class OrderNotEditableError extends Error {}
export class OrderInvalidTransitionError extends Error {}
export class OrderItemIneligibleError extends Error {}
export class OrderCurrencyMismatchError extends Error {}
export class OrderArithmeticOverflowError extends Error {}
export class OrderConfirmationConflictError extends Error {}
export class OrderEmptyError extends Error {}
export class OrderInsufficientSellableInventoryError extends Error {}
