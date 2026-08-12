import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deliveryAttemptListQuerySchema,
  deliveryListQuerySchema,
} from './delivery-query.schema';
import {
  createDeliverySchema,
  deliveryIdempotencyKeySchema,
  recordDeliveryAttemptSchema,
} from './delivery.schema';

const ORDER_ID = '0198a9f0-1000-7000-8000-000000000001';

void test('Delivery creation accepts only one UUIDv7 orderId', () => {
  assert.deepEqual(createDeliverySchema.parse({ orderId: ORDER_ID }), {
    orderId: ORDER_ID,
  });
  for (const input of [
    {},
    { orderId: 'not-a-uuid' },
    { orderId: ORDER_ID, address: 'caller-controlled' },
  ]) {
    assert.equal(createDeliverySchema.safeParse(input).success, false);
  }
});

void test('DELIVERED Attempt canonicalizes nullable fields and rejects a reason', () => {
  assert.deepEqual(
    recordDeliveryAttemptSchema.parse({
      result: 'DELIVERED',
      note: '   ',
    }),
    { result: 'DELIVERED', failureReason: null, note: null },
  );
  assert.equal(
    recordDeliveryAttemptSchema.safeParse({
      result: 'DELIVERED',
      failureReason: 'CUSTOMER_UNREACHABLE',
    }).success,
    false,
  );
});

void test('FAILED Attempt requires the exact reason vocabulary and trims note', () => {
  assert.deepEqual(
    recordDeliveryAttemptSchema.parse({
      result: 'FAILED',
      failureReason: 'CUSTOMER_UNAVAILABLE',
      note: '  Customer requested tomorrow  ',
    }),
    {
      result: 'FAILED',
      failureReason: 'CUSTOMER_UNAVAILABLE',
      note: 'Customer requested tomorrow',
    },
  );
  for (const input of [
    { result: 'FAILED' },
    { result: 'FAILED', failureReason: 'UNKNOWN' },
    {
      result: 'FAILED',
      failureReason: 'OTHER',
      note: 'x'.repeat(501),
    },
    { result: 'FAILED', failureReason: 'OTHER', attemptedAt: new Date() },
    { result: 'FAILED', failureReason: 'OTHER', attemptNumber: 1 },
  ]) {
    assert.equal(recordDeliveryAttemptSchema.safeParse(input).success, false);
  }
});

void test('Delivery list query is strict, bounded, and uses half-open dates', () => {
  const parsed = deliveryListQuerySchema.parse({
    q: '  Kira  ',
    orderId: ORDER_ID,
    status: 'READY',
    createdFrom: '2026-08-12T00:00:00+03:00',
    createdTo: '2026-08-13T00:00:00+03:00',
    page: '2',
    pageSize: '50',
  });
  assert.deepEqual(
    [parsed.q, parsed.status, parsed.page, parsed.pageSize],
    ['Kira', 'READY', 2, 50],
  );
  assert.equal(parsed.createdFrom?.toISOString(), '2026-08-11T21:00:00.000Z');
  assert.equal(
    deliveryListQuerySchema.safeParse({
      createdFrom: '2026-08-13T00:00:00Z',
      createdTo: '2026-08-12T00:00:00Z',
    }).success,
    false,
  );
  assert.equal(
    deliveryListQuerySchema.safeParse({ createdFrom: '2026-08-12' }).success,
    false,
  );
  assert.equal(
    deliveryListQuerySchema.safeParse({ pageSize: '101' }).success,
    false,
  );
  assert.equal(
    deliveryListQuerySchema.safeParse({ unknown: 'x' }).success,
    false,
  );
});

void test('Attempt query has bounded filters and pagination', () => {
  assert.deepEqual(deliveryAttemptListQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(
    deliveryAttemptListQuerySchema.parse({
      result: 'FAILED',
      failureReason: 'WRONG_LOCATION',
      page: '3',
    }),
    {
      result: 'FAILED',
      failureReason: 'WRONG_LOCATION',
      page: 3,
      pageSize: 20,
    },
  );
  assert.equal(
    deliveryAttemptListQuerySchema.safeParse({ result: 'SUCCESS' }).success,
    false,
  );
});

void test('Delivery idempotency keys follow visible ASCII policy', () => {
  assert.equal(deliveryIdempotencyKeySchema.safeParse('Key-1').success, true);
  assert.equal(deliveryIdempotencyKeySchema.safeParse('').success, false);
  assert.equal(
    deliveryIdempotencyKeySchema.safeParse('x'.repeat(129)).success,
    false,
  );
  assert.equal(
    deliveryIdempotencyKeySchema.safeParse('contains space').success,
    false,
  );
});
