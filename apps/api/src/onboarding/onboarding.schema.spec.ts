import assert from 'node:assert/strict';
import { test } from 'node:test';

import { idempotencyKeySchema, registrationRequestSchema, workspaceRequestSchema } from './onboarding.schema';

void test('registration accepts only bounded required public fields', () => {
  const parsed = registrationRequestSchema.parse({ name: '  Test Owner  ', phone: '0772123456', password: 'password8', businessName: '  Test Shop  ' });
  assert.equal(parsed.name, 'Test Owner');
  assert.equal(parsed.businessName, 'Test Shop');
  assert.equal(registrationRequestSchema.safeParse({ ...parsed, role: 'Owner' }).success, false);
  assert.equal(registrationRequestSchema.safeParse({ ...parsed, password: 'short' }).success, false);
});

void test('workspace and idempotency schemas are strict and bounded', () => {
  assert.deepEqual(workspaceRequestSchema.parse({ businessName: ' Shop ' }), { businessName: 'Shop' });
  assert.equal(workspaceRequestSchema.safeParse({ businessName: 'Shop', userId: 'x' }).success, false);
  assert.equal(idempotencyKeySchema.safeParse('key-1').success, true);
  assert.equal(idempotencyKeySchema.safeParse('').success, false);
  assert.equal(idempotencyKeySchema.safeParse('x'.repeat(129)).success, false);
});
