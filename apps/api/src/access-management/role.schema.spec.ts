import assert from 'node:assert/strict';
import test from 'node:test';

import { MERCHANT_PERMISSIONS } from '../merchants/merchant-permissions';
import {
  createRoleSchema,
  rolePatchSchema,
  rolePermissionAssignmentSchema,
} from './role.schema';

void test('Role creation trims valid name and description', () => {
  assert.deepEqual(
    createRoleSchema.parse({ name: ' Manager ', description: ' Operators ' }),
    { name: 'Manager', description: 'Operators' },
  );
});

void test('Role creation accepts omitted and null description', () => {
  assert.deepEqual(createRoleSchema.parse({ name: 'One' }), { name: 'One' });
  assert.deepEqual(createRoleSchema.parse({ name: 'Two', description: null }), {
    name: 'Two',
    description: null,
  });
});

for (const body of [
  { name: '' },
  { name: '   ' },
  { name: 'x'.repeat(81) },
  { name: 'Role', description: '' },
  { name: 'Role', description: 'x'.repeat(321) },
  { name: 'Role', status: 'ACTIVE' },
  { name: 'Role', permissionKeys: [] },
]) {
  void test(`rejects invalid Role creation ${JSON.stringify(body)}`, () => {
    assert.equal(createRoleSchema.safeParse(body).success, false);
  });
}

for (const status of ['ACTIVE', 'DISABLED'] as const) {
  void test(`Role patch accepts ${status}`, () => {
    assert.deepEqual(rolePatchSchema.parse({ status }), { status });
  });
}

for (const body of [
  {},
  { status: 'ARCHIVED' },
  { id: 'x' },
  { permissions: [] },
]) {
  void test(`rejects invalid Role patch ${JSON.stringify(body)}`, () => {
    assert.equal(rolePatchSchema.safeParse(body).success, false);
  });
}

void test('Permission replacement accepts empty and deduplicates catalog keys', () => {
  assert.deepEqual(
    rolePermissionAssignmentSchema.parse({ permissionKeys: [] }),
    { permissionKeys: [] },
  );
  assert.deepEqual(
    rolePermissionAssignmentSchema.parse({
      permissionKeys: [
        MERCHANT_PERMISSIONS.PROFILE_READ,
        MERCHANT_PERMISSIONS.PROFILE_READ,
      ],
    }),
    { permissionKeys: [MERCHANT_PERMISSIONS.PROFILE_READ] },
  );
});

void test('Permission replacement rejects unknown keys, oversized sets, and fields', () => {
  assert.equal(
    rolePermissionAssignmentSchema.safeParse({
      permissionKeys: ['test.resource.read'],
    }).success,
    false,
  );
  assert.equal(
    rolePermissionAssignmentSchema.safeParse({
      permissionKeys: Array.from(
        { length: 201 },
        () => MERCHANT_PERMISSIONS.PROFILE_READ,
      ),
    }).success,
    false,
  );
  assert.equal(
    rolePermissionAssignmentSchema.safeParse({
      permissionKeys: [],
      roleId: 'x',
    }).success,
    false,
  );
});
