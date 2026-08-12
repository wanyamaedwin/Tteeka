import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { DatabaseService } from '../database/database.service';
import { orderCreateRequestHash } from './order-idempotency';
import { createOrderSchema } from './order.schema';
import {
  OrderArithmeticOverflowError,
  OrderCurrencyMismatchError,
  OrderIdempotencyConflictError,
  OrderInvalidTransitionError,
  OrderItemIneligibleError,
  OrderNotEditableError,
  OrderReferenceUnavailableError,
} from './order.store';
import { PrismaOrderStore } from './prisma-order.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0)
  throw new Error('Order store tests require DATABASE_URL.');
const client = createPrismaClient({ databaseUrl });
const store = new PrismaOrderStore({ client } as DatabaseService);
const PREFIX = 'B6.1 Order Store Test';

async function merchant(label: string) {
  return client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
}

async function customer(merchantId: string, suffix: number, name = 'Sarah') {
  return client.customer.create({
    data: {
      merchantId,
      name,
      phone: `+2567${suffix.toString().padStart(8, '0')}`,
    },
  });
}

async function location(merchantId: string, customerId: string, label: string) {
  return client.deliveryLocation.create({
    data: {
      merchantId,
      customerId,
      area: `${label} Area`,
      landmark: `${label} Landmark`,
      phone: '+256772222222',
      instructions: `${label} instructions`,
      mapPinUrl: `https://maps.example/${label}`,
    },
  });
}

async function variant(
  merchantId: string,
  label: string,
  sellingPrice: bigint | null,
  currency = 'UGX',
) {
  const product = await client.product.create({
    data: { merchantId, name: `${label} Product`, status: 'ACTIVE' },
  });
  const item = await client.productVariant.create({
    data: {
      merchantId,
      productId: product.id,
      sku: `${label}-${randomUUID()}`.toUpperCase(),
      size: 'M',
      colour: 'Blue',
      status: sellingPrice === null ? 'INACTIVE' : 'ACTIVE',
      sellingPrice,
      priceCurrency: sellingPrice === null ? null : currency,
      priceUpdatedAt: sellingPrice === null ? null : new Date(),
    },
  });
  return { product, variant: item };
}

async function createOrder(
  merchantId: string,
  customerId: string,
  deliveryLocationId: string | null = null,
  key: string = randomUUID(),
) {
  const input = createOrderSchema.parse({ customerId, deliveryLocationId });
  return store.create(merchantId, {
    ...input,
    idempotencyKey: key,
    requestHash: orderCreateRequestHash(input),
  });
}

async function cleanup() {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = merchants.map(({ id }) => id);
  await client.orderItem.deleteMany({ where: { merchantId: { in: ids } } });
  await client.order.deleteMany({ where: { merchantId: { in: ids } } });
  await client.deliveryLocation.deleteMany({
    where: { merchantId: { in: ids } },
  });
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

void test('create snapshots references, replays exactly, conflicts safely, and isolates keys by Merchant', async () => {
  const [a, b] = await Promise.all([
    merchant('Create A'),
    merchant('Create B'),
  ]);
  const [ca, cb] = await Promise.all([customer(a.id, 1), customer(b.id, 1)]);
  const la = await location(a.id, ca.id, 'Kira');
  const key = 'Same-Key';
  const first = await createOrder(a.id, ca.id, la.id, key);
  const replay = await createOrder(a.id, ca.id, la.id, key);
  assert.equal(first.id, replay.id);
  assert.deepEqual(
    [
      first.customerNameSnapshot,
      first.customerPhoneSnapshot,
      first.deliveryAreaSnapshot,
    ],
    [ca.name, ca.phone, la.area],
  );
  await assert.rejects(
    createOrder(a.id, ca.id, null, key),
    OrderIdempotencyConflictError,
  );
  const cross = await createOrder(b.id, cb.id, null, key);
  assert.notEqual(first.id, cross.id);
  assert.equal(await client.order.count({ where: { merchantId: a.id } }), 1);
});

void test('concurrent exact create persists one Order', async () => {
  const owner = await merchant('Concurrent Create');
  const c = await customer(owner.id, 2);
  const results = await Promise.all([
    createOrder(owner.id, c.id, null, 'Concurrent-Key'),
    createOrder(owner.id, c.id, null, 'Concurrent-Key'),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(
    await client.order.count({ where: { merchantId: owner.id } }),
    1,
  );
});

void test('snapshots are immutable; customer change clears location and location change fully replaces it', async () => {
  const owner = await merchant('Snapshots');
  const [a, b] = await Promise.all([
    customer(owner.id, 3, 'Customer A'),
    customer(owner.id, 4, 'Customer B'),
  ]);
  const [la, lb] = await Promise.all([
    location(owner.id, a.id, 'A'),
    location(owner.id, a.id, 'B'),
  ]);
  const order = await createOrder(owner.id, a.id, la.id);
  await client.customer.update({
    where: { id: a.id },
    data: { name: 'Changed', phone: '+256799999999' },
  });
  await client.deliveryLocation.update({
    where: { id: la.id },
    data: { landmark: 'Changed', phone: '+256788888888' },
  });
  const unchanged = await store.find(owner.id, order.id);
  assert.deepEqual(
    [
      unchanged?.customerNameSnapshot,
      unchanged?.customerPhoneSnapshot,
      unchanged?.deliveryLandmarkSnapshot,
    ],
    ['Customer A', '+256700000003', 'A Landmark'],
  );
  const moved = await store.patch(owner.id, order.id, {
    deliveryLocationId: lb.id,
  });
  assert.deepEqual(
    [
      moved?.deliveryAreaSnapshot,
      moved?.deliveryLandmarkSnapshot,
      moved?.deliveryMapPinUrlSnapshot,
    ],
    [lb.area, lb.landmark, lb.mapPinUrl],
  );
  const changedCustomer = await store.patch(owner.id, order.id, {
    customerId: b.id,
  });
  assert.deepEqual(
    [
      changedCustomer?.customerId,
      changedCustomer?.customerNameSnapshot,
      changedCustomer?.deliveryLocationId,
      changedCustomer?.deliveryAreaSnapshot,
    ],
    [b.id, b.name, null, null],
  );
});

void test('archived and foreign customer/location references reject without affecting existing snapshots', async () => {
  const [owner, foreign] = await Promise.all([
    merchant('Eligibility'),
    merchant('Foreign'),
  ]);
  const [active, archived, foreignCustomer] = await Promise.all([
    customer(owner.id, 5),
    customer(owner.id, 6),
    customer(foreign.id, 7),
  ]);
  await client.customer.update({
    where: { id: archived.id },
    data: { status: 'ARCHIVED' },
  });
  await assert.rejects(
    createOrder(owner.id, archived.id),
    OrderReferenceUnavailableError,
  );
  await assert.rejects(
    createOrder(owner.id, foreignCustomer.id),
    OrderReferenceUnavailableError,
  );
  const activeLocation = await location(owner.id, active.id, 'Active');
  const otherCustomer = await customer(owner.id, 8);
  const wrongLocation = await location(owner.id, otherCustomer.id, 'Wrong');
  const order = await createOrder(owner.id, active.id, activeLocation.id);
  await assert.rejects(
    store.patch(owner.id, order.id, { deliveryLocationId: wrongLocation.id }),
    OrderReferenceUnavailableError,
  );
  await client.deliveryLocation.update({
    where: { id: activeLocation.id },
    data: { status: 'ARCHIVED' },
  });
  assert.equal(
    (await store.find(owner.id, order.id))?.deliveryAreaSnapshot,
    activeLocation.area,
  );
  await assert.rejects(
    createOrder(owner.id, active.id, activeLocation.id),
    OrderReferenceUnavailableError,
  );
});

void test('item snapshots, quantity preservation, remove/re-add, multi-line subtotal, and empty reset work', async () => {
  const owner = await merchant('Items');
  const c = await customer(owner.id, 9);
  const order = await createOrder(owner.id, c.id);
  const [a, b] = await Promise.all([
    variant(owner.id, 'A', 85_000n),
    variant(owner.id, 'B', 30_000n),
  ]);
  let result = await store.replaceItems(owner.id, order.id, {
    items: [
      { variantId: a.variant.id, quantity: '2' },
      { variantId: b.variant.id, quantity: '3' },
    ],
  });
  assert.ok(result !== null);
  assert.equal(result.order.subtotal, 260_000n);
  assert.deepEqual(
    result.items.map((item) => item.lineTotal),
    [170_000n, 90_000n],
  );
  const original = result.items.find(
    (item) => item.variantId === a.variant.id,
  )!;
  await client.product.update({
    where: { id: a.product.id },
    data: { name: 'New Product' },
  });
  await client.productVariant.update({
    where: { id: a.variant.id },
    data: {
      sku: `NEW-${randomUUID()}`,
      size: 'L',
      colour: 'Red',
      sellingPrice: 90_000n,
    },
  });
  result = await store.replaceItems(owner.id, order.id, {
    items: [{ variantId: a.variant.id, quantity: '3' }],
  });
  assert.ok(result !== null);
  assert.deepEqual(
    [
      result.items[0]?.productNameSnapshot,
      result.items[0]?.skuSnapshot,
      result.items[0]?.unitSellingPrice,
      result.items[0]?.lineTotal,
    ],
    [original.productNameSnapshot, original.skuSnapshot, 85_000n, 255_000n],
  );
  await store.replaceItems(owner.id, order.id, { items: [] });
  result = await store.replaceItems(owner.id, order.id, {
    items: [{ variantId: a.variant.id, quantity: '1' }],
  });
  assert.equal(result?.items[0]?.unitSellingPrice, 90_000n);
  assert.equal(result?.items[0]?.productNameSnapshot, 'New Product');
  result = await store.replaceItems(owner.id, order.id, { items: [] });
  assert.deepEqual(
    [result?.items.length, result?.order.subtotal, result?.order.currency],
    [0, 0n, null],
  );
});

void test('item validation is atomic for currency, eligibility, foreign variants, and arithmetic overflow', async () => {
  const [owner, foreign] = await Promise.all([
    merchant('Item Validation'),
    merchant('Item Foreign'),
  ]);
  const c = await customer(owner.id, 10);
  const order = await createOrder(owner.id, c.id);
  const ugx = await variant(owner.id, 'UGX', 10n);
  const usd = await variant(owner.id, 'USD', 2n, 'USD');
  const unpriced = await variant(owner.id, 'Unpriced', null);
  const foreignVariant = await variant(foreign.id, 'Foreign', 1n);
  await store.replaceItems(owner.id, order.id, {
    items: [{ variantId: ugx.variant.id, quantity: '1' }],
  });
  await assert.rejects(
    store.replaceItems(owner.id, order.id, {
      items: [
        { variantId: ugx.variant.id, quantity: '1' },
        { variantId: usd.variant.id, quantity: '1' },
      ],
    }),
    OrderCurrencyMismatchError,
  );
  await assert.rejects(
    store.replaceItems(owner.id, order.id, {
      items: [{ variantId: unpriced.variant.id, quantity: '1' }],
    }),
    OrderItemIneligibleError,
  );
  await assert.rejects(
    store.replaceItems(owner.id, order.id, {
      items: [{ variantId: foreignVariant.variant.id, quantity: '1' }],
    }),
    OrderItemIneligibleError,
  );
  const expensive = await variant(owner.id, 'Overflow', 2n);
  await assert.rejects(
    store.replaceItems(owner.id, order.id, {
      items: [
        { variantId: expensive.variant.id, quantity: '9223372036854775807' },
      ],
    }),
    OrderArithmeticOverflowError,
  );
  const [largeA, largeB] = await Promise.all([
    variant(owner.id, 'SubtotalOverflowA', 4_611_686_018_427_387_904n),
    variant(owner.id, 'SubtotalOverflowB', 4_611_686_018_427_387_904n),
  ]);
  await assert.rejects(
    store.replaceItems(owner.id, order.id, {
      items: [
        { variantId: largeA.variant.id, quantity: '1' },
        { variantId: largeB.variant.id, quantity: '1' },
      ],
    }),
    OrderArithmeticOverflowError,
  );
  assert.deepEqual(
    (await store.listItems(owner.id, order.id))?.items.map(
      (item) => item.variantId,
    ),
    [ugx.variant.id],
  );
});

void test('new inactive/archived Variant or Product rejects while an existing snapshot stays editable and readable', async () => {
  const owner = await merchant('Catalogue Lifecycle');
  const c = await customer(owner.id, 14);
  const order = await createOrder(owner.id, c.id);
  const active = await variant(owner.id, 'LifecycleActive', 500n);
  const inactive = await variant(owner.id, 'LifecycleInactive', 500n);
  const archivedProduct = await variant(owner.id, 'LifecycleProduct', 500n);
  await client.productVariant.update({
    where: { id: inactive.variant.id },
    data: { status: 'INACTIVE' },
  });
  await client.product.update({
    where: { id: archivedProduct.product.id },
    data: { status: 'ARCHIVED' },
  });
  await assert.rejects(
    store.replaceItems(owner.id, order.id, {
      items: [{ variantId: inactive.variant.id, quantity: '1' }],
    }),
    OrderItemIneligibleError,
  );
  await assert.rejects(
    store.replaceItems(owner.id, order.id, {
      items: [{ variantId: archivedProduct.variant.id, quantity: '1' }],
    }),
    OrderItemIneligibleError,
  );
  await store.replaceItems(owner.id, order.id, {
    items: [{ variantId: active.variant.id, quantity: '1' }],
  });
  await client.productVariant.update({
    where: { id: active.variant.id },
    data: { status: 'ARCHIVED' },
  });
  const updated = await store.replaceItems(owner.id, order.id, {
    items: [{ variantId: active.variant.id, quantity: '2' }],
  });
  assert.deepEqual(
    [updated?.items[0]?.quantity, updated?.items[0]?.unitSellingPrice],
    [2n, 500n],
  );
});

void test('no-op PUT preserves timestamps and concurrent replacements serialize to one whole state', async () => {
  const owner = await merchant('Concurrent Items');
  const c = await customer(owner.id, 11);
  const order = await createOrder(owner.id, c.id);
  const [a, b] = await Promise.all([
    variant(owner.id, 'CA', 100n),
    variant(owner.id, 'CB', 200n),
  ]);
  const first = await store.replaceItems(owner.id, order.id, {
    items: [{ variantId: a.variant.id, quantity: '2' }],
  });
  const replay = await store.replaceItems(owner.id, order.id, {
    items: [{ variantId: a.variant.id, quantity: '2' }],
  });
  assert.equal(
    first?.order.updatedAt.getTime(),
    replay?.order.updatedAt.getTime(),
  );
  assert.equal(
    first?.items[0]?.updatedAt.getTime(),
    replay?.items[0]?.updatedAt.getTime(),
  );
  await Promise.all([
    store.replaceItems(owner.id, order.id, {
      items: [{ variantId: a.variant.id, quantity: '3' }],
    }),
    store.replaceItems(owner.id, order.id, {
      items: [{ variantId: b.variant.id, quantity: '4' }],
    }),
  ]);
  const final = await store.listItems(owner.id, order.id);
  const state = final?.items.map(
    (item) => `${item.variantId}:${item.quantity}:${item.lineTotal}`,
  );
  assert.equal(
    JSON.stringify(state) === JSON.stringify([`${a.variant.id}:3:300`]) ||
      JSON.stringify(state) === JSON.stringify([`${b.variant.id}:4:800`]),
    true,
  );
});

void test('cancel/abandon are idempotent, retain contents, reject crossover, and serialize with edits', async () => {
  const owner = await merchant('Terminal');
  const c = await customer(owner.id, 12);
  const v = await variant(owner.id, 'Terminal', 100n);
  const abandonedOrder = await createOrder(owner.id, c.id);
  await store.replaceItems(owner.id, abandonedOrder.id, {
    items: [{ variantId: v.variant.id, quantity: '1' }],
  });
  const abandoned = await store.transition(
    owner.id,
    abandonedOrder.id,
    'ABANDONED',
  );
  const abandonedReplay = await store.transition(
    owner.id,
    abandonedOrder.id,
    'ABANDONED',
  );
  assert.equal(
    abandoned?.abandonedAt?.getTime(),
    abandonedReplay?.abandonedAt?.getTime(),
  );
  await assert.rejects(
    store.transition(owner.id, abandonedOrder.id, 'CANCELLED'),
    OrderInvalidTransitionError,
  );
  await assert.rejects(
    store.replaceItems(owner.id, abandonedOrder.id, { items: [] }),
    OrderNotEditableError,
  );
  assert.equal(
    (await store.listItems(owner.id, abandonedOrder.id))?.items.length,
    1,
  );

  const race = await createOrder(owner.id, c.id);
  await Promise.allSettled([
    store.replaceItems(owner.id, race.id, {
      items: [{ variantId: v.variant.id, quantity: '2' }],
    }),
    store.transition(owner.id, race.id, 'CANCELLED'),
  ]);
  const cancelled = await store.find(owner.id, race.id);
  assert.equal(cancelled?.status, 'CANCELLED');
  const before = cancelled?.cancelledAt?.getTime();
  const repeat = await store.transition(owner.id, race.id, 'CANCELLED');
  assert.equal(repeat?.cancelledAt?.getTime(), before);
  await assert.rejects(
    store.replaceItems(owner.id, race.id, { items: [] }),
    OrderNotEditableError,
  );
});

void test('list filters and tenant concealment are deterministic and bounded', async () => {
  const [owner, foreign] = await Promise.all([
    merchant('List'),
    merchant('List Foreign'),
  ]);
  const c = await customer(owner.id, 13, 'Search Name');
  const order = await createOrder(owner.id, c.id);
  const result = await store.list(owner.id, {
    q: 'search',
    customerId: c.id,
    status: 'DRAFT',
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual([result.total, result.rows[0]?.id], [1, order.id]);
  assert.equal(await store.find(foreign.id, order.id), null);
  assert.equal(await store.listItems(foreign.id, order.id), null);
});
