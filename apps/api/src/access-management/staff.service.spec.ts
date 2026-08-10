import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import {
  type AccessManagementStore,
  MembershipAlreadyExistsError,
  type ReplacementResult,
  type RoleRecord,
  type StaffRecord,
} from './access-management.store';
import { StaffService } from './staff.service';

const CONTEXT: ResolvedMerchantContext = {
  merchant: { id: 'context-merchant', displayName: 'Merchant' },
  membership: { id: 'caller-membership' },
  roles: [],
  permissions: new Set(),
};
const STAFF: StaffRecord = {
  id: 'membership',
  status: 'ACTIVE',
  user: {
    id: 'user',
    displayName: 'Staff',
    phoneE164: '+256772123456',
    email: null,
  },
  roles: [],
};

class FakeStore implements AccessManagementStore {
  public readonly calls: unknown[][] = [];
  public user: { id: string } | null = { id: 'user' };
  public createError: Error | null = null;
  public replacement: ReplacementResult<StaffRecord> = {
    outcome: 'updated',
    value: STAFF,
  };
  public listStaff(merchantId: string) {
    this.calls.push(['list', merchantId]);
    return Promise.resolve([STAFF]);
  }
  public findActiveUserByPhone(phone: string) {
    this.calls.push(['user', phone]);
    return Promise.resolve(this.user);
  }
  public createMembership(merchantId: string, userId: string) {
    this.calls.push(['create', merchantId, userId]);
    return this.createError === null
      ? Promise.resolve(STAFF)
      : Promise.reject(this.createError);
  }
  public updateMembershipStatus(
    merchantId: string,
    membershipId: string,
    status: 'ACTIVE' | 'DISABLED',
  ) {
    this.calls.push(['status', merchantId, membershipId, status]);
    return Promise.resolve(membershipId === 'missing' ? null : STAFF);
  }
  public replaceMembershipRoles(
    merchantId: string,
    membershipId: string,
    roleIds: readonly string[],
  ) {
    this.calls.push(['roles', merchantId, membershipId, roleIds]);
    return Promise.resolve(this.replacement);
  }
  public listRoles(): Promise<readonly RoleRecord[]> {
    throw new Error('unused');
  }
  public createRole(): Promise<RoleRecord> {
    throw new Error('unused');
  }
  public updateRole(): Promise<RoleRecord | null> {
    throw new Error('unused');
  }
  public replaceRolePermissions(): Promise<ReplacementResult<RoleRecord>> {
    throw new Error('unused');
  }
  public listActivePermissionKeys(): Promise<readonly string[]> {
    throw new Error('unused');
  }
}

void test('staff list is bounded and uses context Merchant id', async () => {
  const store = new FakeStore();
  const service = new StaffService(store);
  assert.deepEqual(await service.list(CONTEXT), {
    staff: [
      {
        ...STAFF,
        user: {
          id: 'user',
          displayName: 'Staff',
          phone: '+256772123456',
          email: null,
        },
      },
    ],
  });
  assert.deepEqual(store.calls, [['list', CONTEXT.merchant.id]]);
});

void test('staff add uses normalized phone, active User, and context Merchant', async () => {
  const store = new FakeStore();
  await new StaffService(store).add(CONTEXT, { phone: '+256772123456' });
  assert.deepEqual(store.calls, [
    ['user', '+256772123456'],
    ['create', CONTEXT.merchant.id, 'user'],
  ]);
});

void test('unknown and disabled User lookup share generic 422', async () => {
  const store = new FakeStore();
  store.user = null;
  await assert.rejects(
    () => new StaffService(store).add(CONTEXT, { phone: '+256772123456' }),
    { status: 422, message: 'Unable to add staff member.' },
  );
});

void test('existing Membership maps to safe 409', async () => {
  const store = new FakeStore();
  store.createError = new MembershipAlreadyExistsError();
  await assert.rejects(
    () => new StaffService(store).add(CONTEXT, { phone: '+256772123456' }),
    { status: 409, message: 'Staff membership already exists.' },
  );
});

void test('status updates and Role replacement use context Merchant id', async () => {
  const store = new FakeStore();
  const service = new StaffService(store);
  await service.updateStatus(CONTEXT, 'membership', { status: 'DISABLED' });
  await service.replaceRoles(CONTEXT, 'membership', { roleIds: ['role'] });
  assert.deepEqual(store.calls, [
    ['status', CONTEXT.merchant.id, 'membership', 'DISABLED'],
    ['roles', CONTEXT.merchant.id, 'membership', ['role']],
  ]);
});

void test('cross-tenant/missing Membership and invalid Role sets map safely', async () => {
  const store = new FakeStore();
  const service = new StaffService(store);
  await assert.rejects(
    () => service.updateStatus(CONTEXT, 'missing', { status: 'ACTIVE' }),
    { status: 404, message: 'Not found.' },
  );
  store.replacement = { outcome: 'not-found' };
  await assert.rejects(
    () => service.replaceRoles(CONTEXT, 'foreign', { roleIds: [] }),
    { status: 404 },
  );
  store.replacement = { outcome: 'invalid-assignment' };
  await assert.rejects(
    () => service.replaceRoles(CONTEXT, 'membership', { roleIds: ['bad'] }),
    { status: 422, message: 'Invalid role assignment.' },
  );
});
