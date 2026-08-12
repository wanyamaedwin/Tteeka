import assert from 'node:assert/strict';
import test from 'node:test';

import { DELIVERY_PERMISSIONS } from './delivery-permissions';

void test('defines exactly the independent B8.1 Delivery permissions', () => {
  assert.deepEqual(DELIVERY_PERMISSIONS, {
    READ: 'deliveries.read',
    MANAGE: 'deliveries.manage',
  });
});
