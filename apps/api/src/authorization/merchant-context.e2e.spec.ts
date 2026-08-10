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

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Merchant-context E2E tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const TEST_PREFIX = 'B1.8 Merchant Context Test';
const PERMISSION_PREFIX = 'b1.8.';
const PASSWORD = 'Synthetic B1.8 Password';
const UNKNOWN_UUID_V7 = '018f0000-0000-7000-8000-000000000099';
let app: INestApplication;
let baseUrl: string;

function canonicalPhone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}

async function createUser() {
  const phoneE164 = canonicalPhone();
  const user = await client.user.create({
    data: {
      displayName: `${TEST_PREFIX} User ${randomUUID()}`,
      phoneE164,
      passwordCredential: {
        create: { passwordHash: await hashPassword(PASSWORD) },
      },
    },
  });
  return { user, localPhone: `0${phoneE164.slice(4)}` };
}

async function createMerchant(
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' = 'ACTIVE',
) {
  return client.merchant.create({
    data: {
      displayName: `${TEST_PREFIX} Merchant ${randomUUID()}`,
      status,
    },
  });
}

async function createMembership(
  userId: string,
  merchantId: string,
  status: 'ACTIVE' | 'DISABLED' = 'ACTIVE',
) {
  return client.merchantMembership.create({
    data: { userId, merchantId, status },
  });
}

async function createRole(
  merchantId: string,
  name: string,
  status: 'ACTIVE' | 'DISABLED' = 'ACTIVE',
) {
  return client.role.create({
    data: { merchantId, name: `${name} ${randomUUID()}`, status },
  });
}

async function createPermission(
  label: string,
  status: 'ACTIVE' | 'DEPRECATED' = 'ACTIVE',
) {
  return client.permission.create({
    data: {
      key: `${PERMISSION_PREFIX}${label}.${randomUUID()}`,
      status,
    },
  });
}

async function assignRole(
  membership: { id: string; merchantId: string },
  role: { id: string },
): Promise<void> {
  await client.membershipRole.create({
    data: {
      merchantId: membership.merchantId,
      membershipId: membership.id,
      roleId: role.id,
    },
  });
}

async function grantPermission(
  role: { id: string; merchantId: string },
  permission: { id: string },
): Promise<void> {
  await client.rolePermission.create({
    data: {
      merchantId: role.merchantId,
      roleId: role.id,
      permissionId: permission.id,
    },
  });
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

function merchantContext(merchantId: string, rawToken?: string) {
  return fetch(`${baseUrl}/api/v1/merchants/${merchantId}/context`, {
    headers:
      rawToken === undefined
        ? {}
        : { cookie: `${SESSION_COOKIE_NAME}=${rawToken}` },
  });
}

function me(rawToken: string): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${rawToken}` },
  });
}

before(async () => {
  app = await NestFactory.create(AppModule, {
    logger: ['error'],
    abortOnError: false,
  });
  app.use(cookieParser());
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

after(async () => {
  await client.rolePermission.deleteMany({
    where: { role: { merchant: { displayName: { startsWith: TEST_PREFIX } } } },
  });
  await client.membershipRole.deleteMany({
    where: { role: { merchant: { displayName: { startsWith: TEST_PREFIX } } } },
  });
  await client.session.deleteMany({
    where: { user: { displayName: { startsWith: TEST_PREFIX } } },
  });
  await client.passwordCredential.deleteMany({
    where: { user: { displayName: { startsWith: TEST_PREFIX } } },
  });
  await client.merchantMembership.deleteMany({
    where: { merchant: { displayName: { startsWith: TEST_PREFIX } } },
  });
  await client.role.deleteMany({
    where: { merchant: { displayName: { startsWith: TEST_PREFIX } } },
  });
  await client.permission.deleteMany({
    where: { key: { startsWith: PERMISSION_PREFIX } },
  });
  await client.user.deleteMany({
    where: { displayName: { startsWith: TEST_PREFIX } },
  });
  await client.merchant.deleteMany({
    where: { displayName: { startsWith: TEST_PREFIX } },
  });
  await app.close();
  await disconnectPrismaClient(client);
});

void test('authentication and merchantId validation precede authorization lookup', async () => {
  const created = await createUser();
  const rawToken = await login(created.localPhone);
  assert.equal((await merchantContext(UNKNOWN_UUID_V7)).status, 401);

  const malformed = await merchantContext('not-a-valid-uuid', rawToken);
  assert.equal(malformed.status, 400);
  assert.equal(malformed.headers.get('set-cookie'), null);

  const unknown = await merchantContext(UNKNOWN_UUID_V7, rawToken);
  assert.equal(unknown.status, 403);
  const merchant = await createMerchant();
  const noMembership = await merchantContext(merchant.id, rawToken);
  assert.equal(noMembership.status, 403);
  assert.deepEqual(await noMembership.json(), await unknown.json());
});

void test('successful context is safe, deterministic, and does not mutate Session credentials', async () => {
  const created = await createUser();
  const merchant = await createMerchant();
  const membership = await createMembership(created.user.id, merchant.id);
  const role = await createRole(merchant.id, 'Operator');
  const createOrder = await createPermission('order.create');
  const readOrder = await createPermission('order.read');
  await assignRole(membership, role);
  await grantPermission(role, readOrder);
  await grantPermission(role, createOrder);
  const rawToken = await login(created.localPhone);
  const before = await client.session.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(rawToken) },
  });
  const beforeCount = await client.session.count({
    where: { userId: created.user.id },
  });

  const response = await merchantContext(merchant.id, rawToken);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('set-cookie'), null);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(body, {
    merchant: { id: merchant.id, displayName: merchant.displayName },
    membership: { id: membership.id },
    roles: [{ id: role.id, name: role.name }],
    permissions: [createOrder.key, readOrder.key].sort(),
  });
  const bodyText = JSON.stringify(body).toLowerCase();
  for (const forbidden of [
    'password',
    'phone',
    'email',
    'tokenhash',
    before.id.toLowerCase(),
    rawToken.toLowerCase(),
  ]) {
    assert.equal(bodyText.includes(forbidden), false);
  }

  const afterSession = await client.session.findUniqueOrThrow({
    where: { id: before.id },
  });
  assert.equal(afterSession.tokenHash, before.tokenHash);
  assert.equal(afterSession.expiresAt.getTime(), before.expiresAt.getTime());
  assert.equal(
    await client.session.count({ where: { userId: created.user.id } }),
    beforeCount,
  );
});

void test('zero-Role Membership and zero-Permission Role both resolve', async () => {
  const created = await createUser();
  const rawToken = await login(created.localPhone);
  const zeroRoleMerchant = await createMerchant();
  const zeroRoleMembership = await createMembership(
    created.user.id,
    zeroRoleMerchant.id,
  );
  const zeroRoleResponse = await merchantContext(zeroRoleMerchant.id, rawToken);
  assert.equal(zeroRoleResponse.status, 200);
  assert.deepEqual(await zeroRoleResponse.json(), {
    merchant: {
      id: zeroRoleMerchant.id,
      displayName: zeroRoleMerchant.displayName,
    },
    membership: { id: zeroRoleMembership.id },
    roles: [],
    permissions: [],
  });

  const zeroPermissionMerchant = await createMerchant();
  const zeroPermissionMembership = await createMembership(
    created.user.id,
    zeroPermissionMerchant.id,
  );
  const emptyRole = await createRole(zeroPermissionMerchant.id, 'Empty');
  await assignRole(zeroPermissionMembership, emptyRole);
  const zeroPermissionResponse = await merchantContext(
    zeroPermissionMerchant.id,
    rawToken,
  );
  assert.equal(zeroPermissionResponse.status, 200);
  const body = (await zeroPermissionResponse.json()) as {
    roles: unknown[];
    permissions: unknown[];
  };
  assert.deepEqual(body.roles, [{ id: emptyRole.id, name: emptyRole.name }]);
  assert.deepEqual(body.permissions, []);
});

void test('active Roles union and deduplicate only ACTIVE Permissions in sorted order', async () => {
  const created = await createUser();
  const merchant = await createMerchant();
  const membership = await createMembership(created.user.id, merchant.id);
  const zulu = await createRole(merchant.id, 'Zulu');
  const alpha = await createRole(merchant.id, 'Alpha');
  const disabled = await createRole(merchant.id, 'Disabled', 'DISABLED');
  const orderRead = await createPermission('order.read');
  const orderCreate = await createPermission('order.create');
  const paymentRead = await createPermission('payment.read');
  const deprecated = await createPermission('legacy.read', 'DEPRECATED');
  const disabledGrant = await createPermission('admin.bypass');
  for (const role of [zulu, alpha, disabled])
    await assignRole(membership, role);
  await grantPermission(zulu, orderRead);
  await grantPermission(zulu, paymentRead);
  await grantPermission(zulu, deprecated);
  await grantPermission(alpha, orderRead);
  await grantPermission(alpha, orderCreate);
  await grantPermission(disabled, disabledGrant);
  const rawToken = await login(created.localPhone);

  const response = await merchantContext(merchant.id, rawToken);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    roles: { id: string; name: string }[];
    permissions: string[];
  };
  assert.deepEqual(body.roles, [
    { id: alpha.id, name: alpha.name },
    { id: zulu.id, name: zulu.name },
  ]);
  assert.deepEqual(
    body.permissions,
    [orderCreate.key, orderRead.key, paymentRead.key].sort(),
  );
  assert.equal(
    body.permissions.filter((key) => key === orderRead.key).length,
    1,
  );
  assert.equal(body.permissions.includes(deprecated.key), false);
  assert.equal(body.permissions.includes(disabledGrant.key), false);
});

void test('authorization lifecycle changes apply immediately without invalidating authentication', async () => {
  const created = await createUser();
  const merchant = await createMerchant();
  const membership = await createMembership(created.user.id, merchant.id);
  const role = await createRole(merchant.id, 'Lifecycle');
  const permission = await createPermission('lifecycle.read');
  await assignRole(membership, role);
  await grantPermission(role, permission);
  const rawToken = await login(created.localPhone);
  assert.equal((await merchantContext(merchant.id, rawToken)).status, 200);

  await client.role.update({
    where: { id: role.id },
    data: { status: 'DISABLED' },
  });
  const withoutRole = (await (
    await merchantContext(merchant.id, rawToken)
  ).json()) as { roles: unknown[]; permissions: unknown[] };
  assert.deepEqual(withoutRole.roles, []);
  assert.deepEqual(withoutRole.permissions, []);

  await client.role.update({
    where: { id: role.id },
    data: { status: 'ACTIVE' },
  });
  await client.permission.update({
    where: { id: permission.id },
    data: { status: 'DEPRECATED' },
  });
  const withoutPermission = (await (
    await merchantContext(merchant.id, rawToken)
  ).json()) as { roles: unknown[]; permissions: unknown[] };
  assert.deepEqual(withoutPermission.roles, [{ id: role.id, name: role.name }]);
  assert.deepEqual(withoutPermission.permissions, []);

  await client.merchantMembership.update({
    where: { id: membership.id },
    data: { status: 'DISABLED' },
  });
  assert.equal((await merchantContext(merchant.id, rawToken)).status, 403);
  assert.equal((await me(rawToken)).status, 200);

  await client.merchantMembership.update({
    where: { id: membership.id },
    data: { status: 'ACTIVE' },
  });
  await client.merchant.update({
    where: { id: merchant.id },
    data: { status: 'SUSPENDED' },
  });
  assert.equal((await merchantContext(merchant.id, rawToken)).status, 403);
  assert.equal((await me(rawToken)).status, 200);

  await client.merchant.update({
    where: { id: merchant.id },
    data: { status: 'ARCHIVED' },
  });
  assert.equal((await merchantContext(merchant.id, rawToken)).status, 403);
  assert.equal((await me(rawToken)).status, 200);
});

void test('one global Session resolves independent Merchant contexts without cross-tenant leakage', async () => {
  const userA = await createUser();
  const userB = await createUser();
  const merchantA = await createMerchant();
  const merchantB = await createMerchant();
  const membershipA = await createMembership(userA.user.id, merchantA.id);
  const membershipB = await createMembership(userA.user.id, merchantB.id);
  await createMembership(userB.user.id, merchantA.id);
  const roleA = await createRole(merchantA.id, 'Merchant A');
  const roleB = await createRole(merchantB.id, 'Merchant B');
  const permissionA = await createPermission('merchant-a.read');
  const permissionB = await createPermission('merchant-b.read');
  await assignRole(membershipA, roleA);
  await assignRole(membershipB, roleB);
  await grantPermission(roleA, permissionA);
  await grantPermission(roleB, permissionB);
  const tokenA = await login(userA.localPhone);
  const tokenB = await login(userB.localPhone);

  const contextA = (await (
    await merchantContext(merchantA.id, tokenA)
  ).json()) as { permissions: string[] };
  const contextB = (await (
    await merchantContext(merchantB.id, tokenA)
  ).json()) as { permissions: string[] };
  assert.deepEqual(contextA.permissions, [permissionA.key]);
  assert.deepEqual(contextB.permissions, [permissionB.key]);
  assert.equal(contextA.permissions.includes(permissionB.key), false);
  assert.equal(contextB.permissions.includes(permissionA.key), false);
  assert.equal((await merchantContext(merchantB.id, tokenB)).status, 403);
  assert.equal((await me(tokenB)).status, 200);
});
