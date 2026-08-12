import assert from 'node:assert/strict';
import test from 'node:test';

import { PAYMENT_PERMISSIONS } from './payment-permissions';

void test('defines exactly the independent B7.1 payment permissions', () => {
  assert.deepEqual(PAYMENT_PERMISSIONS, {
    MANAGE: 'payments.manage',
    READ: 'payments.read',
  });
});
