import assert from 'node:assert/strict';
import test from 'node:test';

import { CATALOGUE_PERMISSIONS } from './catalogue-permissions';

void test('defines the exact B3.2 catalogue Permission keys', () => {
  assert.deepEqual(CATALOGUE_PERMISSIONS, {
    READ: 'catalogue.read',
    MANAGE: 'catalogue.manage',
    PRICE_MANAGE: 'catalogue.price.manage',
  });
});
