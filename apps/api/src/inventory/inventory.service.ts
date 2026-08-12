import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import { inventoryRequestHash } from './inventory-idempotency';
import type { InventoryLedgerQuery } from './inventory-ledger-query.schema';
import type { InventoryMovementInput } from './inventory-movement.schema';
import type { InventoryListQuery } from './inventory-query.schema';
import { stockHoldRequestHash } from './stock-hold-idempotency';
import type { StockHoldListQuery } from './stock-hold-query.schema';
import type {
  CreateStockHoldInput,
  UpdateStockHoldExpiryInput,
} from './stock-hold.schema';
import {
  INVENTORY_STORE,
  InventoryIdempotencyConflictError,
  type InventoryIdentityRecord,
  type InventoryMovementRecord,
  type InventoryStore,
  InventoryVariantNotFoundError,
  InsufficientAvailableStockError,
  InsufficientSellableInventoryError,
  InventoryReservedByHoldsError,
  StockHoldIdempotencyConflictError,
  StockHoldNotActiveError,
  type StockHoldRecord,
} from './inventory.store';

@Injectable()
export class InventoryService {
  public constructor(
    @Inject(INVENTORY_STORE) private readonly store: InventoryStore,
  ) {}

  public async list(
    context: ResolvedMerchantContext,
    query: InventoryListQuery,
  ) {
    const result = await this.store.listInventory(context.merchant.id, query);
    return {
      items: result.rows.map((row) => this.mapInventory(row)),
      pagination: this.pagination(query, result.total),
    };
  }

  public async detail(context: ResolvedMerchantContext, variantId: string) {
    const record = await this.store.getInventory(
      context.merchant.id,
      variantId,
    );
    if (record === null) throw new NotFoundException('Not found.');
    return this.mapInventory(record);
  }

  public async ledger(
    context: ResolvedMerchantContext,
    variantId: string,
    query: InventoryLedgerQuery,
  ) {
    const result = await this.store.listLedger(
      context.merchant.id,
      variantId,
      query,
    );
    if (result === null) throw new NotFoundException('Not found.');
    return {
      movements: result.rows.map((row) => this.mapMovement(row)),
      pagination: this.pagination(query, result.total),
    };
  }

  public async applyMovement(
    context: ResolvedMerchantContext,
    variantId: string,
    input: InventoryMovementInput,
    idempotencyKey: string,
  ) {
    const entering = input.type !== 'ADJUSTMENT_OUT';
    const requestHash = inventoryRequestHash(variantId, input);
    try {
      const movement = await this.store.applyMovement(context.merchant.id, {
        variantId,
        type: input.type,
        quantity: BigInt(input.quantity),
        fromState: entering ? null : 'AVAILABLE',
        toState: entering ? 'AVAILABLE' : null,
        note: input.note,
        idempotencyKey,
        requestHash,
      });
      return this.mapMovement(movement);
    } catch (error: unknown) {
      if (error instanceof InventoryVariantNotFoundError) {
        throw new NotFoundException('Not found.');
      }
      if (error instanceof InsufficientAvailableStockError) {
        throw new UnprocessableEntityException('Insufficient available stock.');
      }
      if (error instanceof InventoryReservedByHoldsError) {
        throw new UnprocessableEntityException(
          'Inventory is reserved by active stock holds.',
        );
      }
      if (error instanceof InventoryIdempotencyConflictError) {
        throw new ConflictException('Idempotency key conflict.');
      }
      throw error;
    }
  }

  public async listHolds(
    context: ResolvedMerchantContext,
    variantId: string,
    query: StockHoldListQuery,
  ) {
    const now = new Date();
    const result = await this.store.listStockHolds(
      context.merchant.id,
      variantId,
      query,
      now,
    );
    if (result === null) throw new NotFoundException('Not found.');
    return {
      holds: result.rows.map((hold) => this.mapHold(hold, now)),
      pagination: this.pagination(query, result.total),
    };
  }

  public async holdDetail(
    context: ResolvedMerchantContext,
    variantId: string,
    holdId: string,
  ) {
    const now = new Date();
    const hold = await this.store.getStockHold(
      context.merchant.id,
      variantId,
      holdId,
    );
    if (hold === null) throw new NotFoundException('Not found.');
    return this.mapHold(hold, now);
  }

  public async createHold(
    context: ResolvedMerchantContext,
    variantId: string,
    input: CreateStockHoldInput,
    idempotencyKey: string,
  ) {
    const now = new Date();
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt <= now) {
      throw new UnprocessableEntityException(
        'Hold expiry must be in the future.',
      );
    }
    try {
      const hold = await this.store.createStockHold(context.merchant.id, {
        variantId,
        quantity: BigInt(input.quantity),
        expiresAt,
        idempotencyKey,
        requestHash: stockHoldRequestHash(variantId, input),
        now,
      });
      return this.mapHold(hold, now);
    } catch (error: unknown) {
      if (error instanceof InventoryVariantNotFoundError) {
        throw new NotFoundException('Not found.');
      }
      if (error instanceof InsufficientSellableInventoryError) {
        throw new UnprocessableEntityException(
          'Insufficient sellable inventory.',
        );
      }
      if (error instanceof StockHoldIdempotencyConflictError) {
        throw new ConflictException('Idempotency key conflict.');
      }
      throw error;
    }
  }

  public async updateHoldExpiry(
    context: ResolvedMerchantContext,
    variantId: string,
    holdId: string,
    input: UpdateStockHoldExpiryInput,
  ) {
    const now = new Date();
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt <= now) {
      throw new UnprocessableEntityException(
        'Hold expiry must be in the future.',
      );
    }
    try {
      const hold = await this.store.updateStockHoldExpiry(
        context.merchant.id,
        variantId,
        holdId,
        expiresAt,
        now,
      );
      if (hold === null) throw new NotFoundException('Not found.');
      return this.mapHold(hold, now);
    } catch (error: unknown) {
      if (error instanceof StockHoldNotActiveError) {
        throw new UnprocessableEntityException(
          'Only active stock holds may be updated.',
        );
      }
      throw error;
    }
  }

  public async releaseHold(
    context: ResolvedMerchantContext,
    variantId: string,
    holdId: string,
  ) {
    const now = new Date();
    const hold = await this.store.releaseStockHold(
      context.merchant.id,
      variantId,
      holdId,
      now,
    );
    if (hold === null) throw new NotFoundException('Not found.');
    return this.mapHold(hold, now);
  }

  private mapInventory(record: InventoryIdentityRecord) {
    return {
      variant: record.variant,
      product: record.product,
      availableQuantity: record.availableQuantity.toString(),
      heldQuantity: record.heldQuantity.toString(),
      sellableQuantity: (
        record.availableQuantity - record.heldQuantity
      ).toString(),
      inventoryUpdatedAt: record.inventoryUpdatedAt?.toISOString() ?? null,
    };
  }

  private mapHold(record: StockHoldRecord, now: Date) {
    const effectivelyExpired =
      record.status === 'ACTIVE' && record.expiresAt <= now;
    return {
      id: record.id,
      variantId: record.variantId,
      quantity: record.quantity.toString(),
      status: effectivelyExpired ? 'EXPIRED' : record.status,
      expiresAt: record.expiresAt.toISOString(),
      releasedAt: record.releasedAt?.toISOString() ?? null,
      expiredAt:
        record.expiredAt?.toISOString() ??
        (effectivelyExpired ? record.expiresAt.toISOString() : null),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private mapMovement(record: InventoryMovementRecord) {
    const availableAfter =
      record.toState === 'AVAILABLE'
        ? record.toStateBalanceAfter
        : record.fromStateBalanceAfter;
    if (availableAfter === null) {
      throw new Error('Movement has no AVAILABLE balance snapshot.');
    }
    return {
      id: record.id,
      variantId: record.variantId,
      type: record.type,
      quantity: record.quantity.toString(),
      fromState: record.fromState,
      toState: record.toState,
      availableAfter: availableAfter.toString(),
      note: record.note,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private pagination(
    query: { readonly page: number; readonly pageSize: number },
    total: number,
  ) {
    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
}
