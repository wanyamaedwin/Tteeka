import assert from 'node:assert/strict';
import test from 'node:test';

import { paymentListQuerySchema } from './payment-query.schema';
import {
  paymentIdempotencyKeySchema,
  reportPaymentSchema,
} from './payment.schema';

void test('cash report canonicalizes money and nullable text', () => {
  assert.deepEqual(
    reportPaymentSchema.parse({
      method: 'CASH',
      amount: '00040000',
      payerPhone: '0712345678',
      merchantReference: '  counter-1  ',
      note: '   ',
    }),
    {
      method: 'CASH',
      amount: '40000',
      payerPhone: '+256712345678',
      providerReference: null,
      merchantReference: 'counter-1',
      note: null,
    },
  );
});

for (const amount of [
  '0',
  '-1',
  '1.5',
  '1e3',
  '1,000',
  '9223372036854775808',
]) {
  void test(`rejects invalid payment amount ${amount}`, () => {
    assert.equal(
      reportPaymentSchema.safeParse({ method: 'CASH', amount }).success,
      false,
    );
  });
}

void test('accepts PostgreSQL BIGINT-safe money above Number precision', () => {
  assert.equal(
    reportPaymentSchema.parse({
      method: 'CASH',
      amount: '9007199254740993',
    }).amount,
    '9007199254740993',
  );
});

void test('mobile money requires and canonicalizes a Uganda payer phone', () => {
  assert.equal(
    reportPaymentSchema.safeParse({ method: 'MTN_MOMO', amount: '1' }).success,
    false,
  );
  assert.equal(
    reportPaymentSchema.parse({
      method: 'AIRTEL_MONEY',
      amount: '1',
      payerPhone: '0712345678',
      providerReference: '  opaque-001  ',
    }).payerPhone,
    '+256712345678',
  );
});

void test('cash rejects provider references and all report bodies are strict', () => {
  assert.equal(
    reportPaymentSchema.safeParse({
      method: 'CASH',
      amount: '1',
      providerReference: 'provider-1',
    }).success,
    false,
  );
  assert.equal(
    reportPaymentSchema.safeParse({
      method: 'CASH',
      amount: '1',
      screenshot: 'not-accepted',
    }).success,
    false,
  );
});

void test('reference and note bounds are enforced', () => {
  for (const input of [
    { merchantReference: 'x'.repeat(161) },
    {
      providerReference: 'x'.repeat(161),
      method: 'MTN_MOMO',
      payerPhone: '0712345678',
    },
    { note: 'x'.repeat(501) },
  ]) {
    assert.equal(
      reportPaymentSchema.safeParse({ method: 'CASH', amount: '1', ...input })
        .success,
      false,
    );
  }
});

void test('idempotency keys and list pagination follow bounded policy', () => {
  assert.equal(paymentIdempotencyKeySchema.safeParse('Key-1').success, true);
  assert.equal(paymentIdempotencyKeySchema.safeParse('').success, false);
  assert.deepEqual(paymentListQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
  });
  assert.equal(
    paymentListQuerySchema.safeParse({ pageSize: '101' }).success,
    false,
  );
});
