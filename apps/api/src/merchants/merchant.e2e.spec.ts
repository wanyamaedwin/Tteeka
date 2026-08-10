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
import { MERCHANT_PERMISSIONS } from './merchant-permissions';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Merchant E2E tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const TEST_PREFIX = 'B2.1 Merchant API Test';
const PASSWORD = 'Synthetic B2.1 Password';
const PERMISSION_KEYS = Object.values(MERCHANT_PERMISSIONS);
let app: INestApplication;
let baseUrl: string;
const permissionIds = new Map<string, string>();

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

async function createMerchant(label = 'Merchant') {
  return client.merchant.create({
    data: {
      displayName: `${TEST_PREFIX} ${label} ${randomUUID()}`,
      legalName: `${label} Limited`,
      phoneE164: '+256772123456',
      email: `${randomUUID()}@example.test`,
    },
  });
}

async function createMembership(userId: string, merchantId: string) {
  return client.merchantMembership.create({ data: { userId, merchantId } });
}

async function grantPermissions(
  membership: { id: string; merchantId: string },
  keys: readonly string[],
) {
  const role = await client.role.create({
    data: {
      merchantId: membership.merchantId,
      name: `${TEST_PREFIX} Role ${randomUUID()}`,
    },
  });
  await client.membershipRole.create({
    data: {
      merchantId: membership.merchantId,
      membershipId: membership.id,
      roleId: role.id,
    },
  });
  for (const key of keys) {
    const permissionId = permissionIds.get(key);
    if (permissionId === undefined) throw new Error(`Missing ${key}.`);
    await client.rolePermission.create({
      data: {
        merchantId: membership.merchantId,
        roleId: role.id,
        permissionId,
      },
    });
  }
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

function merchantRequest(
  merchantId: string,
  resource: 'profile' | 'settings',
  options: { token?: string; method?: 'GET' | 'PATCH'; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) {
    headers.cookie = `${SESSION_COOKIE_NAME}=${options.token}`;
  }
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}/api/v1/merchants/${merchantId}/${resource}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

function me(rawToken: string): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${rawToken}` },
  });
}

async function cleanup(): Promise<void> {
  const testUsers = await client.user.findMany({
    where: { displayName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const userIds = testUsers.map(({ id }) => id);
  const testMemberships = await client.merchantMembership.findMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { merchant: { displayName: { startsWith: TEST_PREFIX } } },
      ],
    },
    select: { id: true, merchantId: true },
  });
  const membershipIds = testMemberships.map(({ id }) => id);
  const testRoles = await client.role.findMany({
    where: { name: { startsWith: TEST_PREFIX } },
    select: { id: true, merchantId: true },
  });
  const roleIds = testRoles.map(({ id }) => id);
  const prefixedMerchants = await client.merchant.findMany({
    where: { displayName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const merchantIds = [
    ...new Set([
      ...testMemberships.map(({ merchantId }) => merchantId),
      ...testRoles.map(({ merchantId }) => merchantId),
      ...prefixedMerchants.map(({ id }) => id),
    ]),
  ];
  await client.rolePermission.deleteMany({
    where: {
      OR: [
        { permission: { key: { in: [...PERMISSION_KEYS] } } },
        { roleId: { in: roleIds } },
      ],
    },
  });
  await client.membershipRole.deleteMany({
    where: {
      OR: [
        { membershipId: { in: membershipIds } },
        { roleId: { in: roleIds } },
      ],
    },
  });
  await client.session.deleteMany({
    where: { userId: { in: userIds } },
  });
  await client.passwordCredential.deleteMany({
    where: { userId: { in: userIds } },
  });
  await client.merchantMembership.deleteMany({
    where: { id: { in: membershipIds } },
  });
  await client.role.deleteMany({
    where: { id: { in: roleIds } },
  });
  await client.permission.deleteMany({
    where: { key: { in: [...PERMISSION_KEYS] } },
  });
  await client.user.deleteMany({
    where: { id: { in: userIds } },
  });
  await client.merchant.deleteMany({
    where: { id: { in: merchantIds } },
  });
}

before(async () => {
  await cleanup();
  for (const key of PERMISSION_KEYS) {
    const permission = await client.permission.create({ data: { key } });
    permissionIds.set(key, permission.id);
  }
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

void test('all routes enforce authentication, merchant input, and Membership before business access', async () => {
  const merchant = await createMerchant('Pipeline');
  for (const resource of ['profile', 'settings'] as const) {
    assert.equal((await merchantRequest(merchant.id, resource)).status, 401);
    assert.equal(
      (
        await merchantRequest(merchant.id, resource, {
          method: 'PATCH',
          body: { displayName: 'No session' },
        })
      ).status,
      401,
    );
  }
  const created = await createUser();
  const token = await login(created.localPhone);
  assert.equal(
    (await merchantRequest('not-a-uuid', 'profile', { token })).status,
    400,
  );
  const noMembership = await merchantRequest(merchant.id, 'profile', { token });
  assert.equal(noMembership.status, 403);
  assert.equal(
    JSON.stringify(await noMembership.json()).includes('Limited'),
    false,
  );
});

void test('profile read/update is bounded, canonical, atomic, cache-safe, and Session-safe', async () => {
  const created = await createUser();
  const merchant = await createMerchant('Profile');
  const membership = await createMembership(created.user.id, merchant.id);
  await grantPermissions(membership, [
    MERCHANT_PERMISSIONS.PROFILE_READ,
    MERCHANT_PERMISSIONS.PROFILE_MANAGE,
  ]);
  const token = await login(created.localPhone);
  const before = await client.session.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(token) },
  });
  const sessionCount = await client.session.count({
    where: { userId: created.user.id },
  });

  const read = await merchantRequest(merchant.id, 'profile', { token });
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.equal(read.headers.get('pragma'), 'no-cache');
  assert.equal(read.headers.get('set-cookie'), null);
  assert.deepEqual(await read.json(), {
    id: merchant.id,
    displayName: merchant.displayName,
    legalName: 'Profile Limited',
    phone: '+256772123456',
    email: merchant.email,
  });

  const update = await merchantRequest(merchant.id, 'profile', {
    token,
    method: 'PATCH',
    body: {
      displayName: ' Canonical Shop ',
      legalName: null,
      phone: '0772 000 001',
      email: ' SHOP@EXAMPLE.COM ',
    },
  });
  assert.equal(update.status, 200);
  assert.equal(update.headers.get('set-cookie'), null);
  assert.deepEqual(await update.json(), {
    id: merchant.id,
    displayName: 'Canonical Shop',
    legalName: null,
    phone: '+256772000001',
    email: 'shop@example.com',
  });

  const persistedBeforeInvalid = await client.merchant.findUniqueOrThrow({
    where: { id: merchant.id },
  });
  for (const body of [
    {},
    { phone: 'bad' },
    { email: 'bad' },
    { unknown: true },
    { status: 'SUSPENDED' },
    { currency: 'USD' },
    { displayName: 'Should Not Persist', email: 'bad' },
  ]) {
    assert.equal(
      (
        await merchantRequest(merchant.id, 'profile', {
          token,
          method: 'PATCH',
          body,
        })
      ).status,
      400,
    );
  }
  const persistedAfterInvalid = await client.merchant.findUniqueOrThrow({
    where: { id: merchant.id },
  });
  assert.equal(
    persistedAfterInvalid.displayName,
    persistedBeforeInvalid.displayName,
  );
  assert.equal(persistedAfterInvalid.email, persistedBeforeInvalid.email);
  assert.equal(persistedAfterInvalid.currency, 'UGX');
  assert.equal(persistedAfterInvalid.status, 'ACTIVE');
  const after = await client.session.findUniqueOrThrow({
    where: { id: before.id },
  });
  assert.equal(after.tokenHash, before.tokenHash);
  assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime());
  assert.equal(
    await client.session.count({ where: { userId: created.user.id } }),
    sessionCount,
  );
});

void test('settings read/update is canonical, atomic, and manage does not imply read', async () => {
  const created = await createUser();
  const merchant = await createMerchant('Settings');
  const membership = await createMembership(created.user.id, merchant.id);
  await grantPermissions(membership, [MERCHANT_PERMISSIONS.SETTINGS_MANAGE]);
  const token = await login(created.localPhone);
  assert.equal(
    (await merchantRequest(merchant.id, 'settings', { token })).status,
    403,
  );
  const update = await merchantRequest(merchant.id, 'settings', {
    token,
    method: 'PATCH',
    body: { currency: ' usd ', timezone: ' America/New_York ' },
  });
  assert.equal(update.status, 200);
  assert.deepEqual(await update.json(), {
    currency: 'USD',
    timezone: 'America/New_York',
  });
  await grantPermissions(membership, [MERCHANT_PERMISSIONS.SETTINGS_READ]);
  const read = await merchantRequest(merchant.id, 'settings', { token });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), {
    currency: 'USD',
    timezone: 'America/New_York',
  });
  assert.equal(read.headers.get('set-cookie'), null);

  const before = await client.merchant.findUniqueOrThrow({
    where: { id: merchant.id },
  });
  for (const body of [
    {},
    { currency: 'UG' },
    { currency: 'U1X' },
    { timezone: 'Not/A_Timezone' },
    { unknown: true },
    { displayName: 'Wrong endpoint' },
    { currency: 'EUR', timezone: 'Not/A_Timezone' },
  ]) {
    assert.equal(
      (
        await merchantRequest(merchant.id, 'settings', {
          token,
          method: 'PATCH',
          body,
        })
      ).status,
      400,
    );
  }
  const after = await client.merchant.findUniqueOrThrow({
    where: { id: merchant.id },
  });
  assert.equal(after.currency, before.currency);
  assert.equal(after.timezone, before.timezone);
  assert.equal(after.displayName, before.displayName);
  assert.equal(after.status, 'ACTIVE');
});

void test('one Session remains isolated across Merchants and updates only the resolved tenant', async () => {
  const created = await createUser();
  const merchantA = await createMerchant('Tenant A');
  const merchantB = await createMerchant('Tenant B');
  const membershipA = await createMembership(created.user.id, merchantA.id);
  const membershipB = await createMembership(created.user.id, merchantB.id);
  await grantPermissions(membershipA, [MERCHANT_PERMISSIONS.PROFILE_MANAGE]);
  const token = await login(created.localPhone);
  assert.equal(
    (await merchantRequest(merchantA.id, 'profile', { token })).status,
    403,
  );
  assert.equal(
    (
      await merchantRequest(merchantA.id, 'profile', {
        token,
        method: 'PATCH',
        body: { displayName: 'Tenant A Updated' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await merchantRequest(merchantB.id, 'profile', {
        token,
        method: 'PATCH',
        body: { displayName: 'Forbidden B' },
      })
    ).status,
    403,
  );
  await grantPermissions(membershipB, [MERCHANT_PERMISSIONS.PROFILE_MANAGE]);
  assert.equal(
    (
      await merchantRequest(merchantA.id, 'profile', {
        token,
        method: 'PATCH',
        body: { email: 'tenant-a@example.com' },
      })
    ).status,
    200,
  );
  const persistedB = await client.merchant.findUniqueOrThrow({
    where: { id: merchantB.id },
  });
  assert.equal(persistedB.displayName, merchantB.displayName);
  assert.equal(persistedB.email, merchantB.email);
});

void test('current PostgreSQL Permission and lifecycle state revoke business access without invalidating /me', async () => {
  const created = await createUser();
  const merchant = await createMerchant('Lifecycle');
  const membership = await createMembership(created.user.id, merchant.id);
  const role = await grantPermissions(membership, [
    MERCHANT_PERMISSIONS.PROFILE_READ,
  ]);
  const token = await login(created.localPhone);
  assert.equal(
    (await merchantRequest(merchant.id, 'profile', { token })).status,
    200,
  );
  await client.permission.update({
    where: { key: MERCHANT_PERMISSIONS.PROFILE_READ },
    data: { status: 'DEPRECATED' },
  });
  assert.equal(
    (await merchantRequest(merchant.id, 'profile', { token })).status,
    403,
  );
  await client.permission.update({
    where: { key: MERCHANT_PERMISSIONS.PROFILE_READ },
    data: { status: 'ACTIVE' },
  });
  await client.role.update({
    where: { id: role.id },
    data: { status: 'DISABLED' },
  });
  assert.equal(
    (await merchantRequest(merchant.id, 'profile', { token })).status,
    403,
  );
  await client.role.update({
    where: { id: role.id },
    data: { status: 'ACTIVE' },
  });
  await client.merchantMembership.update({
    where: { id: membership.id },
    data: { status: 'DISABLED' },
  });
  assert.equal(
    (await merchantRequest(merchant.id, 'profile', { token })).status,
    403,
  );
  assert.equal((await me(token)).status, 200);
  await client.merchantMembership.update({
    where: { id: membership.id },
    data: { status: 'ACTIVE' },
  });
  await client.merchant.update({
    where: { id: merchant.id },
    data: { status: 'SUSPENDED' },
  });
  assert.equal(
    (await merchantRequest(merchant.id, 'profile', { token })).status,
    403,
  );
  assert.equal((await me(token)).status, 200);
});
