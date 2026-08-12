import assert from 'node:assert/strict';
import test from 'node:test';

import {
  orderConfirmationRequestHash,
  orderCreateRequestHash,
} from './order-idempotency';
import {
  orderItemQuantitySchema,
  replaceOrderItemsSchema,
} from './order-items.schema';
import { orderListQuerySchema } from './order-query.schema';
import {
  createOrderSchema,
  confirmOrderSchema,
  orderIdempotencyKeySchema,
  orderPatchSchema,
} from './order.schema';

const CUSTOMER = '0198a9f0-1000-7000-8000-000000000001';
const LOCATION = '0198a9f0-1000-7000-8000-000000000002';
const VARIANT = '0198a9f0-1000-7000-8000-000000000003';

void test('Order create is strict and canonicalizes omitted location to null', () => {
  assert.deepEqual(createOrderSchema.parse({ customerId: CUSTOMER }), {
    customerId: CUSTOMER,
    deliveryLocationId: null,
  });
  assert.deepEqual(
    createOrderSchema.parse({
      customerId: CUSTOMER,
      deliveryLocationId: LOCATION,
    }),
    { customerId: CUSTOMER, deliveryLocationId: LOCATION },
  );
  assert.equal(
    createOrderSchema.safeParse({ customerId: CUSTOMER, subtotal: '0' })
      .success,
    false,
  );
});

void test('Order confirmation accepts only a canonical timezone-aware expiry', () => {
  const input = confirmOrderSchema.parse({
    expiresAt: '2026-08-13T12:00:00+03:00',
  });
  assert.deepEqual(input, { expiresAt: '2026-08-13T09:00:00.000Z' });
  for (const value of [
    {},
    { expiresAt: '2026-08-13T12:00:00' },
    { expiresAt: 'invalid' },
    { expiresAt: '2026-08-13T09:00:00Z', quantity: '1' },
  ]) {
    assert.equal(confirmOrderSchema.safeParse(value).success, false);
  }
  const hash = orderConfirmationRequestHash(CUSTOMER, input);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, orderConfirmationRequestHash(CUSTOMER, input));
  assert.notEqual(hash, orderConfirmationRequestHash(LOCATION, input));
});

void test('Order PATCH is strict, nonempty, and permits explicit location clearing', () => {
  assert.deepEqual(orderPatchSchema.parse({ deliveryLocationId: null }), {
    deliveryLocationId: null,
  });
  for (const value of [{}, { status: 'CANCELLED' }, { customerId: 'bad' }]) {
    assert.equal(orderPatchSchema.safeParse(value).success, false);
  }
});

void test('quantity is positive canonical PostgreSQL BIGINT text', () => {
  assert.equal(orderItemQuantitySchema.parse('0002'), '2');
  assert.equal(
    orderItemQuantitySchema.parse('9223372036854775807'),
    '9223372036854775807',
  );
  for (const value of ['0', '-1', '1.5', '1e3', '9223372036854775808']) {
    assert.equal(orderItemQuantitySchema.safeParse(value).success, false);
  }
});

void test('desired items allow empty, reject duplicates/extras, and cap lines at 100', () => {
  assert.deepEqual(replaceOrderItemsSchema.parse({ items: [] }), { items: [] });
  assert.equal(
    replaceOrderItemsSchema.safeParse({
      items: [
        { variantId: VARIANT, quantity: '1' },
        { variantId: VARIANT, quantity: '2' },
      ],
    }).success,
    false,
  );
  assert.equal(
    replaceOrderItemsSchema.safeParse({
      items: [{ variantId: VARIANT, quantity: '1', unitSellingPrice: '1' }],
    }).success,
    false,
  );
  assert.equal(
    replaceOrderItemsSchema.safeParse({
      items: Array.from({ length: 101 }, (_, index) => ({
        variantId: `0198a9f0-1000-7000-8000-${index.toString().padStart(12, '0')}`,
        quantity: '1',
      })),
    }).success,
    false,
  );
});

void test('Order queries apply bounds and timezone-aware half-open dates', () => {
  const parsed = orderListQuerySchema.parse({
    q: ' Sarah ',
    status: 'DRAFT',
    createdFrom: '2026-08-01T00:00:00+03:00',
    createdTo: '2026-09-01T00:00:00+03:00',
  });
  assert.equal(parsed.q, 'Sarah');
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 20);
  assert.ok(parsed.createdFrom instanceof Date);
  for (const value of [
    { page: '0' },
    { pageSize: '101' },
    { createdFrom: '2026-08-01' },
    {
      createdFrom: '2026-09-01T00:00:00Z',
      createdTo: '2026-08-01T00:00:00Z',
    },
    { unknown: 'x' },
  ]) {
    assert.equal(orderListQuerySchema.safeParse(value).success, false);
  }
});

void test('Order idempotency keys and request hashes are exact and deterministic', () => {
  assert.equal(
    orderIdempotencyKeySchema.safeParse('Case-Sensitive_1').success,
    true,
  );
  for (const key of ['', 'bad key', 'x'.repeat(129)])
    assert.equal(orderIdempotencyKeySchema.safeParse(key).success, false);
  const input = createOrderSchema.parse({ customerId: CUSTOMER });
  const hash = orderCreateRequestHash(input);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, orderCreateRequestHash(input));
  assert.notEqual(
    hash,
    orderCreateRequestHash({
      customerId: CUSTOMER,
      deliveryLocationId: LOCATION,
    }),
  );
});
