import type { InventoryLedgerQuery } from './inventory-ledger-query.schema';
import type { InventoryListQuery } from './inventory-query.schema';

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
}
