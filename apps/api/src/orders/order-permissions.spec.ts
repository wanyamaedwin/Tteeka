import assert from 'node:assert/strict';
import test from 'node:test';

import { ORDER_PERMISSIONS } from './order-permissions';

void test('defines exactly independent B6.1 Order permissions', () => {
  assert.deepEqual(ORDER_PERMISSIONS, {
    READ: 'orders.read',
    MANAGE: 'orders.manage',
  });
});
