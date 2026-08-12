import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { DatabaseService } from '../database/database.service';
import { inventoryRequestHash } from './inventory-idempotency';
import {
  InsufficientSellableInventoryError,
  InventoryIdempotencyConflictError,
  InventoryReservedByHoldsError,
  InsufficientAvailableStockError,
  StockHoldIdempotencyConflictError,
} from './inventory.store';
import { PrismaInventoryStore } from './prisma-inventory.store';
import { stockHoldRequestHash } from './stock-hold-idempotency';

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

function holdCommand(
  variantId: string,
  quantity: bigint,
  key: string = randomUUID(),
  expiresAt = new Date(Date.now() + 3_600_000),
) {
  const normalized = {
    quantity: quantity.toString(),
    expiresAt: expiresAt.toISOString(),
  };
  return {
    variantId,
    quantity,
    expiresAt,
    idempotencyKey: key,
    requestHash: stockHoldRequestHash(variantId, normalized),
    now: new Date(),
  };
}

async function cleanup(): Promise<void> {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const merchantIds = merchants.map(({ id }) => id);
  await client.stockHold.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
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

void test('holds reduce sellable stock without changing physical balance or ledger', async () => {
  const { merchant, variant } = await fixture('Hold projection');
  await store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 10n));
  const hold = await store.createStockHold(
    merchant.id,
    holdCommand(variant.id, 4n),
  );
  assert.equal(hold.status, 'ACTIVE');
  const inventory = await store.getInventory(merchant.id, variant.id);
  assert.deepEqual(
    [inventory?.availableQuantity, inventory?.heldQuantity],
    [10n, 4n],
  );
  assert.equal(
    await client.inventoryLedgerEntry.count({
      where: { merchantId: merchant.id, variantId: variant.id },
    }),
    1,
  );
  await assert.rejects(
    () => store.createStockHold(merchant.id, holdCommand(variant.id, 7n)),
    InsufficientSellableInventoryError,
  );
  await assert.rejects(
    () =>
      store.applyMovement(
        merchant.id,
        command(variant.id, 'ADJUSTMENT_OUT', 7n),
      ),
    InventoryReservedByHoldsError,
  );
  assert.equal(
    (await store.getInventory(merchant.id, variant.id))?.availableQuantity,
    10n,
  );
  assert.equal(
    await client.inventoryLedgerEntry.count({
      where: { merchantId: merchant.id, variantId: variant.id },
    }),
    1,
  );
});

void test('exact hold capacity succeeds and inbound movements increase sellable stock', async () => {
  const { merchant, variant } = await fixture('Exact capacity');
  await store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 10n));
  await store.createStockHold(merchant.id, holdCommand(variant.id, 7n));
  await store.createStockHold(merchant.id, holdCommand(variant.id, 3n));
  let inventory = await store.getInventory(merchant.id, variant.id);
  assert.deepEqual(
    [inventory?.availableQuantity, inventory?.heldQuantity],
    [10n, 10n],
  );
  await store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 5n));
  await store.applyMovement(
    merchant.id,
    command(variant.id, 'ADJUSTMENT_IN', 2n),
  );
  inventory = await store.getInventory(merchant.id, variant.id);
  assert.deepEqual(
    [inventory?.availableQuantity, inventory?.heldQuantity],
    [17n, 10n],
  );
});

void test('missing balance means zero capacity and creates neither hold nor projection', async () => {
  const { merchant, variant } = await fixture('Missing balance hold');
  await assert.rejects(
    () => store.createStockHold(merchant.id, holdCommand(variant.id, 1n)),
    InsufficientSellableInventoryError,
  );
  assert.equal(
    await client.stockHold.count({ where: { merchantId: merchant.id } }),
    0,
  );
  assert.equal(
    await client.inventoryBalance.count({ where: { merchantId: merchant.id } }),
    0,
  );
});

void test('database enforces StockHold quantity, hash, lifecycle, idempotency, and tenant FK', async () => {
  const a = await fixture('DB constraints A');
  const b = await fixture('DB constraints B');
  const base = {
    merchantId: a.merchant.id,
    variantId: a.variant.id,
    quantity: 1n,
    expiresAt: new Date(Date.now() + 60_000),
    idempotencyKey: randomUUID(),
    requestHash: 'a'.repeat(64),
  };
  await assert.rejects(() =>
    client.stockHold.create({ data: { ...base, quantity: 0n } }),
  );
  await assert.rejects(() =>
    client.stockHold.create({ data: { ...base, requestHash: 'A'.repeat(64) } }),
  );
  await assert.rejects(() =>
    client.stockHold.create({
      data: { ...base, status: 'RELEASED', releasedAt: null },
    }),
  );
  await assert.rejects(() =>
    client.stockHold.create({
      data: { ...base, variantId: b.variant.id },
    }),
  );
  await client.stockHold.create({ data: base });
  await assert.rejects(() => client.stockHold.create({ data: base }));
});

void test('hold replay is tenant-local, mismatch conflicts, and concurrent holds cannot oversell', async () => {
  const a = await fixture('Hold idempotency A');
  const b = await fixture('Hold idempotency B');
  await Promise.all([
    store.applyMovement(a.merchant.id, command(a.variant.id, 'RECEIPT', 10n)),
    store.applyMovement(b.merchant.id, command(b.variant.id, 'RECEIPT', 10n)),
  ]);
  const key = 'Hold-Opaque-Key';
  const firstCommand = holdCommand(a.variant.id, 6n, key);
  const [first, replay] = await Promise.all([
    store.createStockHold(a.merchant.id, firstCommand),
    store.createStockHold(a.merchant.id, firstCommand),
  ]);
  assert.equal(first.id, replay.id);
  await assert.rejects(
    () =>
      store.createStockHold(
        a.merchant.id,
        holdCommand(a.variant.id, 5n, key, firstCommand.expiresAt),
      ),
    StockHoldIdempotencyConflictError,
  );
  await store.createStockHold(
    b.merchant.id,
    holdCommand(b.variant.id, 1n, key, firstCommand.expiresAt),
  );
  const results = await Promise.allSettled([
    store.createStockHold(a.merchant.id, holdCommand(a.variant.id, 4n)),
    store.createStockHold(a.merchant.id, holdCommand(a.variant.id, 4n)),
  ]);
  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(
    (await store.getInventory(a.merchant.id, a.variant.id))?.heldQuantity,
    10n,
  );
});

void test('concurrent 7-unit holds against 10 units produce exactly one hold and 3 sellable', async () => {
  const { merchant, variant } = await fixture('Required concurrent holds');
  await store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 10n));
  const results = await Promise.allSettled([
    store.createStockHold(merchant.id, holdCommand(variant.id, 7n)),
    store.createStockHold(merchant.id, holdCommand(variant.id, 7n)),
  ]);
  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  const inventory = await store.getInventory(merchant.id, variant.id);
  assert.deepEqual(
    [inventory?.availableQuantity, inventory?.heldQuantity],
    [10n, 7n],
  );
  assert.equal(
    await client.stockHold.count({
      where: { merchantId: merchant.id, variantId: variant.id },
    }),
    1,
  );
});

void test('release, effective expiry, expiry updates, and processor never mutate inventory', async () => {
  const { merchant, variant } = await fixture('Hold lifecycle');
  await store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 8n));
  const active = await store.createStockHold(
    merchant.id,
    holdCommand(variant.id, 3n),
  );
  const updatedExpiry = new Date(Date.now() + 120_000);
  const updated = await store.updateStockHoldExpiry(
    merchant.id,
    variant.id,
    active.id,
    updatedExpiry,
    new Date(),
  );
  assert.equal(updated?.expiresAt.getTime(), updatedExpiry.getTime());
  const identical = await store.updateStockHoldExpiry(
    merchant.id,
    variant.id,
    active.id,
    updatedExpiry,
    new Date(),
  );
  assert.equal(identical?.updatedAt.getTime(), updated?.updatedAt.getTime());
  const released = await store.releaseStockHold(
    merchant.id,
    variant.id,
    active.id,
    new Date(),
  );
  assert.equal(released?.status, 'RELEASED');
  assert.equal(
    (
      await store.releaseStockHold(
        merchant.id,
        variant.id,
        active.id,
        new Date(),
      )
    )?.id,
    active.id,
  );
  const due = await store.createStockHold(
    merchant.id,
    holdCommand(variant.id, 2n),
  );
  await client.stockHold.update({
    where: { id: due.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expiredList = await store.listStockHolds(
    merchant.id,
    variant.id,
    { status: 'EXPIRED', page: 1, pageSize: 20 },
    new Date(),
  );
  assert.equal(expiredList?.total, 1);
  assert.equal(
    (await store.getInventory(merchant.id, variant.id))?.heldQuantity,
    0n,
  );
  assert.equal(await store.expireDueStockHolds(new Date(), 10), 1);
  assert.equal(await store.expireDueStockHolds(new Date(), 10), 0);
  const persistedDue = await client.stockHold.findUniqueOrThrow({
    where: { id: due.id },
  });
  assert.equal(persistedDue.status, 'EXPIRED');
  assert.equal(
    persistedDue.expiredAt?.getTime(),
    persistedDue.expiresAt.getTime(),
  );
  assert.equal(
    (
      await client.inventoryBalance.findFirstOrThrow({
        where: { merchantId: merchant.id },
      })
    ).quantity,
    8n,
  );
  assert.equal(
    await client.inventoryLedgerEntry.count({
      where: { merchantId: merchant.id },
    }),
    1,
  );
});

void test('release after effective expiry persists EXPIRED and never RELEASED', async () => {
  const { merchant, variant } = await fixture('Release expired');
  await store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 5n));
  const hold = await store.createStockHold(
    merchant.id,
    holdCommand(variant.id, 2n),
  );
  const expiry = new Date(Date.now() - 1_000);
  await client.stockHold.update({
    where: { id: hold.id },
    data: { expiresAt: expiry },
  });
  const result = await store.releaseStockHold(
    merchant.id,
    variant.id,
    hold.id,
    new Date(),
  );
  assert.equal(result?.status, 'EXPIRED');
  assert.equal(result?.releasedAt, null);
  assert.equal(result?.expiredAt?.getTime(), expiry.getTime());
});

void test('holds are independent of Variant lifecycle, Product lifecycle, and pricing', async () => {
  const { merchant, product, variant } = await fixture('Lifecycle independent');
  await Promise.all([
    client.product.update({
      where: { id: product.id },
      data: { status: 'ARCHIVED' },
    }),
    client.productVariant.update({
      where: { id: variant.id },
      data: { status: 'INACTIVE' },
    }),
  ]);
  await store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 2n));
  const hold = await store.createStockHold(
    merchant.id,
    holdCommand(variant.id, 1n),
  );
  assert.equal(hold.status, 'ACTIVE');
  assert.equal(
    (
      await client.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      })
    ).sellingPrice,
    null,
  );
});

void test('hold creation and outbound adjustment serialize on one balance row', async () => {
  const { merchant, variant } = await fixture('Hold movement race');
  await store.applyMovement(merchant.id, command(variant.id, 'RECEIPT', 10n));
  const results = await Promise.allSettled([
    store.createStockHold(merchant.id, holdCommand(variant.id, 7n)),
    store.applyMovement(merchant.id, command(variant.id, 'ADJUSTMENT_OUT', 7n)),
  ]);
  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  const inventory = await store.getInventory(merchant.id, variant.id);
  assert.equal(
    (inventory?.availableQuantity ?? 0n) - (inventory?.heldQuantity ?? 0n) >=
      0n,
    true,
  );
});
