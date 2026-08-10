import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { DatabaseService } from '../database/database.service';
import { inventoryRequestHash } from './inventory-idempotency';
import {
  InventoryIdempotencyConflictError,
  InsufficientAvailableStockError,
} from './inventory.store';
import { PrismaInventoryStore } from './prisma-inventory.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Inventory store tests require DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const store = new PrismaInventoryStore({ client } as DatabaseService);
const PREFIX = 'B4.1 Inventory Store Test';

async function fixture(label: string) {
  const merchant = await client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
  const product = await client.product.create({
    data: { merchantId: merchant.id, name: `${label} Product` },
  });
  const variant = await client.productVariant.create({
    data: {
      merchantId: merchant.id,
      productId: product.id,
      sku: `SKU-${randomUUID()}`,
    },
  });
  return { merchant, product, variant };
}

function command(
  variantId: string,
  type: 'RECEIPT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT',
  quantity: bigint,
  key: string = randomUUID(),
) {
  const entering = type !== 'ADJUSTMENT_OUT';
  const normalized = {
    type,
    quantity: quantity.toString(),
    note: type === 'RECEIPT' ? null : 'Synthetic correction',
  } as const;
  return {
    variantId,
    type,
    quantity,
    fromState: entering ? null : ('AVAILABLE' as const),
    toState: entering ? ('AVAILABLE' as const) : null,
    note: normalized.note,
    idempotencyKey: key,
    requestHash: inventoryRequestHash(variantId, normalized),
  };
}

async function cleanup(): Promise<void> {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const merchantIds = merchants.map(({ id }) => id);
  await client.inventoryLedgerEntry.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.inventoryBalance.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.productVariant.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.product.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.merchant.deleteMany({ where: { id: { in: merchantIds } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('zero-history Variants list/detail as zero without a balance row', async () => {
  const { merchant, variant } = await fixture('Zero');
  const detail = await store.getInventory(merchant.id, variant.id);
  assert.equal(detail?.availableQuantity, 0n);
  assert.equal(detail?.inventoryUpdatedAt, null);
  assert.equal(
    await client.inventoryBalance.count({ where: { merchantId: merchant.id } }),
    0,
  );
  const list = await store.listInventory(merchant.id, {
    page: 1,
    pageSize: 50,
  });
  assert.equal(list.total, 1);
  assert.equal(list.rows[0]?.availableQuantity, 0n);
});

void test('mixed movements keep an append-only ledger consistent with projection', async () => {
  const { merchant, variant } = await fixture('Mixed');
  const receipt = await store.applyMovement(
    merchant.id,
    command(variant.id, 'RECEIPT', 50n),
  );
  const outbound = await store.applyMovement(
    merchant.id,
    command(variant.id, 'ADJUSTMENT_OUT', 3n),
  );
  const inbound = await store.applyMovement(
    merchant.id,
    command(variant.id, 'ADJUSTMENT_IN', 2n),
  );
  assert.deepEqual(
    [
      receipt.toStateBalanceAfter,
      outbound.fromStateBalanceAfter,
      inbound.toStateBalanceAfter,
    ],
    [50n, 47n, 49n],
  );
  const balance = await client.inventoryBalance.findUniqueOrThrow({
    where: {
      merchantId_variantId_state: {
        merchantId: merchant.id,
        variantId: variant.id,
        state: 'AVAILABLE',
      },
    },
  });
  assert.equal(balance.quantity, 49n);
  const ledger = await store.listLedger(merchant.id, variant.id, {
    page: 1,
    pageSize: 50,
  });
  assert.deepEqual(
    ledger?.rows.map(({ type }) => type),
    ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RECEIPT'],
  );
  const sum = ledger.rows.reduce(
    (total, row) =>
      total + (row.type === 'ADJUSTMENT_OUT' ? -row.quantity : row.quantity),
    0n,
  );
  assert.equal(sum, balance.quantity);
});

void test('insufficient stock rolls back ledger and projection', async () => {
  const { merchant, variant } = await fixture('Negative');
  await store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 5n));
  await assert.rejects(
    () =>
      store.applyMovement(
        merchant.id,
        command(variant.id, 'ADJUSTMENT_OUT', 6n),
      ),
    InsufficientAvailableStockError,
  );
  assert.equal(
    (await store.getInventory(merchant.id, variant.id))?.availableQuantity,
    5n,
  );
  assert.equal(
    await client.inventoryLedgerEntry.count({
      where: { merchantId: merchant.id, variantId: variant.id },
    }),
    1,
  );
});

void test('idempotent replay has one effect; mismatch conflicts; same key is tenant-local', async () => {
  const a = await fixture('Idempotency A');
  const b = await fixture('Idempotency B');
  const key = 'Same-Opaque-Key';
  const firstCommand = command(a.variant.id, 'RECEIPT', 10n, key);
  const [first, replay] = await Promise.all([
    store.applyMovement(a.merchant.id, firstCommand),
    store.applyMovement(a.merchant.id, firstCommand),
  ]);
  assert.equal(first.id, replay.id);
  assert.equal(
    (await store.getInventory(a.merchant.id, a.variant.id))?.availableQuantity,
    10n,
  );
  assert.equal(
    await client.inventoryLedgerEntry.count({
      where: { merchantId: a.merchant.id },
    }),
    1,
  );
  await assert.rejects(
    () =>
      store.applyMovement(
        a.merchant.id,
        command(a.variant.id, 'RECEIPT', 20n, key),
      ),
    InventoryIdempotencyConflictError,
  );
  await store.applyMovement(
    b.merchant.id,
    command(b.variant.id, 'RECEIPT', 7n, key),
  );
  assert.equal(
    (await store.getInventory(b.merchant.id, b.variant.id))?.availableQuantity,
    7n,
  );
});

void test('concurrent receipts do not lose updates and lazily create one balance', async () => {
  const { merchant, variant } = await fixture('Concurrent receipt');
  await Promise.all([
    store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 10n)),
    store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 20n)),
  ]);
  assert.equal(
    (await store.getInventory(merchant.id, variant.id))?.availableQuantity,
    30n,
  );
  assert.equal(
    await client.inventoryBalance.count({
      where: { merchantId: merchant.id, variantId: variant.id },
    }),
    1,
  );
});

void test('concurrent outbound writes serialize and never make AVAILABLE negative', async () => {
  const { merchant, variant } = await fixture('Concurrent outbound');
  await store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 10n));
  const results = await Promise.allSettled([
    store.applyMovement(merchant.id, command(variant.id, 'ADJUSTMENT_OUT', 7n)),
    store.applyMovement(merchant.id, command(variant.id, 'ADJUSTMENT_OUT', 7n)),
  ]);
  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal(
    (await store.getInventory(merchant.id, variant.id))?.availableQuantity,
    3n,
  );
});
