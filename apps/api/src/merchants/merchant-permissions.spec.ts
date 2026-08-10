import assert from 'node:assert/strict';
import test from 'node:test';

import { MERCHANT_PERMISSIONS } from './merchant-permissions';

void test('defines the exact canonical merchant Permission keys', () => {
  assert.deepEqual(MERCHANT_PERMISSIONS, {
    PROFILE_READ: 'merchant.profile.read',
    PROFILE_MANAGE: 'merchant.profile.manage',
    SETTINGS_READ: 'merchant.settings.read',
    SETTINGS_MANAGE: 'merchant.settings.manage',
  });
});
