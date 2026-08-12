import assert from 'node:assert/strict';
import test from 'node:test';

import { stockHoldListQuerySchema } from './stock-hold-query.schema';
import {
  createStockHoldSchema,
  updateStockHoldExpirySchema,
} from './stock-hold.schema';

void test('stock hold bodies normalize quantity and canonicalize timezone-aware expiry', () => {
  assert.deepEqual(
    createStockHoldSchema.parse({
      quantity: '0005',
      expiresAt: '2026-08-12T15:00:00+03:00',
    }),
    { quantity: '5', expiresAt: '2026-08-12T12:00:00.000Z' },
  );
  assert.deepEqual(
    updateStockHoldExpirySchema.parse({
      expiresAt: '2026-08-12T12:00:00Z',
    }),
    { expiresAt: '2026-08-12T12:00:00.000Z' },
  );
});

for (const expiresAt of ['2026-08-12', '2026-08-12T12:00:00', 'not-a-date']) {
  void test(`rejects expiry without a valid timezone: ${expiresAt}`, () => {
    assert.equal(
      createStockHoldSchema.safeParse({ quantity: '1', expiresAt }).success,
      false,
    );
  });
}

void test('stock hold request bodies are strict', () => {
  assert.equal(
    createStockHoldSchema.safeParse({
      quantity: '1',
      expiresAt: '2026-08-12T12:00:00Z',
      status: 'ACTIVE',
    }).success,
    false,
  );
  assert.equal(
    updateStockHoldExpirySchema.safeParse({
      expiresAt: '2026-08-12T12:00:00Z',
      quantity: '1',
    }).success,
    false,
  );
});

void test('hold list query defaults, bounds, and effective statuses are strict', () => {
  assert.deepEqual(stockHoldListQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
  });
  assert.equal(
    stockHoldListQuerySchema.safeParse({ status: 'ACTIVE', pageSize: '100' })
      .success,
    true,
  );
  for (const query of [
    { status: 'CANCELLED' },
    { page: '0' },
    { pageSize: '101' },
    { unknown: 'x' },
  ]) {
    assert.equal(stockHoldListQuerySchema.safeParse(query).success, false);
  }
});
