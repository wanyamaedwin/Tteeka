import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addStaffSchema,
  membershipPatchSchema,
  membershipRoleAssignmentSchema,
} from './staff.schema';

const ROLE_ID = '018f0000-0000-7000-8000-000000000001';

void test('staff phone uses the shared canonical Uganda normalization', () => {
  assert.deepEqual(addStaffSchema.parse({ phone: '0772 123-456' }), {
    phone: '+256772123456',
  });
});

for (const body of [
  { phone: 'bad' },
  { phone: '+255772123456' },
  { phone: '0772123456', role: 'Admin' },
]) {
  void test(`rejects invalid staff input ${JSON.stringify(body)}`, () => {
    assert.equal(addStaffSchema.safeParse(body).success, false);
  });
}

for (const status of ['ACTIVE', 'DISABLED'] as const) {
  void test(`accepts Membership status ${status}`, () => {
    assert.deepEqual(membershipPatchSchema.parse({ status }), { status });
  });
}

for (const body of [
  {},
  { status: 'ARCHIVED' },
  { status: 'ACTIVE', id: 'x' },
]) {
  void test(`rejects invalid Membership patch ${JSON.stringify(body)}`, () => {
    assert.equal(membershipPatchSchema.safeParse(body).success, false);
  });
}

void test('accepts an empty Role replacement set', () => {
  assert.deepEqual(membershipRoleAssignmentSchema.parse({ roleIds: [] }), {
    roleIds: [],
  });
});

void test('deduplicates Role ids', () => {
  assert.deepEqual(
    membershipRoleAssignmentSchema.parse({ roleIds: [ROLE_ID, ROLE_ID] }),
    { roleIds: [ROLE_ID] },
  );
});

void test('rejects malformed Role ids, oversized sets, and unknown fields', () => {
  assert.equal(
    membershipRoleAssignmentSchema.safeParse({ roleIds: ['not-uuid'] }).success,
    false,
  );
  assert.equal(
    membershipRoleAssignmentSchema.safeParse({
      roleIds: Array.from({ length: 51 }, () => ROLE_ID),
    }).success,
    false,
  );
  assert.equal(
    membershipRoleAssignmentSchema.safeParse({ roleIds: [], status: 'ACTIVE' })
      .success,
    false,
  );
});
