import assert from 'node:assert/strict';
import test from 'node:test';

import { inventoryRequestHash } from './inventory-idempotency';

const variant = '018f1e2d-3c4b-7a69-8def-1234567890ab';
const command = { type: 'RECEIPT' as const, quantity: '10', note: null };

void test('inventory request fingerprints are deterministic lowercase SHA-256', () => {
  const hash = inventoryRequestHash(variant, command);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, inventoryRequestHash(variant, command));
});

void test('fingerprint changes with Variant, type, quantity, and note', () => {
  const base = inventoryRequestHash(variant, command);
  const hashes = [
    inventoryRequestHash('018f1e2d-3c4b-7a69-8def-1234567890ac', command),
    inventoryRequestHash(variant, { ...command, type: 'ADJUSTMENT_IN' }),
    inventoryRequestHash(variant, { ...command, quantity: '11' }),
    inventoryRequestHash(variant, { ...command, note: 'reason' }),
  ];
  assert.equal(
    hashes.every((hash) => hash !== base),
    true,
  );
});
