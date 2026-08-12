import assert from 'node:assert/strict';
import test from 'node:test';

import { stockHoldRequestHash } from './stock-hold-idempotency';

const variantId = '018f1e2d-3c4b-7a69-8def-1234567890ab';
const request = { quantity: '10', expiresAt: '2026-08-12T12:00:00.000Z' };

void test('hold fingerprint is deterministic lowercase SHA-256', () => {
  const hash = stockHoldRequestHash(variantId, request);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, stockHoldRequestHash(variantId, request));
});

void test('hold fingerprint changes with every semantic input', () => {
  const base = stockHoldRequestHash(variantId, request);
  assert.notEqual(
    base,
    stockHoldRequestHash('018f1e2d-3c4b-7a69-8def-1234567890ac', request),
  );
  assert.notEqual(
    base,
    stockHoldRequestHash(variantId, { ...request, quantity: '11' }),
  );
  assert.notEqual(
    base,
    stockHoldRequestHash(variantId, {
      ...request,
      expiresAt: '2026-08-12T12:01:00.000Z',
    }),
  );
});
