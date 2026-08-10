import assert from 'node:assert/strict';
import test from 'node:test';

import {
  idempotencyKeySchema,
  inventoryMovementSchema,
  inventoryQuantitySchema,
} from './inventory-movement.schema';

for (const type of ['RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const) {
  void test(`accepts ${type}`, () => {
    const result = inventoryMovementSchema.safeParse({
      type,
      quantity: '1',
      ...(type === 'RECEIPT' ? {} : { note: ' Physical count ' }),
    });
    assert.equal(result.success, true);
    if (result.success && type !== 'RECEIPT')
      assert.equal(result.data.note, 'Physical count');
  });
}

for (const quantity of [
  '0',
  '-1',
  '+10',
  '1.5',
  '1,000',
  '10 units',
  '1e6',
  '',
  '9223372036854775808',
]) {
  void test(`rejects invalid quantity ${JSON.stringify(quantity)}`, () => {
    assert.equal(inventoryQuantitySchema.safeParse(quantity).success, false);
  });
}

void test('normalizes whitespace and leading zeroes and preserves BIGINT exactly', () => {
  assert.equal(inventoryQuantitySchema.parse(' 00042 '), '42');
  assert.equal(
    inventoryQuantitySchema.parse('9223372036854775807'),
    '9223372036854775807',
  );
});

void test('requires adjustment notes but permits a receipt without one', () => {
  assert.equal(
    inventoryMovementSchema.safeParse({ type: 'RECEIPT', quantity: '1' })
      .success,
    true,
  );
  for (const type of ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT']) {
    assert.equal(
      inventoryMovementSchema.safeParse({ type, quantity: '1' }).success,
      false,
    );
  }
});

for (const note of ['', '   ', 'x'.repeat(501)]) {
  void test(`rejects invalid supplied note length ${note.length}`, () => {
    assert.equal(
      inventoryMovementSchema.safeParse({
        type: 'RECEIPT',
        quantity: '1',
        note,
      }).success,
      false,
    );
  });
}

for (const field of [
  'state',
  'fromState',
  'toState',
  'merchantId',
  'variantId',
  'idempotencyKey',
  'requestHash',
  'unknown',
]) {
  void test(`rejects forbidden movement field ${field}`, () => {
    assert.equal(
      inventoryMovementSchema.safeParse({
        type: 'RECEIPT',
        quantity: '1',
        [field]: 'x',
      }).success,
      false,
    );
  });
}

void test('validates opaque visible ASCII idempotency keys without changing case', () => {
  assert.equal(
    idempotencyKeySchema.parse('Case-Sensitive_01'),
    'Case-Sensitive_01',
  );
  for (const key of ['', ' ', 'has space', 'x'.repeat(129), 'line\nbreak'])
    assert.equal(idempotencyKeySchema.safeParse(key).success, false);
});
