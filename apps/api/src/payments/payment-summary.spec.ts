import assert from 'node:assert/strict';
import test from 'node:test';

import { derivePaymentSummary } from './payment-summary';

void test('empty and positive zero-verified Orders remain UNPAID', () => {
  assert.deepEqual(derivePaymentSummary(0n, 0n), {
    status: 'UNPAID',
    amountDue: 0n,
    overpaidAmount: 0n,
  });
  assert.equal(derivePaymentSummary(100_000n, 0n).status, 'UNPAID');
});

void test('derives partial, paid, and overpaid summaries with bigint arithmetic', () => {
  assert.deepEqual(derivePaymentSummary(100_000n, 40_000n), {
    status: 'PARTIALLY_PAID',
    amountDue: 60_000n,
    overpaidAmount: 0n,
  });
  assert.equal(derivePaymentSummary(100_000n, 100_000n).status, 'PAID');
  assert.deepEqual(derivePaymentSummary(100_000n, 120_000n), {
    status: 'OVERPAID',
    amountDue: 0n,
    overpaidAmount: 20_000n,
  });
});
