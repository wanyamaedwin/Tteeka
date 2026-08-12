import assert from 'node:assert/strict';
import test from 'node:test';

import {
  providerVerificationBodySchema,
  verificationAttemptListQuerySchema,
} from './provider-verification.schema';

void test('provider verification accepts only absent or empty bodies', () => {
  assert.equal(
    providerVerificationBodySchema.safeParse(undefined).success,
    true,
  );
  assert.equal(providerVerificationBodySchema.safeParse({}).success, true);
  for (const body of [
    { amount: '40000' },
    { provider: 'MTN_MOMO' },
    { payerPhone: '0712345678' },
    { screenshot: 'forbidden' },
  ]) {
    assert.equal(providerVerificationBodySchema.safeParse(body).success, false);
  }
});

void test('attempt query has bounded defaults, status filtering, and strict fields', () => {
  assert.deepEqual(verificationAttemptListQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
  });
  assert.equal(
    verificationAttemptListQuerySchema.parse({ status: 'NOT_VERIFIED' }).status,
    'NOT_VERIFIED',
  );
  assert.equal(
    verificationAttemptListQuerySchema.safeParse({ pageSize: '101' }).success,
    false,
  );
  assert.equal(
    verificationAttemptListQuerySchema.safeParse({ provider: 'MTN_MOMO' })
      .success,
    false,
  );
});
