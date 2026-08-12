import assert from 'node:assert/strict';
import test from 'node:test';

import { providerVerificationRequestHash } from './provider-verification-idempotency';

const snapshot = {
  provider: 'MTN_MOMO' as const,
  paymentTransactionId: '0198a000-0000-7000-8000-000000000001',
  providerReference: 'provider-ref-1',
  payerPhone: '+256712345678',
  amount: 40_000n,
  currency: 'UGX',
};

void test('provider verification fingerprint is deterministic lowercase SHA-256', () => {
  const hash = providerVerificationRequestHash(snapshot);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(providerVerificationRequestHash(snapshot), hash);
});

for (const field of [
  'provider',
  'paymentTransactionId',
  'providerReference',
  'payerPhone',
  'amount',
  'currency',
] as const) {
  void test(`provider verification fingerprint covers ${field}`, () => {
    const changed = {
      ...snapshot,
      [field]:
        field === 'amount'
          ? 40_001n
          : field === 'provider'
            ? 'AIRTEL_MONEY'
            : `${snapshot[field]}-changed`,
    };
    assert.notEqual(
      providerVerificationRequestHash(changed),
      providerVerificationRequestHash(snapshot),
    );
  });
}
