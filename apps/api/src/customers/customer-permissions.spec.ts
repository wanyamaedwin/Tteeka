import assert from 'node:assert/strict';
import test from 'node:test';

import { CUSTOMER_PERMISSIONS } from './customer-permissions';

void test('defines exactly the independent B5 customer permissions', () => {
  assert.deepEqual(CUSTOMER_PERMISSIONS, {
    READ: 'customers.read',
    MANAGE: 'customers.manage',
  });
});
