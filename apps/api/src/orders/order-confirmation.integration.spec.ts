import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { DatabaseService } from '../database/database.service';
import { inventoryRequestHash } from '../inventory/inventory-idempotency';
import { PrismaInventoryStore } from '../inventory/prisma-inventory.store';
import { stockHoldRequestHash } from '../inventory/stock-hold-idempotency';
import {
  OrderManagedStockHoldError,
  InventoryReservedByHoldsError,
  InsufficientSellableInventoryError,
} from '../inventory/inventory.store';
import {
  orderConfirmationRequestHash,
  orderCreateRequestHash,
} from './order-idempotency';
import { confirmOrderSchema, createOrderSchema } from './order.schema';
import {
  OrderConfirmationConflictError,
  OrderEmptyError,
  OrderInsufficientSellableInventoryError,
} from './order.store';
import { PrismaOrderStore } from './prisma-order.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Order confirmation tests require DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const database = { client } as DatabaseService;
const orders = new PrismaOrderStore(database);
const inventory = new PrismaInventoryStore(database);
const PREFIX = 'B6.2 Confirmation Test';
let phoneSequence = 30_000_000;

async function merchant(label: string) {
  return client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
}

async function customer(merchantId: string) {
  return client.customer.create({
    data: {
      merchantId,
      name: 'Confirmation Customer',
      phone: `+2567${phoneSequence++}`,
    },
  });
}

async function variant(merchantId: string, label: string, price = 1_000n) {
  const product = await client.product.create({
    data: { merchantId, name: `${label} Product` },
  });
  const item = await client.productVariant.create({
    data: {
      merchantId,
      productId: product.id,
      sku: `${label}-${randomUUID()}`.toUpperCase(),
      status: 'ACTIVE',
      sellingPrice: price,
      priceCurrency: 'UGX',
      priceUpdatedAt: new Date(),
    },
  });
  return { product, variant: item };
}

async function draft(merchantId: string, customerId: string) {
  const input = createOrderSchema.parse({ customerId });
  return orders.create(merchantId, {
    ...input,
    idempotencyKey: randomUUID(),
    requestHash: orderCreateRequestHash(input),
  });
}

async function setPhysical(
  merchantId: string,
  variantId: string,
  quantity: bigint,
) {
  return client.inventoryBalance.upsert({
    where: {
      merchantId_variantId_state: {
        merchantId,
        variantId,
        state: 'AVAILABLE',
      },
    },
    create: { merchantId, variantId, state: 'AVAILABLE', quantity },
    update: { quantity },
  });
}

function confirmation(
  merchantId: string,
  orderId: string,
  expiresAt: Date,
  key: string = randomUUID(),
) {
  const input = confirmOrderSchema.parse({
    expiresAt: expiresAt.toISOString(),
  });
  const now = new Date();
  return orders.confirm(merchantId, orderId, {
    ...input,
    expiresAtDate: new Date(input.expiresAt),
    idempotencyKey: key,
    requestHash: orderConfirmationRequestHash(orderId, input),
    now,
  });
}

async function cleanup() {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = merchants.map(({ id }) => id);
  await client.stockHold.deleteMany({ where: { merchantId: { in: ids } } });
  await client.inventoryLedgerEntry.deleteMany({
    where: { merchantId: { in: ids } },
  });
  await client.inventoryBalance.deleteMany({
    where: { merchantId: { in: ids } },
  });
  await client.orderItem.deleteMany({ where: { merchantId: { in: ids } } });
  await client.order.deleteMany({ where: { merchantId: { in: ids } } });
  await client.customer.deleteMany({ where: { merchantId: { in: ids } } });
  await client.variantPriceHistory.deleteMany({
    where: { merchantId: { in: ids } },
  });
  await client.productVariant.deleteMany({
    where: { merchantId: { in: ids } },
  });
  await client.product.deleteMany({ where: { merchantId: { in: ids } } });
  await client.merchant.deleteMany({ where: { id: { in: ids } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('confirmation is atomic, snapshot-preserving, replay-safe, and creates one private Hold per item', async () => {
  const owner = await merchant('Basic');
  const c = await customer(owner.id);
  const order = await draft(owner.id, c.id);
  const [a, b, d] = await Promise.all([
    variant(owner.id, 'A', 1_000n),
    variant(owner.id, 'B', 2_000n),
    variant(owner.id, 'C', 3_000n),
  ]);
  await orders.replaceItems(owner.id, order.id, {
    items: [
      { variantId: a.variant.id, quantity: '4' },
      { variantId: b.variant.id, quantity: '2' },
      { variantId: d.variant.id, quantity: '1' },
    ],
  });
  await Promise.all([
    setPhysical(owner.id, a.variant.id, 10n),
    setPhysical(owner.id, b.variant.id, 10n),
    setPhysical(owner.id, d.variant.id, 10n),
  ]);
  const snapshots = await orders.listItems(owner.id, order.id);
  await Promise.all([
    client.customer.update({ where: { id: c.id }, data: { name: 'Changed' } }),
    client.product.update({
      where: { id: a.product.id },
      data: { name: 'Changed Product', status: 'ARCHIVED' },
    }),
    client.productVariant.update({
      where: { id: a.variant.id },
      data: { status: 'ARCHIVED', sellingPrice: null, priceCurrency: null },
    }),
  ]);
  const expiresAt = new Date(Date.now() + 3_600_000);
  const key = 'Confirm-Basic';
  const confirmed = await confirmation(owner.id, order.id, expiresAt, key);
  assert.equal(confirmed?.status, 'CONFIRMED');
  assert.ok(confirmed?.confirmedAt instanceof Date);
  assert.equal(confirmed?.stockHoldExpiresAt?.getTime(), expiresAt.getTime());
  const holds = await client.stockHold.findMany({
    where: { merchantId: owner.id, orderItem: { orderId: order.id } },
    orderBy: { variantId: 'asc' },
  });
  assert.equal(holds.length, 3);
  assert.deepEqual(
    holds.map(({ quantity, expiresAt: expiry, status }) => [
      quantity,
      expiry.getTime(),
      status,
    ]),
    holds.map(({ quantity }) => [quantity, expiresAt.getTime(), 'ACTIVE']),
  );
  assert.equal(
    holds.every(({ orderItemId }) => orderItemId !== null),
    true,
  );
  const replay = await confirmation(owner.id, order.id, expiresAt, key);
  assert.equal(
    replay?.confirmedAt?.getTime(),
    confirmed?.confirmedAt?.getTime(),
  );
  assert.equal(
    await client.stockHold.count({ where: { merchantId: owner.id } }),
    3,
  );
  await assert.rejects(
    confirmation(owner.id, order.id, expiresAt, 'Different-Key'),
    OrderConfirmationConflictError,
  );
  const after = await orders.listItems(owner.id, order.id);
  assert.deepEqual(
    after?.items.map((item) => [
      item.productNameSnapshot,
      item.unitSellingPrice,
      item.quantity,
    ]),
    snapshots?.items.map((item) => [
      item.productNameSnapshot,
      item.unitSellingPrice,
      item.quantity,
    ]),
  );
  assert.equal(
    after?.items.every((item) => item.stockHolds.length === 1),
    true,
  );
  assert.equal(
    await client.inventoryLedgerEntry.count({
      where: { merchantId: owner.id },
    }),
    0,
  );
  assert.equal(
    (
      await client.inventoryBalance.findUniqueOrThrow({
        where: {
          merchantId_variantId_state: {
            merchantId: owner.id,
            variantId: a.variant.id,
            state: 'AVAILABLE',
          },
        },
      })
    ).quantity,
    10n,
  );
});

void test('empty and insufficient multi-item confirmation roll back every mutation', async () => {
  const owner = await merchant('Rollback');
  const c = await customer(owner.id);
  const empty = await draft(owner.id, c.id);
  await assert.rejects(
    confirmation(owner.id, empty.id, new Date(Date.now() + 3_600_000)),
    OrderEmptyError,
  );
  const order = await draft(owner.id, c.id);
  const [a, b] = await Promise.all([
    variant(owner.id, 'Enough'),
    variant(owner.id, 'Short'),
  ]);
  await orders.replaceItems(owner.id, order.id, {
    items: [
      { variantId: a.variant.id, quantity: '2' },
      { variantId: b.variant.id, quantity: '5' },
    ],
  });
  await Promise.all([
    setPhysical(owner.id, a.variant.id, 10n),
    setPhysical(owner.id, b.variant.id, 4n),
  ]);
  await assert.rejects(
    confirmation(owner.id, order.id, new Date(Date.now() + 3_600_000)),
    OrderInsufficientSellableInventoryError,
  );
  const persisted = await orders.find(owner.id, order.id);
  assert.deepEqual(
    [
      persisted?.status,
      persisted?.confirmedAt,
      persisted?.stockHoldExpiresAt,
      persisted?.confirmationIdempotencyKey,
    ],
    ['DRAFT', null, null, null],
  );
  assert.equal(
    await client.stockHold.count({ where: { merchantId: owner.id } }),
    0,
  );
});

void test('capacity counts generic active Holds but excludes released and due Holds', async () => {
  const owner = await merchant('Capacity');
  const c = await customer(owner.id);
  const exact = await draft(owner.id, c.id);
  const a = await variant(owner.id, 'Exact');
  await orders.replaceItems(owner.id, exact.id, {
    items: [{ variantId: a.variant.id, quantity: '3' }],
  });
  await setPhysical(owner.id, a.variant.id, 10n);
  await client.stockHold.create({
    data: {
      merchantId: owner.id,
      variantId: a.variant.id,
      quantity: 7n,
      expiresAt: new Date(Date.now() + 7_200_000),
      idempotencyKey: randomUUID(),
      requestHash: 'a'.repeat(64),
    },
  });
  await confirmation(owner.id, exact.id, new Date(Date.now() + 3_600_000));
  const active = await client.stockHold.aggregate({
    where: {
      merchantId: owner.id,
      variantId: a.variant.id,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
    _sum: { quantity: true },
  });
  assert.equal(active._sum.quantity, 10n);

  for (const [label, status, expiresAt] of [
    ['Due', 'ACTIVE', new Date(Date.now() - 1_000)],
    ['Released', 'RELEASED', new Date(Date.now() + 7_200_000)],
  ] as const) {
    const order = await draft(owner.id, c.id);
    const item = await variant(owner.id, label);
    await orders.replaceItems(owner.id, order.id, {
      items: [{ variantId: item.variant.id, quantity: '10' }],
    });
    await setPhysical(owner.id, item.variant.id, 10n);
    await client.stockHold.create({
      data: {
        merchantId: owner.id,
        variantId: item.variant.id,
        quantity: 7n,
        status,
        expiresAt,
        releasedAt: status === 'RELEASED' ? new Date() : null,
        idempotencyKey: randomUUID(),
        requestHash: 'b'.repeat(64),
      },
    });
    assert.equal(
      (await confirmation(owner.id, order.id, new Date(Date.now() + 3_600_000)))
        ?.status,
      'CONFIRMED',
    );
  }
});

void test('concurrent confirmations preserve capacity, exact replay, and deterministic multi-variant locking', async () => {
  const owner = await merchant('Concurrency');
  const c = await customer(owner.id);
  const scarce = await variant(owner.id, 'Scarce');
  await setPhysical(owner.id, scarce.variant.id, 10n);
  const [a, b] = await Promise.all([
    draft(owner.id, c.id),
    draft(owner.id, c.id),
  ]);
  await Promise.all([
    orders.replaceItems(owner.id, a.id, {
      items: [{ variantId: scarce.variant.id, quantity: '7' }],
    }),
    orders.replaceItems(owner.id, b.id, {
      items: [{ variantId: scarce.variant.id, quantity: '7' }],
    }),
  ]);
  const expiry = new Date(Date.now() + 3_600_000);
  const results = await Promise.allSettled([
    confirmation(owner.id, a.id, expiry),
    confirmation(owner.id, b.id, expiry),
  ]);
  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(
    await client.stockHold
      .aggregate({
        where: {
          merchantId: owner.id,
          variantId: scarce.variant.id,
          status: 'ACTIVE',
        },
        _sum: { quantity: true },
      })
      .then((value) => value._sum.quantity),
    7n,
  );

  const same = await draft(owner.id, c.id);
  const roomy = await variant(owner.id, 'Replay');
  await setPhysical(owner.id, roomy.variant.id, 20n);
  await orders.replaceItems(owner.id, same.id, {
    items: [{ variantId: roomy.variant.id, quantity: '2' }],
  });
  const key = 'Concurrent-Replay';
  const replayResults = await Promise.all([
    confirmation(owner.id, same.id, expiry, key),
    confirmation(owner.id, same.id, expiry, key),
  ]);
  assert.equal(
    replayResults[0]?.confirmedAt?.getTime(),
    replayResults[1]?.confirmedAt?.getTime(),
  );
  assert.equal(
    await client.stockHold.count({
      where: { merchantId: owner.id, orderItem: { orderId: same.id } },
    }),
    1,
  );

  const [v1, v2] = await Promise.all([
    variant(owner.id, 'Lock-A'),
    variant(owner.id, 'Lock-B'),
  ]);
  await Promise.all([
    setPhysical(owner.id, v1.variant.id, 20n),
    setPhysical(owner.id, v2.variant.id, 20n),
  ]);
  const [left, right] = await Promise.all([
    draft(owner.id, c.id),
    draft(owner.id, c.id),
  ]);
  await Promise.all([
    orders.replaceItems(owner.id, left.id, {
      items: [
        { variantId: v1.variant.id, quantity: '3' },
        { variantId: v2.variant.id, quantity: '4' },
      ],
    }),
    orders.replaceItems(owner.id, right.id, {
      items: [
        { variantId: v2.variant.id, quantity: '3' },
        { variantId: v1.variant.id, quantity: '4' },
      ],
    }),
  ]);
  const both = await Promise.all([
    confirmation(owner.id, left.id, expiry),
    confirmation(owner.id, right.id, expiry),
  ]);
  assert.deepEqual(
    both.map((value) => value?.status),
    ['CONFIRMED', 'CONFIRMED'],
  );
});

void test('confirmation serializes against generic Holds and ADJUSTMENT_OUT', async () => {
  const owner = await merchant('Inventory Race');
  const c = await customer(owner.id);
  const expiry = new Date(Date.now() + 3_600_000);

  const holdVariant = await variant(owner.id, 'Generic Race');
  const holdOrder = await draft(owner.id, c.id);
  await setPhysical(owner.id, holdVariant.variant.id, 10n);
  await orders.replaceItems(owner.id, holdOrder.id, {
    items: [{ variantId: holdVariant.variant.id, quantity: '7' }],
  });
  const holdInput = { quantity: '7', expiresAt: expiry.toISOString() };
  const holdRace = await Promise.allSettled([
    confirmation(owner.id, holdOrder.id, expiry),
    inventory.createStockHold(owner.id, {
      variantId: holdVariant.variant.id,
      quantity: 7n,
      expiresAt: expiry,
      idempotencyKey: randomUUID(),
      requestHash: stockHoldRequestHash(holdVariant.variant.id, holdInput),
      now: new Date(),
    }),
  ]);
  assert.equal(
    holdRace.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(
    holdRace.some(
      (result) =>
        result.status === 'rejected' &&
        (result.reason instanceof InsufficientSellableInventoryError ||
          result.reason instanceof OrderInsufficientSellableInventoryError),
    ),
    true,
  );

  const movementVariant = await variant(owner.id, 'Movement Race');
  const movementOrder = await draft(owner.id, c.id);
  await setPhysical(owner.id, movementVariant.variant.id, 10n);
  await orders.replaceItems(owner.id, movementOrder.id, {
    items: [{ variantId: movementVariant.variant.id, quantity: '7' }],
  });
  const movementInput = {
    type: 'ADJUSTMENT_OUT' as const,
    quantity: '7',
    note: null,
  };
  const movementRace = await Promise.allSettled([
    confirmation(owner.id, movementOrder.id, expiry),
    inventory.applyMovement(owner.id, {
      variantId: movementVariant.variant.id,
      type: 'ADJUSTMENT_OUT',
      quantity: 7n,
      fromState: 'AVAILABLE',
      toState: null,
      note: null,
      idempotencyKey: randomUUID(),
      requestHash: inventoryRequestHash(
        movementVariant.variant.id,
        movementInput,
      ),
    }),
  ]);
  assert.equal(
    movementRace.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(
    movementRace.some(
      (result) =>
        result.status === 'rejected' &&
        (result.reason instanceof InventoryReservedByHoldsError ||
          result.reason instanceof OrderInsufficientSellableInventoryError),
    ),
    true,
  );
});

void test('confirmed cancellation releases active Holds, expires due Holds, replays, and generic mutation is blocked', async () => {
  const owner = await merchant('Cancel');
  const c = await customer(owner.id);
  const order = await draft(owner.id, c.id);
  const [activeVariant, dueVariant] = await Promise.all([
    variant(owner.id, 'Active'),
    variant(owner.id, 'Due'),
  ]);
  await Promise.all([
    setPhysical(owner.id, activeVariant.variant.id, 10n),
    setPhysical(owner.id, dueVariant.variant.id, 10n),
  ]);
  await orders.replaceItems(owner.id, order.id, {
    items: [
      { variantId: activeVariant.variant.id, quantity: '2' },
      { variantId: dueVariant.variant.id, quantity: '3' },
    ],
  });
  await confirmation(owner.id, order.id, new Date(Date.now() + 3_600_000));
  const holds = await client.stockHold.findMany({
    where: { merchantId: owner.id, orderItem: { orderId: order.id } },
    orderBy: { variantId: 'asc' },
  });
  const active = holds.find(
    ({ variantId }) => variantId === activeVariant.variant.id,
  )!;
  const due = holds.find(
    ({ variantId }) => variantId === dueVariant.variant.id,
  )!;
  await assert.rejects(
    inventory.releaseStockHold(
      owner.id,
      active.variantId,
      active.id,
      new Date(),
    ),
    OrderManagedStockHoldError,
  );
  await assert.rejects(
    inventory.updateStockHoldExpiry(
      owner.id,
      active.variantId,
      active.id,
      new Date(Date.now() + 7_200_000),
      new Date(),
    ),
    OrderManagedStockHoldError,
  );
  const dueAt = new Date(Date.now() - 1_000);
  await client.stockHold.update({
    where: { id: due.id },
    data: { expiresAt: dueAt },
  });
  const cancelled = await orders.transition(owner.id, order.id, 'CANCELLED');
  assert.equal(cancelled?.status, 'CANCELLED');
  const finalHolds = await client.stockHold.findMany({
    where: { merchantId: owner.id, orderItem: { orderId: order.id } },
  });
  assert.equal(
    finalHolds.find(({ id }) => id === active.id)?.status,
    'RELEASED',
  );
  const expired = finalHolds.find(({ id }) => id === due.id);
  assert.deepEqual(
    [expired?.status, expired?.expiredAt?.getTime()],
    ['EXPIRED', dueAt.getTime()],
  );
  const replay = await orders.transition(owner.id, order.id, 'CANCELLED');
  assert.equal(
    replay?.cancelledAt?.getTime(),
    cancelled?.cancelledAt?.getTime(),
  );
  assert.equal(
    await client.inventoryLedgerEntry.count({
      where: { merchantId: owner.id },
    }),
    0,
  );
});

void test('confirmation keys are Merchant-scoped and conflict across Orders in one Merchant', async () => {
  const [a, b] = await Promise.all([merchant('Key A'), merchant('Key B')]);
  const [ca, cb] = await Promise.all([customer(a.id), customer(b.id)]);
  const [oa1, oa2, ob] = await Promise.all([
    draft(a.id, ca.id),
    draft(a.id, ca.id),
    draft(b.id, cb.id),
  ]);
  const [va1, va2, vb] = await Promise.all([
    variant(a.id, 'Key-A1'),
    variant(a.id, 'Key-A2'),
    variant(b.id, 'Key-B'),
  ]);
  await Promise.all([
    setPhysical(a.id, va1.variant.id, 10n),
    setPhysical(a.id, va2.variant.id, 10n),
    setPhysical(b.id, vb.variant.id, 10n),
    orders.replaceItems(a.id, oa1.id, {
      items: [{ variantId: va1.variant.id, quantity: '1' }],
    }),
    orders.replaceItems(a.id, oa2.id, {
      items: [{ variantId: va2.variant.id, quantity: '1' }],
    }),
    orders.replaceItems(b.id, ob.id, {
      items: [{ variantId: vb.variant.id, quantity: '1' }],
    }),
  ]);
  const key = 'Merchant-Scoped-Key';
  const expiry = new Date(Date.now() + 3_600_000);
  await confirmation(a.id, oa1.id, expiry, key);
  await assert.rejects(
    confirmation(a.id, oa2.id, expiry, key),
    OrderConfirmationConflictError,
  );
  assert.equal(
    (await confirmation(b.id, ob.id, expiry, key))?.status,
    'CONFIRMED',
  );
});

void test('database rejects a cross-Merchant StockHold to OrderItem association', async () => {
  const [owner, foreign] = await Promise.all([
    merchant('Association Owner'),
    merchant('Association Foreign'),
  ]);
  const c = await customer(owner.id);
  const order = await draft(owner.id, c.id);
  const ownerVariant = await variant(owner.id, 'Association Owner');
  const foreignVariant = await variant(foreign.id, 'Association Foreign');
  const result = await orders.replaceItems(owner.id, order.id, {
    items: [{ variantId: ownerVariant.variant.id, quantity: '1' }],
  });
  const orderItemId = result?.items[0]?.id;
  assert.ok(orderItemId !== undefined);
  await assert.rejects(
    client.stockHold.create({
      data: {
        merchantId: foreign.id,
        variantId: foreignVariant.variant.id,
        orderItemId,
        quantity: 1n,
        expiresAt: new Date(Date.now() + 3_600_000),
        idempotencyKey: randomUUID(),
        requestHash: 'c'.repeat(64),
      },
    }),
  );
});

void test('Order-row locking serializes confirmation with item PUT, PATCH, abandon, cancel, and different keys', async () => {
  const owner = await merchant('Order Races');
  const [firstCustomer, secondCustomer] = await Promise.all([
    customer(owner.id),
    customer(owner.id),
  ]);
  const item = await variant(owner.id, 'Order Race');
  await setPhysical(owner.id, item.variant.id, 100n);
  const expiry = new Date(Date.now() + 3_600_000);

  const itemRace = await draft(owner.id, firstCustomer.id);
  await orders.replaceItems(owner.id, itemRace.id, {
    items: [{ variantId: item.variant.id, quantity: '2' }],
  });
  await Promise.allSettled([
    confirmation(owner.id, itemRace.id, expiry),
    orders.replaceItems(owner.id, itemRace.id, {
      items: [{ variantId: item.variant.id, quantity: '5' }],
    }),
  ]);
  const itemState = await orders.listItems(owner.id, itemRace.id);
  assert.equal(itemState?.order.status, 'CONFIRMED');
  assert.equal(
    itemState?.items[0]?.stockHolds[0]?.quantity,
    itemState?.items[0]?.quantity,
  );

  const patchRace = await draft(owner.id, firstCustomer.id);
  await orders.replaceItems(owner.id, patchRace.id, {
    items: [{ variantId: item.variant.id, quantity: '1' }],
  });
  await Promise.allSettled([
    confirmation(owner.id, patchRace.id, expiry),
    orders.patch(owner.id, patchRace.id, { customerId: secondCustomer.id }),
  ]);
  const patchState = await orders.find(owner.id, patchRace.id);
  assert.equal(patchState?.status, 'CONFIRMED');
  assert.equal(
    patchState?.customerNameSnapshot,
    patchState?.customerId === firstCustomer.id
      ? firstCustomer.name
      : secondCustomer.name,
  );

  const abandonRace = await draft(owner.id, firstCustomer.id);
  await orders.replaceItems(owner.id, abandonRace.id, {
    items: [{ variantId: item.variant.id, quantity: '1' }],
  });
  const abandonResults = await Promise.allSettled([
    confirmation(owner.id, abandonRace.id, expiry),
    orders.transition(owner.id, abandonRace.id, 'ABANDONED'),
  ]);
  assert.equal(
    abandonResults.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  const abandoned = await orders.find(owner.id, abandonRace.id);
  assert.equal(
    ['CONFIRMED', 'ABANDONED'].includes(abandoned?.status ?? ''),
    true,
  );
  assert.equal(
    await client.stockHold.count({
      where: { merchantId: owner.id, orderItem: { orderId: abandonRace.id } },
    }),
    abandoned?.status === 'CONFIRMED' ? 1 : 0,
  );

  const cancelRace = await draft(owner.id, firstCustomer.id);
  await orders.replaceItems(owner.id, cancelRace.id, {
    items: [{ variantId: item.variant.id, quantity: '1' }],
  });
  await Promise.allSettled([
    confirmation(owner.id, cancelRace.id, expiry),
    orders.transition(owner.id, cancelRace.id, 'CANCELLED'),
  ]);
  const cancelled = await orders.find(owner.id, cancelRace.id);
  assert.equal(cancelled?.status, 'CANCELLED');
  const cancelHolds = await client.stockHold.findMany({
    where: { merchantId: owner.id, orderItem: { orderId: cancelRace.id } },
  });
  assert.equal(
    cancelHolds.length === 0 ||
      cancelHolds.every(({ status }) => status === 'RELEASED'),
    true,
  );

  const differentKeys = await draft(owner.id, firstCustomer.id);
  await orders.replaceItems(owner.id, differentKeys.id, {
    items: [{ variantId: item.variant.id, quantity: '1' }],
  });
  const keyResults = await Promise.allSettled([
    confirmation(owner.id, differentKeys.id, expiry, 'Different-A'),
    confirmation(owner.id, differentKeys.id, expiry, 'Different-B'),
  ]);
  assert.equal(
    keyResults.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(
    await client.stockHold.count({
      where: { merchantId: owner.id, orderItem: { orderId: differentKeys.id } },
    }),
    1,
  );
});

void test('Hold expiry restores sellable capacity without changing confirmed Order status', async () => {
  const owner = await merchant('Expiry Independence');
  const c = await customer(owner.id);
  const item = await variant(owner.id, 'Expiry');
  const order = await draft(owner.id, c.id);
  await setPhysical(owner.id, item.variant.id, 10n);
  await orders.replaceItems(owner.id, order.id, {
    items: [{ variantId: item.variant.id, quantity: '7' }],
  });
  await confirmation(owner.id, order.id, new Date(Date.now() + 3_600_000));
  const hold = await client.stockHold.findFirstOrThrow({
    where: { merchantId: owner.id, orderItem: { orderId: order.id } },
  });
  const dueAt = new Date(Date.now() - 1_000);
  await client.stockHold.update({
    where: { id: hold.id },
    data: { expiresAt: dueAt },
  });
  const inventoryRead = await inventory.getInventory(owner.id, item.variant.id);
  assert.deepEqual(
    [inventoryRead?.availableQuantity, inventoryRead?.heldQuantity],
    [10n, 0n],
  );
  assert.equal((await orders.find(owner.id, order.id))?.status, 'CONFIRMED');
  assert.equal(
    (await inventory.expireDueStockHolds(new Date(), 100)) >= 1,
    true,
  );
  const expired = await client.stockHold.findUniqueOrThrow({
    where: { id: hold.id },
  });
  assert.deepEqual(
    [expired.status, expired.expiredAt?.getTime()],
    ['EXPIRED', dueAt.getTime()],
  );
  assert.equal((await orders.find(owner.id, order.id))?.status, 'CONFIRMED');
});
