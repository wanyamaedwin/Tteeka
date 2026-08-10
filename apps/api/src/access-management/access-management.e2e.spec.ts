import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';
import { hashPassword, hashSessionToken } from '@tteeka/security';
import cookieParser from 'cookie-parser';

import { AppModule } from '../app.module';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { MERCHANT_PERMISSIONS } from '../merchants/merchant-permissions';
import { ACCESS_MANAGEMENT_PERMISSIONS } from './access-management-permissions';
import { syncApplicationPermissions } from './permission-sync';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0)
  throw new Error('Access-management E2E tests require DATABASE_URL.');
const client = createPrismaClient({ databaseUrl });
const PREFIX = 'B2.2 Access API Test';
const PASSWORD = 'Synthetic B2.2 Password';
let app: INestApplication;
let baseUrl: string;

function phone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}
async function user(label: string, status: 'ACTIVE' | 'DISABLED' = 'ACTIVE') {
  const phoneE164 = phone();
  const record = await client.user.create({
    data: {
      displayName: `${PREFIX} ${label} ${randomUUID()}`,
      phoneE164,
      status,
      passwordCredential: {
        create: { passwordHash: await hashPassword(PASSWORD) },
      },
    },
  });
  return { record, localPhone: `0${phoneE164.slice(4)}` };
}
async function merchant(label: string) {
  return client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
}
async function membership(userId: string, merchantId: string) {
  return client.merchantMembership.create({ data: { userId, merchantId } });
}
async function roleWithGrants(
  merchantId: string,
  membershipId: string,
  keys: readonly string[],
) {
  const role = await client.role.create({
    data: { merchantId, name: `${PREFIX} Role ${randomUUID()}` },
  });
  await client.membershipRole.create({
    data: { merchantId, membershipId, roleId: role.id },
  });
  const permissions = await client.permission.findMany({
    where: { key: { in: [...keys] }, status: 'ACTIVE' },
    select: { id: true },
  });
  assert.equal(permissions.length, keys.length);
  await client.rolePermission.createMany({
    data: permissions.map(({ id }) => ({
      merchantId,
      roleId: role.id,
      permissionId: id,
    })),
  });
  return role;
}
async function login(localPhone: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: localPhone, password: PASSWORD }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  const pair = cookie.split(';', 1)[0];
  if (pair === undefined) throw new Error('Session cookie pair is missing.');
  assert.ok(pair.startsWith(`${SESSION_COOKIE_NAME}=`));
  return pair.slice(`${SESSION_COOKIE_NAME}=`.length);
}
function request(
  merchantId: string,
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token !== undefined)
    headers.cookie = `${SESSION_COOKIE_NAME}=${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}/api/v1/merchants/${merchantId}/${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}
async function administrator(merchantId: string, keys: readonly string[]) {
  const created = await user('Administrator');
  const member = await membership(created.record.id, merchantId);
  await roleWithGrants(merchantId, member.id, keys);
  return {
    ...created,
    membership: member,
    token: await login(created.localPhone),
  };
}
async function cleanup(): Promise<void> {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const merchantIds = merchants.map(({ id }) => id);
  const users = await client.user.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  await client.rolePermission.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.membershipRole.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.session.deleteMany({ where: { userId: { in: userIds } } });
  await client.passwordCredential.deleteMany({
    where: { userId: { in: userIds } },
  });
  await client.merchantMembership.deleteMany({
    where: {
      OR: [{ merchantId: { in: merchantIds } }, { userId: { in: userIds } }],
    },
  });
  await client.role.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await client.permission.deleteMany({
    where: { key: { startsWith: 'test.b22.api.' } },
  });
  await client.user.deleteMany({ where: { id: { in: userIds } } });
  await client.merchant.deleteMany({ where: { id: { in: merchantIds } } });
}

before(async () => {
  await cleanup();
  await syncApplicationPermissions(client);
  app = await NestFactory.create(AppModule, {
    logger: ['error'],
    abortOnError: false,
  });
  app.use(cookieParser());
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});
after(async () => {
  await app.close();
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('all nine routes use the authentication and Merchant-context pipeline', async () => {
  const target = await merchant('Pipeline');
  const routes: [string, string, unknown?][] = [
    ['staff', 'GET'],
    ['staff', 'POST', { phone: '0772123456' }],
    [
      'staff/018f0000-0000-7000-8000-000000000001',
      'PATCH',
      { status: 'ACTIVE' },
    ],
    [
      'staff/018f0000-0000-7000-8000-000000000001/roles',
      'PUT',
      { roleIds: [] },
    ],
    ['roles', 'GET'],
    ['roles', 'POST', { name: 'Role' }],
    [
      'roles/018f0000-0000-7000-8000-000000000001',
      'PATCH',
      { status: 'ACTIVE' },
    ],
    [
      'roles/018f0000-0000-7000-8000-000000000001/permissions',
      'PUT',
      { permissionKeys: [] },
    ],
    ['permissions', 'GET'],
  ];
  for (const [path, method, body] of routes)
    assert.equal(
      (await request(target.id, path, { method, body })).status,
      401,
    );
  const admin = await administrator(
    target.id,
    Object.values(ACCESS_MANAGEMENT_PERMISSIONS),
  );
  assert.equal(
    (
      await request(target.id, 'staff/not-a-uuid', {
        token: admin.token,
        method: 'PATCH',
        body: { status: 'ACTIVE' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(target.id, 'roles/not-a-uuid', {
        token: admin.token,
        method: 'PATCH',
        body: { status: 'ACTIVE' },
      })
    ).status,
    400,
  );
});

void test('staff management is existing-User-only, enumeration-safe, conflict-safe, and independent per Merchant', async () => {
  const merchantA = await merchant('Staff A');
  const merchantB = await merchant('Staff B');
  const admin = await administrator(merchantA.id, [
    ACCESS_MANAGEMENT_PERMISSIONS.STAFF_READ,
    ACCESS_MANAGEMENT_PERMISSIONS.STAFF_MANAGE,
  ]);
  const active = await user('Active');
  await membership(active.record.id, merchantB.id);
  const disabled = await user('Disabled', 'DISABLED');
  const unknown = await request(merchantA.id, 'staff', {
    token: admin.token,
    method: 'POST',
    body: { phone: '0772000000' },
  });
  const inactive = await request(merchantA.id, 'staff', {
    token: admin.token,
    method: 'POST',
    body: { phone: disabled.localPhone },
  });
  assert.equal(unknown.status, 422);
  assert.equal(inactive.status, 422);
  assert.deepEqual(await unknown.json(), await inactive.json());
  const added = await request(merchantA.id, 'staff', {
    token: admin.token,
    method: 'POST',
    body: { phone: active.localPhone },
  });
  assert.equal(added.status, 201);
  const addedBody = (await added.json()) as {
    id: string;
    status: string;
    roles: unknown[];
  };
  assert.equal(addedBody.status, 'ACTIVE');
  assert.deepEqual(addedBody.roles, []);
  assert.equal(
    (
      await request(merchantA.id, 'staff', {
        token: admin.token,
        method: 'POST',
        body: { phone: active.localPhone },
      })
    ).status,
    409,
  );
  const list = await request(merchantA.id, 'staff', { token: admin.token });
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('cache-control'), 'no-store');
  assert.equal(list.headers.get('set-cookie'), null);
  assert.equal(
    (
      await request(merchantA.id, `staff/${addedBody.id}`, {
        token: admin.token,
        method: 'PATCH',
        body: { status: 'DISABLED' },
      })
    ).status,
    200,
  );
  assert.equal(
    await client.membershipRole.count({
      where: { membershipId: addedBody.id },
    }),
    0,
  );
  assert.equal(
    (
      await request(merchantA.id, `staff/${addedBody.id}`, {
        token: admin.token,
        method: 'PATCH',
        body: { status: 'ACTIVE' },
      })
    ).status,
    200,
  );
});

void test('manage Permissions do not imply read Permissions', async () => {
  const target = await merchant('Exact grants');
  const admin = await administrator(target.id, [
    ACCESS_MANAGEMENT_PERMISSIONS.STAFF_MANAGE,
    ACCESS_MANAGEMENT_PERMISSIONS.ROLES_MANAGE,
  ]);
  const staff = await user('Manage only');
  assert.equal(
    (await request(target.id, 'staff', { token: admin.token })).status,
    403,
  );
  assert.equal(
    (
      await request(target.id, 'staff', {
        token: admin.token,
        method: 'POST',
        body: { phone: staff.localPhone },
      })
    ).status,
    201,
  );
  assert.equal(
    (await request(target.id, 'roles', { token: admin.token })).status,
    403,
  );
  assert.equal(
    (await request(target.id, 'permissions', { token: admin.token })).status,
    403,
  );
  assert.equal(
    (
      await request(target.id, 'roles', {
        token: admin.token,
        method: 'POST',
        body: { name: `Manager ${randomUUID()}` },
      })
    ).status,
    201,
  );
});

void test('Role lifecycle, duplicate names, deterministic listing, and links are preserved', async () => {
  const target = await merchant('Roles');
  const admin = await administrator(target.id, [
    ACCESS_MANAGEMENT_PERMISSIONS.ROLES_READ,
    ACCESS_MANAGEMENT_PERMISSIONS.ROLES_MANAGE,
  ]);
  const name = `Operator ${randomUUID()}`;
  const created = await request(target.id, 'roles', {
    token: admin.token,
    method: 'POST',
    body: { name: ` ${name} `, description: ' Operators ' },
  });
  assert.equal(created.status, 201);
  const role = (await created.json()) as {
    id: string;
    name: string;
    status: string;
    permissions: unknown[];
  };
  assert.equal(role.name, name);
  assert.equal(role.status, 'ACTIVE');
  assert.deepEqual(role.permissions, []);
  assert.equal(
    (
      await request(target.id, 'roles', {
        token: admin.token,
        method: 'POST',
        body: { name },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(target.id, `roles/${role.id}`, {
        token: admin.token,
        method: 'PATCH',
        body: { description: null, status: 'DISABLED' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(target.id, `roles/${role.id}`, {
        token: admin.token,
        method: 'PATCH',
        body: { status: 'ACTIVE' },
      })
    ).status,
    200,
  );
  const listed = await request(target.id, 'roles', { token: admin.token });
  assert.equal(listed.status, 200);
});

void test('Role and Permission exact replacements take effect without relogin and preserve Session', async () => {
  const target = await merchant('Immediate');
  const admin = await administrator(target.id, [
    ACCESS_MANAGEMENT_PERMISSIONS.ROLES_MANAGE,
  ]);
  const staff = await user('Effective');
  const staffMembership = await membership(staff.record.id, target.id);
  const staffToken = await login(staff.localPhone);
  const before = await client.session.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(staffToken) },
  });
  const sessionCount = await client.session.count({
    where: { userId: staff.record.id },
  });
  const created = await request(target.id, 'roles', {
    token: admin.token,
    method: 'POST',
    body: { name: `Effective ${randomUUID()}` },
  });
  const role = (await created.json()) as { id: string };
  assert.equal(
    (await request(target.id, 'profile', { token: staffToken })).status,
    403,
  );
  assert.equal(
    (
      await request(target.id, `staff/${staffMembership.id}/roles`, {
        token: admin.token,
        method: 'PUT',
        body: { roleIds: [role.id, role.id] },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(target.id, 'profile', { token: staffToken })).status,
    403,
  );
  assert.equal(
    (
      await request(target.id, `roles/${role.id}/permissions`, {
        token: admin.token,
        method: 'PUT',
        body: {
          permissionKeys: [
            MERCHANT_PERMISSIONS.PROFILE_READ,
            MERCHANT_PERMISSIONS.PROFILE_READ,
          ],
        },
      })
    ).status,
    200,
  );
  const allowed = await request(target.id, 'profile', { token: staffToken });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('set-cookie'), null);
  await request(target.id, `roles/${role.id}`, {
    token: admin.token,
    method: 'PATCH',
    body: { status: 'DISABLED' },
  });
  assert.equal(
    (await request(target.id, 'profile', { token: staffToken })).status,
    403,
  );
  await request(target.id, `roles/${role.id}`, {
    token: admin.token,
    method: 'PATCH',
    body: { status: 'ACTIVE' },
  });
  assert.equal(
    (await request(target.id, 'profile', { token: staffToken })).status,
    200,
  );
  await request(target.id, `roles/${role.id}/permissions`, {
    token: admin.token,
    method: 'PUT',
    body: { permissionKeys: [] },
  });
  assert.equal(
    (await request(target.id, 'profile', { token: staffToken })).status,
    403,
  );
  await request(target.id, `staff/${staffMembership.id}/roles`, {
    token: admin.token,
    method: 'PUT',
    body: { roleIds: [] },
  });
  assert.equal(
    await client.membershipRole.count({
      where: { membershipId: staffMembership.id },
    }),
    0,
  );
  const after = await client.session.findUniqueOrThrow({
    where: { id: before.id },
  });
  assert.equal(after.tokenHash, before.tokenHash);
  assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime());
  assert.equal(
    await client.session.count({ where: { userId: staff.record.id } }),
    sessionCount,
  );
});

void test('tenant targets and assignment inputs fail without cross-Merchant mutation', async () => {
  const merchantA = await merchant('Tenant A');
  const merchantB = await merchant('Tenant B');
  const admin = await administrator(merchantA.id, [
    ACCESS_MANAGEMENT_PERMISSIONS.STAFF_MANAGE,
    ACCESS_MANAGEMENT_PERMISSIONS.ROLES_MANAGE,
  ]);
  const person = await user('Tenant');
  const membershipA = await membership(person.record.id, merchantA.id);
  const membershipB = await membership(person.record.id, merchantB.id);
  const roleB = await client.role.create({
    data: {
      merchantId: merchantB.id,
      name: `${PREFIX} Foreign ${randomUUID()}`,
    },
  });
  assert.equal(
    (
      await request(merchantA.id, `staff/${membershipB.id}`, {
        token: admin.token,
        method: 'PATCH',
        body: { status: 'DISABLED' },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(merchantA.id, `roles/${roleB.id}`, {
        token: admin.token,
        method: 'PATCH',
        body: { status: 'DISABLED' },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(merchantA.id, `staff/${membershipA.id}/roles`, {
        token: admin.token,
        method: 'PUT',
        body: { roleIds: [roleB.id] },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await client.merchantMembership.findUniqueOrThrow({
        where: { id: membershipB.id },
      })
    ).status,
    'ACTIVE',
  );
  assert.equal(
    (await client.role.findUniqueOrThrow({ where: { id: roleB.id } })).status,
    'ACTIVE',
  );
});

void test('catalog hides unknown/deprecated records and historical deprecated grants remain visible but unassignable', async () => {
  const target = await merchant('Catalog');
  const admin = await administrator(target.id, [
    ACCESS_MANAGEMENT_PERMISSIONS.ROLES_READ,
    ACCESS_MANAGEMENT_PERMISSIONS.ROLES_MANAGE,
  ]);
  const role = await client.role.create({
    data: {
      merchantId: target.id,
      name: `${PREFIX} Historical ${randomUUID()}`,
    },
  });
  const unknownKey = `test.b22.api.unknown.${randomUUID()}`;
  await client.permission.create({ data: { key: unknownKey } });
  const deprecatedKey = MERCHANT_PERMISSIONS.SETTINGS_READ;
  const permission = await client.permission.update({
    where: { key: deprecatedKey },
    data: { status: 'DEPRECATED' },
  });
  await client.rolePermission.create({
    data: {
      merchantId: target.id,
      roleId: role.id,
      permissionId: permission.id,
    },
  });
  const catalogResponse = await request(target.id, 'permissions', {
    token: admin.token,
  });
  assert.equal(catalogResponse.status, 200);
  const catalog = (await catalogResponse.json()) as {
    permissions: { key: string }[];
  };
  assert.equal(
    catalog.permissions.some(
      ({ key }) => key === unknownKey || key === deprecatedKey,
    ),
    false,
  );
  assert.equal(
    (
      await request(target.id, `roles/${role.id}/permissions`, {
        token: admin.token,
        method: 'PUT',
        body: { permissionKeys: ['test.resource.read'] },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(target.id, `roles/${role.id}/permissions`, {
        token: admin.token,
        method: 'PUT',
        body: { permissionKeys: [deprecatedKey] },
      })
    ).status,
    422,
  );
  const roles = (await (
    await request(target.id, 'roles', { token: admin.token })
  ).json()) as {
    roles: { id: string; permissions: { key: string; status: string }[] }[];
  };
  assert.deepEqual(roles.roles.find(({ id }) => id === role.id)?.permissions, [
    { key: deprecatedKey, status: 'DEPRECATED' },
  ]);
  await client.permission.update({
    where: { key: deprecatedKey },
    data: { status: 'ACTIVE' },
  });
});

void test('self-disable removes Merchant access but leaves global authentication valid', async () => {
  const target = await merchant('Self');
  const admin = await administrator(target.id, [
    ACCESS_MANAGEMENT_PERMISSIONS.STAFF_MANAGE,
  ]);
  assert.equal(
    (
      await request(target.id, `staff/${admin.membership.id}`, {
        token: admin.token,
        method: 'PATCH',
        body: { status: 'DISABLED' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(target.id, 'staff', { token: admin.token })).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${admin.token}` },
      })
    ).status,
    200,
  );
});
