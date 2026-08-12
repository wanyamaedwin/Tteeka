import assert from 'node:assert/strict';
import test from 'node:test';

import { paymentRequestHash } from './payment-idempotency';

const input = {
  method: 'MTN_MOMO' as const,
  amount: '40000',
  payerPhone: '+256712345678',
  providerReference: null,
  merchantReference: 'Till 1',
  note: null,
};

void test('payment request fingerprint is deterministic lowercase SHA-256', () => {
  const first = paymentRequestHash('order-a', input);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, paymentRequestHash('order-a', input));
});

void test('payment fingerprint covers every canonical semantic field', () => {
  const original = paymentRequestHash('order-a', input);
  for (const changed of [
    ['order-b', input] as const,
    ['order-a', { ...input, method: 'AIRTEL_MONEY' as const }] as const,
    ['order-a', { ...input, amount: '40001' }] as const,
    ['order-a', { ...input, payerPhone: '+256712345679' }] as const,
    ['order-a', { ...input, providerReference: 'provider' }] as const,
    ['order-a', { ...input, merchantReference: null }] as const,
    ['order-a', { ...input, note: 'note' }] as const,
  ]) {
    assert.notEqual(paymentRequestHash(changed[0], changed[1]), original);
  }
});
