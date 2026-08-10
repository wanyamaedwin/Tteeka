import assert from 'node:assert/strict';
import test from 'node:test';

import { inventoryLedgerQuerySchema } from './inventory-ledger-query.schema';
import { inventoryListQuerySchema } from './inventory-query.schema';

const UUID7 = '018f1e2d-3c4b-7a69-8def-1234567890ab';

void test('inventory list query has bounded defaults and normalization', () => {
  assert.deepEqual(inventoryListQuerySchema.parse({}), {
    page: 1,
    pageSize: 50,
  });
  assert.deepEqual(
    inventoryListQuerySchema.parse({
      q: ' shirt ',
      productId: UUID7,
      status: 'ARCHIVED',
      page: '2',
      pageSize: '100',
    }),
    {
      q: 'shirt',
      productId: UUID7,
      status: 'ARCHIVED',
      page: 2,
      pageSize: 100,
    },
  );
});

for (const query of [
  { q: ' ' },
  { q: 'x'.repeat(101) },
  { productId: 'bad' },
  { status: 'BAD' },
  { page: '0' },
  { page: '1.5' },
  { pageSize: '101' },
  { extra: 'x' },
]) {
  void test(`rejects invalid inventory query ${JSON.stringify(query)}`, () =>
    assert.equal(inventoryListQuerySchema.safeParse(query).success, false));
}

void test('ledger query accepts only B4.1 types and bounded pagination', () => {
  assert.deepEqual(inventoryLedgerQuerySchema.parse({}), {
    page: 1,
    pageSize: 50,
  });
  for (const type of ['RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])
    assert.equal(inventoryLedgerQuerySchema.safeParse({ type }).success, true);
  for (const query of [
    { type: 'SALE' },
    { page: 0 },
    { pageSize: 101 },
    { other: 1 },
  ])
    assert.equal(inventoryLedgerQuerySchema.safeParse(query).success, false);
});
