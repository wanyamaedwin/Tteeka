import assert from 'node:assert/strict';
import test from 'node:test';

import type { AccessManagementStore } from './access-management.store';
import { APPLICATION_PERMISSION_CATALOG } from './application-permission-catalog';
import { PermissionCatalogService } from './permission-catalog.service';

void test('catalog exposes only code-owned keys active in PostgreSQL', async () => {
  const active: string[] = [
    APPLICATION_PERMISSION_CATALOG[0].key,
    APPLICATION_PERMISSION_CATALOG[2].key,
  ];
  const store = {
    listActivePermissionKeys: (keys: readonly string[]) => {
      assert.equal(keys.length, 15);
      return Promise.resolve([...active, 'unknown.db.permission']);
    },
  } as unknown as AccessManagementStore;
  assert.deepEqual(await new PermissionCatalogService(store).listAssignable(), {
    permissions: APPLICATION_PERMISSION_CATALOG.filter(({ key }) =>
      active.includes(key),
    ),
  });
});
