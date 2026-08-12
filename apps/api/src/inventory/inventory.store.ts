import type { InventoryLedgerQuery } from './inventory-ledger-query.schema';
import type { InventoryListQuery } from './inventory-query.schema';
import type { StockHoldListQuery } from './stock-hold-query.schema';

export const INVENTORY_STORE = Symbol('INVENTORY_STORE');

export type InventoryMovementType =
  'RECEIPT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
export type InventoryState = 'AVAILABLE';

export interface InventoryIdentityRecord {
  readonly variant: {
    readonly id: string;
    readonly productId: string;
    readonly sku: string;
    readonly barcode: string | null;
    readonly size: string | null;
    readonly colour: string | null;
    readonly status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  };
  readonly product: {
    readonly id: string;
    readonly name: string;
    readonly status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  };
  readonly availableQuantity: bigint;
  readonly heldQuantity: bigint;
  readonly inventoryUpdatedAt: Date | null;
}

export interface InventoryListResult {
  readonly rows: readonly InventoryIdentityRecord[];
  readonly total: number;
}

export interface InventoryMovementRecord {
  readonly id: string;
  readonly variantId: string;
  readonly type: InventoryMovementType;
  readonly quantity: bigint;
  readonly fromState: InventoryState | null;
  readonly toState: InventoryState | null;
  readonly fromStateBalanceAfter: bigint | null;
  readonly toStateBalanceAfter: bigint | null;
  readonly note: string | null;
  readonly requestHash: string;
  readonly createdAt: Date;
}

export interface InventoryLedgerResult {
  readonly rows: readonly InventoryMovementRecord[];
  readonly total: number;
}

export interface ApplyMovementCommand {
  readonly variantId: string;
  readonly type: InventoryMovementType;
  readonly quantity: bigint;
  readonly fromState: InventoryState | null;
  readonly toState: InventoryState | null;
  readonly note: string | null;
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

export class InventoryVariantNotFoundError extends Error {}
export class InsufficientAvailableStockError extends Error {}
export class InventoryIdempotencyConflictError extends Error {}
export class InsufficientSellableInventoryError extends Error {}
export class InventoryReservedByHoldsError extends Error {}
export class StockHoldIdempotencyConflictError extends Error {}
export class StockHoldNotActiveError extends Error {}
export class OrderManagedStockHoldError extends Error {}

export type StockHoldStatus = 'ACTIVE' | 'RELEASED' | 'EXPIRED';

export interface StockHoldRecord {
  readonly id: string;
  readonly variantId: string;
  readonly orderItemId: string | null;
  readonly quantity: bigint;
  readonly status: StockHoldStatus;
  readonly expiresAt: Date;
  readonly releasedAt: Date | null;
  readonly expiredAt: Date | null;
  readonly requestHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StockHoldListResult {
  readonly rows: readonly StockHoldRecord[];
  readonly total: number;
}

export interface CreateStockHoldCommand {
  readonly variantId: string;
  readonly quantity: bigint;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly now: Date;
}

export interface InventoryStore {
  listInventory(
    merchantId: string,
    query: InventoryListQuery,
  ): Promise<InventoryListResult>;
  getInventory(
    merchantId: string,
    variantId: string,
  ): Promise<InventoryIdentityRecord | null>;
  listLedger(
    merchantId: string,
    variantId: string,
    query: InventoryLedgerQuery,
  ): Promise<InventoryLedgerResult | null>;
  applyMovement(
    merchantId: string,
    command: ApplyMovementCommand,
  ): Promise<InventoryMovementRecord>;
  listStockHolds(
    merchantId: string,
    variantId: string,
    query: StockHoldListQuery,
    now: Date,
  ): Promise<StockHoldListResult | null>;
  getStockHold(
    merchantId: string,
    variantId: string,
    holdId: string,
  ): Promise<StockHoldRecord | null>;
  createStockHold(
    merchantId: string,
    command: CreateStockHoldCommand,
  ): Promise<StockHoldRecord>;
  releaseStockHold(
    merchantId: string,
    variantId: string,
    holdId: string,
    now: Date,
  ): Promise<StockHoldRecord | null>;
  updateStockHoldExpiry(
    merchantId: string,
    variantId: string,
    holdId: string,
    expiresAt: Date,
    now: Date,
  ): Promise<StockHoldRecord | null>;
  expireDueStockHolds(now: Date, batchSize: number): Promise<number>;
}
