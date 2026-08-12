import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deliveryAttemptRequestHash,
  deliveryCreateRequestHash,
} from './delivery-idempotency';

const DELIVERY_ID = '0198a9f0-1000-7000-8000-000000000001';
const ORDER_ID = '0198a9f0-1000-7000-8000-000000000002';

void test('Delivery creation hash is deterministic lowercase SHA-256 over orderId', () => {
  const hash = deliveryCreateRequestHash({ orderId: ORDER_ID });
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, deliveryCreateRequestHash({ orderId: ORDER_ID }));
  assert.notEqual(
    hash,
    deliveryCreateRequestHash({
      orderId: '0198a9f0-1000-7000-8000-000000000003',
    }),
  );
});

void test('Attempt hash covers Delivery, result, reason, and normalized note', () => {
  const base = deliveryAttemptRequestHash(DELIVERY_ID, {
    result: 'FAILED',
    failureReason: 'OTHER',
    note: null,
  });
  assert.match(base, /^[0-9a-f]{64}$/);
  for (const changed of [
    deliveryAttemptRequestHash('0198a9f0-1000-7000-8000-000000000004', {
      result: 'FAILED',
      failureReason: 'OTHER',
      note: null,
    }),
    deliveryAttemptRequestHash(DELIVERY_ID, {
      result: 'FAILED',
      failureReason: 'CUSTOMER_REFUSED',
      note: null,
    }),
    deliveryAttemptRequestHash(DELIVERY_ID, {
      result: 'FAILED',
      failureReason: 'OTHER',
      note: 'note',
    }),
    deliveryAttemptRequestHash(DELIVERY_ID, {
      result: 'DELIVERED',
      failureReason: null,
      note: null,
    }),
  ]) {
    assert.notEqual(base, changed);
  }
});
