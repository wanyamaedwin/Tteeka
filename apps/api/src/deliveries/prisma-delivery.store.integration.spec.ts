import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { DatabaseService } from '../database/database.service';
import { PrismaOrderStore } from '../orders/prisma-order.store';
import {
  deliveryAttemptRequestHash,
  deliveryCreateRequestHash,
} from './delivery-idempotency';
import {
  DeliveryAlreadyExistsError,
  DeliveryAttemptIdempotencyConflictError,
  DeliveryIdempotencyConflictError,
  DeliveryInvalidTransitionError,
  DeliveryLocationRequiredError,
  DeliveryOrderIneligibleError,
  DeliveryOrderUnavailableError,
} from './delivery.store';
import { PrismaDeliveryStore } from './prisma-delivery.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Delivery store tests require DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const database = { client } as DatabaseService;
const store = new PrismaDeliveryStore(database);
const orders = new PrismaOrderStore(database);
const PREFIX = 'B8.1 Delivery Store Test';
let phoneSequence = 40_000_000;

async function merchant(label: string) {
  return client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
}

async function order(
  merchantId: string,
  label: string,
  options: {
    status?: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
    withLocation?: boolean;
  } = {},
) {
  const status = options.status ?? 'CONFIRMED';
  const customer = await client.customer.create({
    data: {
      merchantId,
      name: `${label} Recipient`,
      phone: `+2567${phoneSequence++}`,
    },
  });
  const location =
    options.withLocation === false
      ? null
      : await client.deliveryLocation.create({
          data: {
            merchantId,
            customerId: customer.id,
            area: `${label} Area`,
            landmark: `${label} Landmark`,
            phone: `+2567${phoneSequence++}`,
            instructions: `${label} instructions`,
            mapPinUrl: `https://maps.example/${label}`,
          },
        });
  const confirmedAt = new Date();
  const record = await client.order.create({
    data: {
      merchantId,
      customerId: customer.id,
      status,
      customerNameSnapshot: customer.name,
      customerPhoneSnapshot: customer.phone,
      deliveryLocationId: location?.id ?? null,
      deliveryAreaSnapshot: location?.area ?? null,
      deliveryLandmarkSnapshot: location?.landmark ?? null,
      deliveryPhoneSnapshot: location?.phone ?? null,
      deliveryInstructionsSnapshot: location?.instructions ?? null,
      deliveryMapPinUrlSnapshot: location?.mapPinUrl ?? null,
      idempotencyKey: `order-${randomUUID()}`,
      requestHash: 'a'.repeat(64),
      ...(status === 'CONFIRMED'
        ? {
            confirmedAt,
            stockHoldExpiresAt: new Date(confirmedAt.getTime() + 3_600_000),
            confirmationIdempotencyKey: `confirm-${randomUUID()}`,
            confirmationRequestHash: 'b'.repeat(64),
          }
        : {}),
      ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
    },
  });
  return { customer, location, order: record };
}

function createDelivery(
  merchantId: string,
  orderId: string,
  idempotencyKey: string = randomUUID(),
) {
  const input = { orderId };
  return store.create(merchantId, {
    ...input,
    idempotencyKey,
    requestHash: deliveryCreateRequestHash(input),
  });
}

function attempt(
  merchantId: string,
  deliveryId: string,
  input:
    | { result: 'DELIVERED'; failureReason: null; note: string | null }
    | {
        result: 'FAILED';
        failureReason:
          | 'CUSTOMER_UNREACHABLE'
          | 'CUSTOMER_UNAVAILABLE'
          | 'CUSTOMER_REFUSED'
          | 'WRONG_LOCATION'
          | 'ADDRESS_NOT_FOUND'
          | 'VEHICLE_OR_RIDER_ISSUE'
          | 'WEATHER_OR_ACCESS_ISSUE'
          | 'OTHER';
        note: string | null;
      },
  idempotencyKey: string = randomUUID(),
) {
  return store.recordAttempt(merchantId, deliveryId, {
    ...input,
    idempotencyKey,
    requestHash: deliveryAttemptRequestHash(deliveryId, input),
  });
}

async function dispatchedDelivery(merchantId: string, orderId: string) {
  const delivery = await createDelivery(merchantId, orderId);
  await store.transition(merchantId, delivery.id, 'READY');
  return (await store.transition(merchantId, delivery.id, 'DISPATCHED'))!;
}

async function cleanup() {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = merchants.map(({ id }) => id);
  await client.deliveryAttempt.deleteMany({
    where: { merchantId: { in: ids } },
  });
  await client.deliveryJob.deleteMany({ where: { merchantId: { in: ids } } });
  await client.paymentVerificationAttempt.deleteMany({
    where: { merchantId: { in: ids } },
  });
  await client.paymentTransaction.deleteMany({
    where: { merchantId: { in: ids } },
  });
  await client.stockHold.deleteMany({ where: { merchantId: { in: ids } } });
  await client.inventoryLedgerEntry.deleteMany({
    where: { merchantId: { in: ids } },
  });
  await client.inventoryBalance.deleteMany({
    where: { merchantId: { in: ids } },
  });
  await client.orderItem.deleteMany({ where: { merchantId: { in: ids } } });
  await client.order.deleteMany({ where: { merchantId: { in: ids } } });
  await client.deliveryLocation.deleteMany({
    where: { merchantId: { in: ids } },
  });
  await client.customer.deleteMany({ where: { merchantId: { in: ids } } });
  await client.merchant.deleteMany({ where: { id: { in: ids } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('creation snapshots the confirmed Order, replays exactly, and remains immutable', async () => {
  const owner = await merchant('Creation');
  const source = await order(owner.id, 'Kira');
  const key = 'Create-Delivery';
  const created = await createDelivery(owner.id, source.order.id, key);
  assert.deepEqual(
    [
      created.status,
      created.recipientNameSnapshot,
      created.recipientPhoneSnapshot,
      created.areaSnapshot,
      created.landmarkSnapshot,
      created.deliveryPhoneSnapshot,
      created.instructionsSnapshot,
      created.mapPinUrlSnapshot,
    ],
    [
      'PENDING',
      source.order.customerNameSnapshot,
      source.order.customerPhoneSnapshot,
      source.order.deliveryAreaSnapshot,
      source.order.deliveryLandmarkSnapshot,
      source.order.deliveryPhoneSnapshot,
      source.order.deliveryInstructionsSnapshot,
      source.order.deliveryMapPinUrlSnapshot,
    ],
  );
  await Promise.all([
    client.customer.update({
      where: { id: source.customer.id },
      data: { name: 'Changed Recipient', phone: `+2567${phoneSequence++}` },
    }),
    client.deliveryLocation.update({
      where: { id: source.location!.id },
      data: { area: 'Changed Area', landmark: 'Changed Landmark' },
    }),
  ]);
  const replay = await createDelivery(owner.id, source.order.id, key);
  assert.equal(replay.id, created.id);
  assert.equal(replay.createdAt.getTime(), created.createdAt.getTime());
  assert.deepEqual(
    [replay.recipientNameSnapshot, replay.areaSnapshot],
    [`Kira Recipient`, `Kira Area`],
  );
});

void test('creation rejects unsafe Orders, key conflicts, and a second Delivery per Order', async () => {
  const [owner, foreign] = await Promise.all([
    merchant('Eligibility'),
    merchant('Foreign'),
  ]);
  const [confirmed, draft, cancelled, noLocation, foreignOrder] =
    await Promise.all([
      order(owner.id, 'Confirmed'),
      order(owner.id, 'Draft', { status: 'DRAFT' }),
      order(owner.id, 'Cancelled', { status: 'CANCELLED' }),
      order(owner.id, 'No Location', { withLocation: false }),
      order(foreign.id, 'Foreign'),
    ]);
  await assert.rejects(
    createDelivery(owner.id, draft.order.id),
    DeliveryOrderIneligibleError,
  );
  await assert.rejects(
    createDelivery(owner.id, cancelled.order.id),
    DeliveryOrderIneligibleError,
  );
  await assert.rejects(
    createDelivery(owner.id, noLocation.order.id),
    DeliveryLocationRequiredError,
  );
  await assert.rejects(
    createDelivery(owner.id, foreignOrder.order.id),
    DeliveryOrderUnavailableError,
  );
  await createDelivery(owner.id, confirmed.order.id, 'Owner-Key');
  await assert.rejects(
    createDelivery(owner.id, confirmed.order.id, 'Different-Key'),
    DeliveryAlreadyExistsError,
  );
  await assert.rejects(
    createDelivery(owner.id, draft.order.id, 'Owner-Key'),
    DeliveryIdempotencyConflictError,
  );
});

void test('concurrent creation yields one replay for one key and one conflict across different keys', async () => {
  const owner = await merchant('Concurrent Create');
  const same = await order(owner.id, 'Same Key');
  const exact = await Promise.all([
    createDelivery(owner.id, same.order.id, 'Concurrent-Same'),
    createDelivery(owner.id, same.order.id, 'Concurrent-Same'),
  ]);
  assert.equal(exact[0].id, exact[1].id);

  const different = await order(owner.id, 'Different Keys');
  const raced = await Promise.allSettled([
    createDelivery(owner.id, different.order.id, 'Concurrent-A'),
    createDelivery(owner.id, different.order.id, 'Concurrent-B'),
  ]);
  assert.equal(raced.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(raced.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal(
    await client.deliveryJob.count({
      where: { merchantId: owner.id, orderId: different.order.id },
    }),
    1,
  );
});

void test('list filters snapshots, status, Order, half-open dates, and tenant scope deterministically', async () => {
  const [owner, foreign] = await Promise.all([
    merchant('List Owner'),
    merchant('List Foreign'),
  ]);
  const [a, b, c] = await Promise.all([
    order(owner.id, 'Kira'),
    order(owner.id, 'Ntinda'),
    order(foreign.id, 'Kira Foreign'),
  ]);
  const first = await createDelivery(owner.id, a.order.id);
  const second = await createDelivery(owner.id, b.order.id);
  await createDelivery(foreign.id, c.order.id);
  await store.transition(owner.id, second.id, 'READY');
  const listed = await store.list(owner.id, {
    q: 'Kira',
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(
    listed.rows.map(({ id }) => id),
    [first.id],
  );
  const byOrder = await store.list(owner.id, {
    orderId: b.order.id,
    status: 'READY',
    createdFrom: new Date(first.createdAt.getTime() - 1),
    createdTo: new Date(Date.now() + 10_000),
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(
    byOrder.rows.map(({ id }) => id),
    [second.id],
  );
  assert.equal(
    (await store.list(foreign.id, { page: 1, pageSize: 20 })).total,
    1,
  );
});

void test('ready, dispatch, and cancel enforce exact idempotent lifecycle timestamps', async () => {
  const owner = await merchant('Lifecycle');
  const dispatchedSource = await order(owner.id, 'Dispatch');
  const delivery = await createDelivery(owner.id, dispatchedSource.order.id);
  await assert.rejects(
    store.transition(owner.id, delivery.id, 'DISPATCHED'),
    DeliveryInvalidTransitionError,
  );
  const ready = await store.transition(owner.id, delivery.id, 'READY');
  const readyReplay = await store.transition(owner.id, delivery.id, 'READY');
  assert.equal(ready?.readyAt?.getTime(), readyReplay?.readyAt?.getTime());
  const dispatched = await store.transition(
    owner.id,
    delivery.id,
    'DISPATCHED',
  );
  const dispatchReplay = await store.transition(
    owner.id,
    delivery.id,
    'DISPATCHED',
  );
  assert.equal(
    dispatched?.dispatchedAt?.getTime(),
    dispatchReplay?.dispatchedAt?.getTime(),
  );
  await assert.rejects(
    store.transition(owner.id, delivery.id, 'CANCELLED'),
    DeliveryInvalidTransitionError,
  );

  for (const startReady of [false, true]) {
    const source = await order(owner.id, `Cancel ${startReady}`);
    const cancellable = await createDelivery(owner.id, source.order.id);
    if (startReady) {
      await store.transition(owner.id, cancellable.id, 'READY');
    }
    const cancelled = await store.transition(
      owner.id,
      cancellable.id,
      'CANCELLED',
    );
    const replay = await store.transition(
      owner.id,
      cancellable.id,
      'CANCELLED',
    );
    assert.equal(
      cancelled?.cancelledAt?.getTime(),
      replay?.cancelledAt?.getTime(),
    );
  }
});

void test('DELIVERED Attempt is atomic, replay-safe, private, and has no domain side effects', async () => {
  const owner = await merchant('Delivered Attempt');
  const source = await order(owner.id, 'Delivered');
  await client.paymentTransaction.create({
    data: {
      merchantId: owner.id,
      orderId: source.order.id,
      method: 'CASH',
      amount: 1_000n,
      currency: 'UGX',
      reportedAt: new Date(),
      idempotencyKey: `payment-${randomUUID()}`,
      requestHash: 'c'.repeat(64),
    },
  });
  const delivery = await dispatchedDelivery(owner.id, source.order.id);
  const before = await Promise.all([
    client.paymentTransaction.findMany({ where: { merchantId: owner.id } }),
    client.inventoryBalance.count({ where: { merchantId: owner.id } }),
    client.inventoryLedgerEntry.count({ where: { merchantId: owner.id } }),
    client.stockHold.count({ where: { merchantId: owner.id } }),
  ]);
  const input = {
    result: 'DELIVERED' as const,
    failureReason: null,
    note: null,
  };
  const key = 'Delivered-Attempt';
  const completed = await attempt(owner.id, delivery.id, input, key);
  assert.deepEqual(
    [
      completed?.attempt.attemptNumber,
      completed?.attempt.result,
      completed?.attempt.failureReason,
      completed?.delivery.status,
      completed?.delivery.deliveredAt?.getTime(),
    ],
    [
      1,
      'DELIVERED',
      null,
      'DELIVERED',
      completed?.attempt.attemptedAt.getTime(),
    ],
  );
  const replay = await attempt(owner.id, delivery.id, input, key);
  assert.equal(replay?.attempt.id, completed?.attempt.id);
  assert.equal(
    replay?.delivery.deliveredAt?.getTime(),
    completed?.delivery.deliveredAt?.getTime(),
  );
  await assert.rejects(
    attempt(
      owner.id,
      delivery.id,
      { result: 'FAILED', failureReason: 'OTHER', note: null },
      key,
    ),
    DeliveryAttemptIdempotencyConflictError,
  );
  assert.equal(
    await client.deliveryAttempt.count({
      where: { merchantId: owner.id, deliveryJobId: delivery.id },
    }),
    1,
  );
  const orderAfter = await client.order.findUniqueOrThrow({
    where: { id: source.order.id },
  });
  const after = await Promise.all([
    client.paymentTransaction.findMany({ where: { merchantId: owner.id } }),
    client.inventoryBalance.count({ where: { merchantId: owner.id } }),
    client.inventoryLedgerEntry.count({ where: { merchantId: owner.id } }),
    client.stockHold.count({ where: { merchantId: owner.id } }),
  ]);
  assert.equal(orderAfter.status, 'CONFIRMED');
  assert.deepEqual(after, before);
});

void test('FAILED Attempt records its structured reason and terminal timestamp', async () => {
  const owner = await merchant('Failed Attempt');
  const source = await order(owner.id, 'Failed');
  const delivery = await dispatchedDelivery(owner.id, source.order.id);
  const completed = await attempt(owner.id, delivery.id, {
    result: 'FAILED',
    failureReason: 'CUSTOMER_UNREACHABLE',
    note: 'Customer phone was off',
  });
  assert.deepEqual(
    [
      completed?.attempt.attemptNumber,
      completed?.attempt.result,
      completed?.attempt.failureReason,
      completed?.delivery.status,
      completed?.delivery.failedAt?.getTime(),
    ],
    [
      1,
      'FAILED',
      'CUSTOMER_UNREACHABLE',
      'FAILED',
      completed?.attempt.attemptedAt.getTime(),
    ],
  );
  const history = await store.listAttempts(owner.id, delivery.id, {
    result: 'FAILED',
    failureReason: 'CUSTOMER_UNREACHABLE',
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(
    history?.rows.map(({ id }) => id),
    [completed?.attempt.id],
  );
  assert.equal(
    await store.listAttempts(owner.id, randomUUID(), {
      page: 1,
      pageSize: 20,
    }),
    null,
  );
});

void test('terminal Attempt race persists exactly one coherent outcome', async () => {
  const owner = await merchant('Attempt Race');
  const source = await order(owner.id, 'Attempt Race');
  const delivery = await dispatchedDelivery(owner.id, source.order.id);
  const results = await Promise.allSettled([
    attempt(owner.id, delivery.id, {
      result: 'DELIVERED',
      failureReason: null,
      note: null,
    }),
    attempt(owner.id, delivery.id, {
      result: 'FAILED',
      failureReason: 'OTHER',
      note: null,
    }),
  ]);
  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal(
    await client.deliveryAttempt.count({
      where: { merchantId: owner.id, deliveryJobId: delivery.id },
    }),
    1,
  );
  assert.ok(
    ['DELIVERED', 'FAILED'].includes(
      (await store.find(owner.id, delivery.id))!.status,
    ),
  );
});

for (const [label, initial, firstTarget, secondTarget] of [
  ['ready versus cancel', 'PENDING', 'READY', 'CANCELLED'],
  ['dispatch versus cancel', 'READY', 'DISPATCHED', 'CANCELLED'],
] as const) {
  void test(`${label} race has one winner and no hybrid terminal timestamps`, async () => {
    const owner = await merchant(label);
    const source = await order(owner.id, label);
    const delivery = await createDelivery(owner.id, source.order.id);
    if (initial === 'READY') {
      await store.transition(owner.id, delivery.id, 'READY');
    }
    const results = await Promise.allSettled([
      store.transition(owner.id, delivery.id, firstTarget),
      store.transition(owner.id, delivery.id, secondTarget),
    ]);
    assert.equal(
      results.filter(({ status }) => status === 'fulfilled').length,
      1,
    );
    const final = (await store.find(owner.id, delivery.id))!;
    if (final.status === 'CANCELLED') {
      assert.equal(final.dispatchedAt, null);
      assert.equal(final.deliveredAt, null);
      assert.equal(final.failedAt, null);
    } else {
      assert.equal(final.cancelledAt, null);
    }
  });
}

void test('Delivery creation and Order cancellation serialize on the Order row', async () => {
  const owner = await merchant('Order Cancel Race');
  const source = await order(owner.id, 'Order Cancel Race');
  const results = await Promise.allSettled([
    createDelivery(owner.id, source.order.id, 'Order-Cancel-Race'),
    orders.transition(owner.id, source.order.id, 'CANCELLED'),
  ]);
  const currentOrder = await client.order.findUniqueOrThrow({
    where: { id: source.order.id },
  });
  assert.equal(currentOrder.status, 'CANCELLED');
  const deliveryCount = await client.deliveryJob.count({
    where: { merchantId: owner.id, orderId: source.order.id },
  });
  assert.ok(deliveryCount === 0 || deliveryCount === 1);
  if (results[0]?.status === 'rejected') assert.equal(deliveryCount, 0);
  if (results[0]?.status === 'fulfilled') assert.equal(deliveryCount, 1);
});

void test('Order cancellation and Hold expiry never mutate an existing Delivery', async () => {
  const owner = await merchant('Independence');
  const source = await order(owner.id, 'Independence');
  const delivery = await createDelivery(owner.id, source.order.id);
  await orders.transition(owner.id, source.order.id, 'CANCELLED');
  const expiredAt = new Date(Date.now() - 1_000);
  await client.order.update({
    where: { id: source.order.id },
    data: {
      confirmedAt: new Date(expiredAt.getTime() - 1_000),
      stockHoldExpiresAt: expiredAt,
    },
  });
  const unchanged = await store.find(owner.id, delivery.id);
  assert.deepEqual(
    [unchanged?.status, unchanged?.readyAt, unchanged?.cancelledAt],
    ['PENDING', null, null],
  );
});

void test('database enforces tenant FKs, one-per-Order, hashes, lifecycle, and Attempt consistency', async () => {
  const [owner, foreign] = await Promise.all([
    merchant('Constraints'),
    merchant('Constraints Foreign'),
  ]);
  const source = await order(owner.id, 'Constraints');
  const delivery = await createDelivery(owner.id, source.order.id);
  await assert.rejects(
    client.deliveryJob.create({
      data: {
        merchantId: foreign.id,
        orderId: source.order.id,
        recipientPhoneSnapshot: '+256712345678',
        areaSnapshot: 'Area',
        landmarkSnapshot: 'Landmark',
        deliveryPhoneSnapshot: '+256712345678',
        idempotencyKey: randomUUID(),
        requestHash: 'd'.repeat(64),
      },
    }),
  );
  await assert.rejects(
    client.deliveryJob.update({
      where: { id: delivery.id },
      data: { requestHash: 'INVALID' },
    }),
  );
  await assert.rejects(
    client.deliveryAttempt.create({
      data: {
        merchantId: owner.id,
        deliveryJobId: delivery.id,
        attemptNumber: 1,
        result: 'DELIVERED',
        failureReason: 'OTHER',
        attemptedAt: new Date(),
        idempotencyKey: randomUUID(),
        requestHash: 'e'.repeat(64),
      },
    }),
  );
});
