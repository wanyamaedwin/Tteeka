import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type { InventoryLedgerQuery } from './inventory-ledger-query.schema';
import type { InventoryListQuery } from './inventory-query.schema';
import type { StockHoldListQuery } from './stock-hold-query.schema';
import {
  type ApplyMovementCommand,
  type CreateStockHoldCommand,
  InventoryIdempotencyConflictError,
  type InventoryIdentityRecord,
  type InventoryLedgerResult,
  type InventoryListResult,
  type InventoryMovementRecord,
  type InventoryStore,
  InventoryReservedByHoldsError,
  OrderManagedStockHoldError,
  InventoryVariantNotFoundError,
  InsufficientAvailableStockError,
  StockHoldIdempotencyConflictError,
  type StockHoldListResult,
  type StockHoldRecord,
  StockHoldNotActiveError,
} from './inventory.store';
import {
  allocateStockHoldsInTransaction,
  lockAvailableInventoryBalancesInTransaction,
} from './stock-hold-allocation';

const movementSelect = {
  id: true,
  variantId: true,
  type: true,
  quantity: true,
  fromState: true,
  toState: true,
  fromStateBalanceAfter: true,
  toStateBalanceAfter: true,
  note: true,
  requestHash: true,
  createdAt: true,
} as const;

const inventorySelect = {
  id: true,
  productId: true,
  sku: true,
  barcode: true,
  size: true,
  colour: true,
  status: true,
  product: { select: { id: true, name: true, status: true } },
  inventoryBalances: {
    where: { state: 'AVAILABLE' as const },
    select: { quantity: true, updatedAt: true },
    take: 1,
  },
} as const;

const holdSelect = {
  id: true,
  variantId: true,
  orderItemId: true,
  quantity: true,
  status: true,
  expiresAt: true,
  releasedAt: true,
  expiredAt: true,
  requestHash: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isIdempotencyUniqueViolation(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  return (
    !('meta' in error) ||
    JSON.stringify(error.meta).toLowerCase().includes('idempotency')
  );
}

function mapInventoryRow(
  row: {
    id: string;
    productId: string;
    sku: string;
    barcode: string | null;
    size: string | null;
    colour: string | null;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    product: {
      id: string;
      name: string;
      status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    };
    inventoryBalances: readonly { quantity: bigint; updatedAt: Date }[];
  },
  heldQuantity = 0n,
): InventoryIdentityRecord {
  const balance = row.inventoryBalances[0];
  return {
    variant: {
      id: row.id,
      productId: row.productId,
      sku: row.sku,
      barcode: row.barcode,
      size: row.size,
      colour: row.colour,
      status: row.status,
    },
    product: row.product,
    availableQuantity: balance?.quantity ?? 0n,
    heldQuantity,
    inventoryUpdatedAt: balance?.updatedAt ?? null,
  };
}

@Injectable()
export class PrismaInventoryStore implements InventoryStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async listInventory(
    merchantId: string,
    query: InventoryListQuery,
  ): Promise<InventoryListResult> {
    const where = {
      merchantId,
      ...(query.productId === undefined ? {} : { productId: query.productId }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { sku: { contains: query.q, mode: 'insensitive' as const } },
              { barcode: { contains: query.q, mode: 'insensitive' as const } },
              { size: { contains: query.q, mode: 'insensitive' as const } },
              { colour: { contains: query.q, mode: 'insensitive' as const } },
              {
                product: {
                  name: { contains: query.q, mode: 'insensitive' as const },
                },
              },
            ],
          }),
    };
    return this.database.client.$transaction(async (transaction) => {
      const [total, rows] = await Promise.all([
        transaction.productVariant.count({ where }),
        transaction.productVariant.findMany({
          where,
          select: inventorySelect,
          orderBy: [
            { product: { name: 'asc' } },
            { sku: 'asc' },
            { id: 'asc' },
          ],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      const variantIds = rows.map(({ id }) => id);
      const held =
        variantIds.length === 0
          ? []
          : await transaction.stockHold.groupBy({
              by: ['variantId'],
              where: {
                merchantId,
                variantId: { in: variantIds },
                status: 'ACTIVE',
                expiresAt: { gt: new Date() },
              },
              _sum: { quantity: true },
            });
      const heldByVariant = new Map(
        held.map((row) => [row.variantId, row._sum.quantity ?? 0n]),
      );
      return {
        rows: rows.map((row) =>
          mapInventoryRow(row, heldByVariant.get(row.id) ?? 0n),
        ),
        total,
      };
    });
  }

  public async getInventory(
    merchantId: string,
    variantId: string,
  ): Promise<InventoryIdentityRecord | null> {
    return this.database.client.$transaction(async (transaction) => {
      const row = await transaction.productVariant.findFirst({
        where: { merchantId, id: variantId },
        select: inventorySelect,
      });
      if (row === null) return null;
      const held = await transaction.stockHold.aggregate({
        where: {
          merchantId,
          variantId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        _sum: { quantity: true },
      });
      return mapInventoryRow(row, held._sum.quantity ?? 0n);
    });
  }

  public listLedger(
    merchantId: string,
    variantId: string,
    query: InventoryLedgerQuery,
  ): Promise<InventoryLedgerResult | null> {
    return this.database.client.$transaction(async (transaction) => {
      const variant = await transaction.productVariant.findFirst({
        where: { merchantId, id: variantId },
        select: { id: true },
      });
      if (variant === null) return null;
      const where = {
        merchantId,
        variantId,
        ...(query.type === undefined ? {} : { type: query.type }),
      };
      const [total, rows] = await Promise.all([
        transaction.inventoryLedgerEntry.count({ where }),
        transaction.inventoryLedgerEntry.findMany({
          where,
          select: movementSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return { rows, total };
    });
  }

  public async applyMovement(
    merchantId: string,
    command: ApplyMovementCommand,
  ): Promise<InventoryMovementRecord> {
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const replay = await transaction.inventoryLedgerEntry.findUnique({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: movementSelect,
        });
        if (replay !== null) return this.resolveReplay(replay, command);

        const variant = await transaction.productVariant.findUnique({
          where: { merchantId_id: { merchantId, id: command.variantId } },
          select: { id: true },
        });
        if (variant === null) throw new InventoryVariantNotFoundError();

        await transaction.$executeRaw`INSERT INTO "inventory_balances" ("merchant_id", "variant_id", "state", "quantity", "updated_at") VALUES (${merchantId}::uuid, ${command.variantId}::uuid, 'AVAILABLE'::inventory_state, 0, CURRENT_TIMESTAMP) ON CONFLICT ("merchant_id", "variant_id", "state") DO NOTHING`;
        const balances = await transaction.$queryRaw<
          readonly { quantity: bigint }[]
        >`SELECT "quantity" FROM "inventory_balances" WHERE "merchant_id" = ${merchantId}::uuid AND "variant_id" = ${command.variantId}::uuid AND "state" = 'AVAILABLE'::inventory_state FOR UPDATE`;
        const current = balances[0]?.quantity;
        if (current === undefined)
          throw new Error('Inventory balance missing.');

        const serializedReplay =
          await transaction.inventoryLedgerEntry.findUnique({
            where: {
              merchantId_idempotencyKey: {
                merchantId,
                idempotencyKey: command.idempotencyKey,
              },
            },
            select: movementSelect,
          });
        if (serializedReplay !== null) {
          return this.resolveReplay(serializedReplay, command);
        }

        const next =
          command.toState === 'AVAILABLE'
            ? current + command.quantity
            : current - command.quantity;
        if (next < 0n) throw new InsufficientAvailableStockError();
        if (command.type === 'ADJUSTMENT_OUT') {
          const held = await transaction.stockHold.aggregate({
            where: {
              merchantId,
              variantId: command.variantId,
              status: 'ACTIVE',
              expiresAt: { gt: new Date() },
            },
            _sum: { quantity: true },
          });
          if (next < (held._sum.quantity ?? 0n)) {
            throw new InventoryReservedByHoldsError();
          }
        }

        const movement = await transaction.inventoryLedgerEntry.create({
          data: {
            merchantId,
            variantId: command.variantId,
            type: command.type,
            quantity: command.quantity,
            fromState: command.fromState,
            toState: command.toState,
            fromStateBalanceAfter: command.fromState === null ? null : next,
            toStateBalanceAfter: command.toState === null ? null : next,
            note: command.note,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
          },
          select: movementSelect,
        });
        await transaction.inventoryBalance.update({
          where: {
            merchantId_variantId_state: {
              merchantId,
              variantId: command.variantId,
              state: 'AVAILABLE',
            },
          },
          data: { quantity: next },
        });
        return movement;
      });
    } catch (error: unknown) {
      if (!isIdempotencyUniqueViolation(error)) throw error;
      const replay = await this.database.client.inventoryLedgerEntry.findUnique(
        {
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: movementSelect,
        },
      );
      if (replay === null) throw error;
      return this.resolveReplay(replay, command);
    }
  }

  public listStockHolds(
    merchantId: string,
    variantId: string,
    query: StockHoldListQuery,
    now: Date,
  ): Promise<StockHoldListResult | null> {
    return this.database.client.$transaction(async (transaction) => {
      const variant = await transaction.productVariant.findUnique({
        where: { merchantId_id: { merchantId, id: variantId } },
        select: { id: true },
      });
      if (variant === null) return null;
      const effectiveFilter =
        query.status === 'ACTIVE'
          ? { status: 'ACTIVE' as const, expiresAt: { gt: now } }
          : query.status === 'EXPIRED'
            ? {
                OR: [
                  { status: 'EXPIRED' as const },
                  { status: 'ACTIVE' as const, expiresAt: { lte: now } },
                ],
              }
            : query.status === 'RELEASED'
              ? { status: 'RELEASED' as const }
              : {};
      const where = { merchantId, variantId, ...effectiveFilter };
      const [total, rows] = await Promise.all([
        transaction.stockHold.count({ where }),
        transaction.stockHold.findMany({
          where,
          select: holdSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return { rows, total };
    });
  }

  public getStockHold(
    merchantId: string,
    variantId: string,
    holdId: string,
  ): Promise<StockHoldRecord | null> {
    return this.database.client.stockHold.findFirst({
      where: { merchantId, variantId, id: holdId },
      select: holdSelect,
    });
  }

  public async createStockHold(
    merchantId: string,
    command: CreateStockHoldCommand,
  ): Promise<StockHoldRecord> {
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const replay = await transaction.stockHold.findUnique({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: holdSelect,
        });
        if (replay !== null) return this.resolveHoldReplay(replay, command);
        const variant = await transaction.productVariant.findUnique({
          where: { merchantId_id: { merchantId, id: command.variantId } },
          select: { id: true },
        });
        if (variant === null) throw new InventoryVariantNotFoundError();
        await lockAvailableInventoryBalancesInTransaction(
          transaction,
          merchantId,
          [command.variantId],
        );
        const serializedReplay = await transaction.stockHold.findUnique({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: holdSelect,
        });
        if (serializedReplay !== null) {
          return this.resolveHoldReplay(serializedReplay, command);
        }
        await allocateStockHoldsInTransaction(
          transaction,
          merchantId,
          [command],
          command.now,
        );
        return transaction.stockHold.findUniqueOrThrow({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: holdSelect,
        });
      });
    } catch (error: unknown) {
      if (!isIdempotencyUniqueViolation(error)) throw error;
      const replay = await this.database.client.stockHold.findUnique({
        where: {
          merchantId_idempotencyKey: {
            merchantId,
            idempotencyKey: command.idempotencyKey,
          },
        },
        select: holdSelect,
      });
      if (replay === null) throw error;
      return this.resolveHoldReplay(replay, command);
    }
  }

  public releaseStockHold(
    merchantId: string,
    variantId: string,
    holdId: string,
    now: Date,
  ): Promise<StockHoldRecord | null> {
    return this.database.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<readonly { id: string }[]>`
        SELECT "id" FROM "stock_holds" WHERE "merchant_id" = ${merchantId}::uuid AND "variant_id" = ${variantId}::uuid AND "id" = ${holdId}::uuid FOR UPDATE`;
      if (locked.length === 0) return null;
      const hold = await transaction.stockHold.findUniqueOrThrow({
        where: { id: holdId },
        select: holdSelect,
      });
      if (hold.orderItemId !== null) throw new OrderManagedStockHoldError();
      if (hold.status === 'RELEASED' || hold.status === 'EXPIRED') return hold;
      if (hold.expiresAt <= now) {
        return transaction.stockHold.update({
          where: { id: holdId },
          data: { status: 'EXPIRED', expiredAt: hold.expiresAt },
          select: holdSelect,
        });
      }
      return transaction.stockHold.update({
        where: { id: holdId },
        data: { status: 'RELEASED', releasedAt: now },
        select: holdSelect,
      });
    });
  }

  public updateStockHoldExpiry(
    merchantId: string,
    variantId: string,
    holdId: string,
    expiresAt: Date,
    now: Date,
  ): Promise<StockHoldRecord | null> {
    return this.database.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<readonly { id: string }[]>`
        SELECT "id" FROM "stock_holds" WHERE "merchant_id" = ${merchantId}::uuid AND "variant_id" = ${variantId}::uuid AND "id" = ${holdId}::uuid FOR UPDATE`;
      if (locked.length === 0) return null;
      const hold = await transaction.stockHold.findUniqueOrThrow({
        where: { id: holdId },
        select: holdSelect,
      });
      if (hold.orderItemId !== null) throw new OrderManagedStockHoldError();
      if (hold.status !== 'ACTIVE' || hold.expiresAt <= now) {
        throw new StockHoldNotActiveError();
      }
      if (hold.expiresAt.getTime() === expiresAt.getTime()) return hold;
      return transaction.stockHold.update({
        where: { id: holdId },
        data: { expiresAt },
        select: holdSelect,
      });
    });
  }

  public async expireDueStockHolds(
    now: Date,
    batchSize: number,
  ): Promise<number> {
    const rows = await this.database.client.$queryRaw<
      readonly { id: string }[]
    >`
      WITH due AS (
        SELECT "id" FROM "stock_holds"
        WHERE "status" = 'ACTIVE'::stock_hold_status AND "expires_at" <= ${now}
        ORDER BY "expires_at", "id" FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
      )
      UPDATE "stock_holds" AS h SET "status" = 'EXPIRED'::stock_hold_status,
        "expired_at" = h."expires_at", "updated_at" = CURRENT_TIMESTAMP
      FROM due WHERE h."id" = due."id" RETURNING h."id"`;
    return rows.length;
  }

  private resolveReplay(
    record: InventoryMovementRecord,
    command: ApplyMovementCommand,
  ): InventoryMovementRecord {
    if (record.requestHash !== command.requestHash) {
      throw new InventoryIdempotencyConflictError();
    }
    return record;
  }

  private resolveHoldReplay(
    record: StockHoldRecord,
    command: CreateStockHoldCommand,
  ): StockHoldRecord {
    if (record.requestHash !== command.requestHash) {
      throw new StockHoldIdempotencyConflictError();
    }
    return record;
  }
}
