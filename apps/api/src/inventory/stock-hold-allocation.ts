import type { Prisma } from '@tteeka/database';

import { InsufficientSellableInventoryError } from './inventory.store';

export interface StockHoldAllocation {
  readonly variantId: string;
  readonly orderItemId?: string;
  readonly quantity: bigint;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

export async function allocateStockHoldsInTransaction(
  transaction: Prisma.TransactionClient,
  merchantId: string,
  allocations: readonly StockHoldAllocation[],
  now: Date,
) {
  const variantIds = [
    ...new Set(allocations.map(({ variantId }) => variantId)),
  ].sort((left, right) => left.localeCompare(right));
  const physicalByVariant = await lockAvailableInventoryBalancesInTransaction(
    transaction,
    merchantId,
    variantIds,
  );

  const heldRows =
    variantIds.length === 0
      ? []
      : await transaction.stockHold.groupBy({
          by: ['variantId'],
          where: {
            merchantId,
            variantId: { in: variantIds },
            status: 'ACTIVE',
            expiresAt: { gt: now },
          },
          _sum: { quantity: true },
        });
  const heldByVariant = new Map(
    heldRows.map((row) => [row.variantId, row._sum.quantity ?? 0n]),
  );
  const requestedByVariant = new Map<string, bigint>();
  for (const allocation of allocations) {
    requestedByVariant.set(
      allocation.variantId,
      (requestedByVariant.get(allocation.variantId) ?? 0n) +
        allocation.quantity,
    );
  }
  for (const variantId of variantIds) {
    const sellable =
      (physicalByVariant.get(variantId) ?? 0n) -
      (heldByVariant.get(variantId) ?? 0n);
    if ((requestedByVariant.get(variantId) ?? 0n) > sellable) {
      throw new InsufficientSellableInventoryError();
    }
  }

  const created = [];
  for (const allocation of allocations) {
    created.push(
      await transaction.stockHold.create({
        data: {
          merchantId,
          variantId: allocation.variantId,
          ...(allocation.orderItemId === undefined
            ? {}
            : { orderItemId: allocation.orderItemId }),
          quantity: allocation.quantity,
          expiresAt: allocation.expiresAt,
          idempotencyKey: allocation.idempotencyKey,
          requestHash: allocation.requestHash,
        },
      }),
    );
  }
  return created;
}

export async function lockAvailableInventoryBalancesInTransaction(
  transaction: Prisma.TransactionClient,
  merchantId: string,
  variantIds: readonly string[],
): Promise<ReadonlyMap<string, bigint>> {
  const sortedVariantIds = [...new Set(variantIds)].sort((left, right) =>
    left.localeCompare(right),
  );
  const physicalByVariant = new Map<string, bigint>();
  for (const variantId of sortedVariantIds) {
    await transaction.$executeRaw`INSERT INTO "inventory_balances" ("merchant_id", "variant_id", "state", "quantity", "updated_at") VALUES (${merchantId}::uuid, ${variantId}::uuid, 'AVAILABLE'::inventory_state, 0, CURRENT_TIMESTAMP) ON CONFLICT ("merchant_id", "variant_id", "state") DO NOTHING`;
    const balances = await transaction.$queryRaw<
      readonly { quantity: bigint }[]
    >`
      SELECT "quantity" FROM "inventory_balances"
      WHERE "merchant_id" = ${merchantId}::uuid
        AND "variant_id" = ${variantId}::uuid
        AND "state" = 'AVAILABLE'::inventory_state
      FOR UPDATE`;
    const physical = balances[0]?.quantity;
    if (physical === undefined) throw new Error('Inventory balance missing.');
    physicalByVariant.set(variantId, physical);
  }
  return physicalByVariant;
}
