import assert from 'node:assert/strict';
import test from 'node:test';

import { INVENTORY_PERMISSIONS } from './inventory-permissions';

void test('defines exactly the independent B4.1 inventory permissions', () => {
  assert.deepEqual(INVENTORY_PERMISSIONS, {
    READ: 'inventory.read',
    MANAGE: 'inventory.manage',
  });
});
