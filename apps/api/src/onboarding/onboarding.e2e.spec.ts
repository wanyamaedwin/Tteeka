import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';
import { hashPassword, verifyPassword } from '@tteeka/security';
import cookieParser from 'cookie-parser';
import { APPLICATION_PERMISSION_KEYS } from '../access-management/application-permission-catalog';
import { syncApplicationPermissions } from '../access-management/permission-sync';
import { AuthModule } from '../auth/auth.module';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { DatabaseModule } from '../database/database.module';
import { MerchantModule } from '../merchants/merchant.module';
import { MERCHANT_PERMISSIONS } from '../merchants/merchant-permissions';
import { OnboardingModule } from './onboarding.module';

@Module({ imports: [ConfigurationModule, DatabaseModule, AuthModule, AuthorizationModule, MerchantModule, OnboardingModule] })
class OnboardingE2eModule {}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Onboarding E2E tests require DATABASE_URL.');
const client = createPrismaClient({ databaseUrl });
const TEST_PREFIX = 'INT0.1C Onboarding Test';
const PASSWORD = 'Synthetic Onboarding Password';
let app: INestApplication;
let baseUrl: string;
const phone = () => `+2567${randomInt(10_000_000, 100_000_000)}`;
const localPhone = (value: string) => `0${value.slice(4)}`;
const key = () => `int01c-${randomUUID()}`;

function register(body: object, idempotencyKey = key()) {
  return fetch(`${baseUrl}/api/v1/onboarding/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) });
}
function workspace(cookie: string | undefined, businessName: string, idempotencyKey = key()) {
  return fetch(`${baseUrl}/api/v1/onboarding/workspace`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey, ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ businessName }) });
}
async function login(value: string) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: value, password: PASSWORD }) });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie'); assert.ok(setCookie);
  const cookie = setCookie.split(';', 1)[0];
  if (cookie === undefined) throw new Error('Session cookie pair is missing.');
  assert.ok(cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
  return cookie;
}
async function cleanup() {
  const userIds = (await client.user.findMany({ where: { displayName: { startsWith: TEST_PREFIX } }, select: { id: true } })).map(({ id }) => id);
  const merchantIds = (await client.merchant.findMany({ where: { displayName: { startsWith: TEST_PREFIX } }, select: { id: true } })).map(({ id }) => id);
  await client.onboardingCommand.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { merchantId: { in: merchantIds } }] } });
  await client.session.deleteMany({ where: { userId: { in: userIds } } });
  await client.rolePermission.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await client.membershipRole.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await client.merchantMembership.deleteMany({ where: { OR: [{ merchantId: { in: merchantIds } }, { userId: { in: userIds } }] } });
  await client.role.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await client.passwordCredential.deleteMany({ where: { userId: { in: userIds } } });
  await client.user.deleteMany({ where: { id: { in: userIds } } });
  await client.merchant.deleteMany({ where: { id: { in: merchantIds } } });
}

before(async () => {
  await syncApplicationPermissions(client);
  app = await NestFactory.create(OnboardingE2eModule, { logger: ['error'], abortOnError: false });
  app.use(cookieParser()); await app.listen(0, '127.0.0.1'); baseUrl = await app.getUrl();
});
after(async () => {
  try {
    await cleanup();
  } finally {
    await app.close();
    await disconnectPrismaClient(client);
  }
});

void test('registers one ordinary graph, then uses normal login, me, context and explicit permission guards', async () => {
  const canonical = phone();
  const body = { name: `${TEST_PREFIX} Owner ${randomUUID()}`, phone: localPhone(canonical), password: PASSWORD, businessName: `${TEST_PREFIX} Merchant ${randomUUID()}` };
  const first = await register(body, key()); assert.equal(first.status, 201);
  const result = await first.json() as { user: { id: string }; merchant: { id: string }; membership: { id: string } };
  assert.deepEqual(Object.keys(result).sort(), ['membership', 'merchant', 'user']);
  const user = await client.user.findUniqueOrThrow({ where: { id: result.user.id }, include: { passwordCredential: true } });
  assert.equal(user.status, 'ACTIVE'); assert.equal(user.phoneE164, canonical); assert.ok(user.passwordCredential);
  assert.equal(await verifyPassword(PASSWORD, user.passwordCredential.passwordHash), true);
  const merchant = await client.merchant.findUniqueOrThrow({ where: { id: result.merchant.id } });
  assert.equal(merchant.status, 'ACTIVE'); assert.equal(merchant.currency, 'UGX'); assert.equal(merchant.timezone, 'Africa/Kampala');
  assert.equal((await client.merchantMembership.findUniqueOrThrow({ where: { id: result.membership.id } })).status, 'ACTIVE');
  const owner = await client.role.findUniqueOrThrow({ where: { merchantId_name: { merchantId: merchant.id, name: 'Owner' } }, include: { rolePermissions: { include: { permission: true } }, membershipRoles: true } });
  assert.equal(owner.membershipRoles.length, 1);
  assert.deepEqual(owner.rolePermissions.map(({ permission }) => permission.key).sort(), [...APPLICATION_PERMISSION_KEYS].sort());
  assert.equal(owner.rolePermissions.length, 21);
  const cookie = await login(localPhone(canonical));
  assert.equal((await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie } })).status, 200);
  const context = await fetch(`${baseUrl}/api/v1/merchants/${merchant.id}/context`, { headers: { cookie } }); assert.equal(context.status, 200);
  assert.equal((await context.json() as { permissions: string[] }).permissions.length, 21);
  const readPermission = owner.rolePermissions.find(({ permission }) => permission.key === MERCHANT_PERMISSIONS.PROFILE_READ); assert.ok(readPermission);
  await client.rolePermission.delete({ where: { id: readPermission.id } });
  assert.equal((await fetch(`${baseUrl}/api/v1/merchants/${merchant.id}/profile`, { headers: { cookie } })).status, 403);
});

void test('normalizes duplicate phones and preserves registration idempotency semantics', async () => {
  const canonical = phone();
  const body = { name: `${TEST_PREFIX} Replay ${randomUUID()}`, phone: localPhone(canonical), password: PASSWORD, businessName: `${TEST_PREFIX} Replay Merchant ${randomUUID()}` };
  const idempotencyKey = key();
  const first = await register(body, idempotencyKey); assert.equal(first.status, 201); const firstBody: unknown = await first.json();
  const replay = await register(body, idempotencyKey); assert.equal(replay.status, 201); assert.deepEqual(await replay.json(), firstBody);
  assert.equal((await register({ ...body, businessName: `${body.businessName} changed` }, idempotencyKey)).status, 409);
  const duplicate = await register({ ...body, phone: canonical }, key()); assert.equal(duplicate.status, 409); assert.match(JSON.stringify(await duplicate.json()), /already exists/i);
  assert.equal(await client.user.count({ where: { phoneE164: canonical } }), 1);
  assert.equal(await client.merchant.count({ where: { displayName: { startsWith: body.businessName } } }), 1);
});

void test('rolls back registration when the active code-owned catalog is incomplete', async () => {
  const missingKey = APPLICATION_PERMISSION_KEYS[0]; assert.ok(missingKey);
  await client.permission.update({ where: { key: missingKey }, data: { status: 'DEPRECATED' } });
  const canonical = phone(); const merchantName = `${TEST_PREFIX} Atomic ${randomUUID()}`;
  try {
    const response = await register({ name: `${TEST_PREFIX} Atomic Owner`, phone: canonical, password: PASSWORD, businessName: merchantName });
    assert.equal(response.status, 500);
    assert.equal(await client.user.count({ where: { phoneE164: canonical } }), 0);
    assert.equal(await client.merchant.count({ where: { displayName: merchantName } }), 0);
  } finally { await client.permission.update({ where: { key: missingKey }, data: { status: 'ACTIVE' } }); }
});

void test('authenticates a workspaceless user and creates one replayable initial workspace', async () => {
  const canonical = phone();
  const user = await client.user.create({ data: { displayName: `${TEST_PREFIX} Workspaceless ${randomUUID()}`, phoneE164: canonical, passwordCredential: { create: { passwordHash: await hashPassword(PASSWORD) } } } });
  const cookie = await login(canonical);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/v1/onboarding/workspace-status`, { headers: { cookie } })).json(), { state: 'NO_WORKSPACE' });
  const idempotencyKey = key(); const businessName = `${TEST_PREFIX} Workspace ${randomUUID()}`;
  const created = await workspace(cookie, businessName, idempotencyKey); assert.equal(created.status, 201); const result: unknown = await created.json();
  const replay = await workspace(cookie, businessName, idempotencyKey); assert.equal(replay.status, 201); assert.deepEqual(await replay.json(), result);
  assert.equal(await client.user.count({ where: { id: user.id } }), 1); assert.equal(await client.passwordCredential.count({ where: { userId: user.id } }), 1);
  assert.equal(await client.merchantMembership.count({ where: { userId: user.id, status: 'ACTIVE' } }), 1);
  assert.equal((await (await fetch(`${baseUrl}/api/v1/onboarding/workspace-status`, { headers: { cookie } })).json() as { state: string }).state, 'READY');
  assert.equal((await workspace(cookie, `${businessName} second`, key())).status, 409);
});

void test('serializes simultaneous initial-workspace commands and requires authentication', async () => {
  assert.equal((await workspace(undefined, `${TEST_PREFIX} Unauthorized`)).status, 401);
  const canonical = phone();
  const user = await client.user.create({ data: { displayName: `${TEST_PREFIX} Concurrent ${randomUUID()}`, phoneE164: canonical, passwordCredential: { create: { passwordHash: await hashPassword(PASSWORD) } } } });
  const cookie = await login(canonical);
  const responses = await Promise.all([workspace(cookie, `${TEST_PREFIX} Concurrent A ${randomUUID()}`, key()), workspace(cookie, `${TEST_PREFIX} Concurrent B ${randomUUID()}`, key())]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(await client.merchantMembership.count({ where: { userId: user.id, status: 'ACTIVE' } }), 1);
});
