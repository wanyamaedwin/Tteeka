import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type { InventoryLedgerQuery } from './inventory-ledger-query.schema';
import type { InventoryListQuery } from './inventory-query.schema';
import {
  type ApplyMovementCommand,
  InventoryIdempotencyConflictError,
  type InventoryIdentityRecord,
  type InventoryLedgerResult,
  type InventoryListResult,
  type InventoryMovementRecord,
  type InventoryStore,
  InventoryVariantNotFoundError,
  InsufficientAvailableStockError,
} from './inventory.store';

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

function mapInventoryRow(row: {
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
}): InventoryIdentityRecord {
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
    const [total, rows] = await this.database.client.$transaction([
      this.database.client.productVariant.count({ where }),
      this.database.client.productVariant.findMany({
        where,
        select: inventorySelect,
        orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows: rows.map(mapInventoryRow), total };
  }

  public async getInventory(
    merchantId: string,
    variantId: string,
  ): Promise<InventoryIdentityRecord | null> {
    const row = await this.database.client.productVariant.findFirst({
      where: { merchantId, id: variantId },
      select: inventorySelect,
    });
    return row === null ? null : mapInventoryRow(row);
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

  private resolveReplay(
    record: InventoryMovementRecord,
    command: ApplyMovementCommand,
  ): InventoryMovementRecord {
    if (record.requestHash !== command.requestHash) {
      throw new InventoryIdempotencyConflictError();
    }
    return record;
  }
}
