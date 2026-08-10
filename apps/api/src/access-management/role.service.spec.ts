import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import {
  type AccessManagementStore,
  type ReplacementResult,
  type RoleRecord,
  RoleNameAlreadyExistsError,
  type StaffRecord,
} from './access-management.store';
import { RoleService } from './role.service';

const CONTEXT: ResolvedMerchantContext = {
  merchant: { id: 'context-merchant', displayName: 'Merchant' },
  membership: { id: 'membership' },
  roles: [],
  permissions: new Set(),
};
const ROLE: RoleRecord = {
  id: 'role',
  name: 'Manager',
  description: null,
  status: 'ACTIVE',
  permissions: [],
};

class FakeStore implements AccessManagementStore {
  public readonly calls: unknown[][] = [];
  public conflict = false;
  public replacement: ReplacementResult<RoleRecord> = {
    outcome: 'updated',
    value: ROLE,
  };
  public listStaff(): Promise<readonly StaffRecord[]> {
    throw new Error('unused');
  }
  public findActiveUserByPhone(): Promise<{ id: string } | null> {
    throw new Error('unused');
  }
  public createMembership(): Promise<StaffRecord> {
    throw new Error('unused');
  }
  public updateMembershipStatus(): Promise<StaffRecord | null> {
    throw new Error('unused');
  }
  public replaceMembershipRoles(): Promise<ReplacementResult<StaffRecord>> {
    throw new Error('unused');
  }
  public listRoles(merchantId: string) {
    this.calls.push(['list', merchantId]);
    return Promise.resolve([ROLE]);
  }
  public createRole(merchantId: string, input: unknown) {
    this.calls.push(['create', merchantId, input]);
    return this.conflict
      ? Promise.reject(new RoleNameAlreadyExistsError())
      : Promise.resolve(ROLE);
  }
  public updateRole(merchantId: string, roleId: string, patch: unknown) {
    this.calls.push(['update', merchantId, roleId, patch]);
    return this.conflict
      ? Promise.reject(new RoleNameAlreadyExistsError())
      : Promise.resolve(roleId === 'missing' ? null : ROLE);
  }
  public replaceRolePermissions(
    merchantId: string,
    roleId: string,
    keys: readonly string[],
  ) {
    this.calls.push(['permissions', merchantId, roleId, keys]);
    return Promise.resolve(this.replacement);
  }
  public listActivePermissionKeys(): Promise<readonly string[]> {
    throw new Error('unused');
  }
}

void test('Role list/create/update use context Merchant id', async () => {
  const store = new FakeStore();
  const service = new RoleService(store);
  await service.list(CONTEXT);
  await service.create(CONTEXT, { name: 'Manager' });
  await service.update(CONTEXT, 'role', { status: 'DISABLED' });
  assert.deepEqual(store.calls, [
    ['list', CONTEXT.merchant.id],
    ['create', CONTEXT.merchant.id, { name: 'Manager' }],
    ['update', CONTEXT.merchant.id, 'role', { status: 'DISABLED' }],
  ]);
});

void test('duplicate Role names map to safe 409', async () => {
  const store = new FakeStore();
  store.conflict = true;
  await assert.rejects(
    () => new RoleService(store).create(CONTEXT, { name: 'Manager' }),
    { status: 409, message: 'Role name already exists.' },
  );
});

void test('cross-tenant/missing Role maps to generic 404', async () => {
  await assert.rejects(
    () =>
      new RoleService(new FakeStore()).update(CONTEXT, 'missing', {
        status: 'ACTIVE',
      }),
    { status: 404, message: 'Not found.' },
  );
});

void test('Permission replacement is exact and maps invalid state safely', async () => {
  const store = new FakeStore();
  const service = new RoleService(store);
  await service.replacePermissions(CONTEXT, 'role', {
    permissionKeys: ['merchant.profile.read'],
  });
  assert.deepEqual(store.calls, [
    ['permissions', CONTEXT.merchant.id, 'role', ['merchant.profile.read']],
  ]);
  store.replacement = { outcome: 'not-found' };
  await assert.rejects(
    () =>
      service.replacePermissions(CONTEXT, 'foreign', { permissionKeys: [] }),
    { status: 404 },
  );
  store.replacement = { outcome: 'invalid-assignment' };
  await assert.rejects(
    () =>
      service.replacePermissions(CONTEXT, 'role', {
        permissionKeys: ['merchant.profile.read'],
      }),
    { status: 422, message: 'Invalid permission assignment.' },
  );
  await assert.rejects(
    () =>
      service.replacePermissions(CONTEXT, 'role', {
        permissionKeys: ['test.resource.read'],
      }),
    { status: 400, message: 'Invalid Permission assignment request.' },
  );
});
