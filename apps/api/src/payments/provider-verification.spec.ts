import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EmptyProviderVerificationRegistry,
  type ProviderVerificationInput,
} from './provider-verification';
import { completionFromResult } from './provider-verification.service';

const input: ProviderVerificationInput = {
  provider: 'MTN_MOMO',
  paymentTransactionId: '0198a000-0000-7000-8000-000000000001',
  providerReference: 'ref-1',
  payerPhone: '+256712345678',
  amount: 40_000n,
  currency: 'UGX',
};

void test('production registry has no adapter or false verification fallback', () => {
  assert.equal(
    new EmptyProviderVerificationRegistry().resolve('MTN_MOMO'),
    null,
  );
  assert.equal(
    new EmptyProviderVerificationRegistry().resolve('AIRTEL_MONEY'),
    null,
  );
});

void test('exact normalized provider evidence verifies', () => {
  const result = completionFromResult(
    input,
    {
      outcome: 'VERIFIED',
      provider: 'MTN_MOMO',
      amount: 40_000n,
      currency: 'UGX',
      payerPhone: '+256712345678',
      providerReference: 'ref-1',
      providerTransactionId: 'txn-1',
    },
    new Date('2026-08-13T12:00:00Z'),
  );
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.providerTransactionId, 'txn-1');
});

for (const mismatch of [
  { amount: 39_000n },
  { currency: 'USD' },
  { provider: 'AIRTEL_MONEY' as const },
  { payerPhone: '+256772345678' },
  { providerReference: 'other-ref' },
]) {
  void test(`mismatched evidence becomes NOT_VERIFIED: ${JSON.stringify(
    mismatch,
    (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
  )}`, () => {
    assert.equal(
      completionFromResult(
        input,
        {
          outcome: 'VERIFIED',
          provider: 'MTN_MOMO',
          amount: 40_000n,
          currency: 'UGX',
          ...mismatch,
        },
        new Date(),
      ).status,
      'NOT_VERIFIED',
    );
  });
}

void test('technical failures stay attempt failures with bounded evidence', () => {
  const result = completionFromResult(
    input,
    {
      outcome: 'FAILED',
      failureCode: 'X'.repeat(100),
      failureMessage: 'Y'.repeat(600),
    },
    new Date(),
  );
  assert.equal(result.status, 'FAILED');
  assert.equal(result.failureCode?.length, 80);
  assert.equal(result.failureMessage?.length, 500);
});
