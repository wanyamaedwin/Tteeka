import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import {
  Controller,
  Get,
  type INestApplication,
  Module,
  UseGuards,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';
import { hashPassword, hashSessionToken } from '@tteeka/security';
import cookieParser from 'cookie-parser';

import { AuthModule } from '../auth/auth.module';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { ConfigurationModule } from '../configuration/configuration.module';
import { DatabaseModule } from '../database/database.module';
import { AuthorizationModule } from './authorization.module';
import { MerchantContextGuard } from './merchant-context.guard';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Permission-guard E2E tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const TEST_PREFIX = 'B1.9 Permission Guard Test';
const READ_PERMISSION = 'test.resource.read';
const WRITE_PERMISSION = 'test.resource.write';
const PASSWORD = 'Synthetic B1.9 Password';
let app: INestApplication;
let baseUrl: string;
let readPermission: { id: string; key: string };
let writePermission: { id: string; key: string };

@Controller('test/merchants/:merchantId/permission')
class PermissionGuardTestController {
  @Get('read')
  @UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
  @RequirePermission(READ_PERMISSION)
  public read(): { ok: true } {
    return { ok: true };
  }

  @Get('write')
  @UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
  @RequirePermission(WRITE_PERMISSION)
  public write(): { ok: true } {
    return { ok: true };
  }

  @Get('case-mismatch')
  @UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
  @RequirePermission('Test.Resource.Read')
  public caseMismatch(): { ok: true } {
    return { ok: true };
  }

  @Get('wildcard')
  @UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
  @RequirePermission('test.resource.*')
  public wildcard(): { ok: true } {
    return { ok: true };
  }

  @Get('missing-metadata')
  @UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
  public missingMetadata(): { ok: true } {
    return { ok: true };
  }

  @Get('missing-context')
  @UseGuards(PermissionGuard)
  @RequirePermission(READ_PERMISSION)
  public missingContext(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigurationModule,
    DatabaseModule,
    AuthModule,
    AuthorizationModule,
  ],
  controllers: [PermissionGuardTestController],
})
class PermissionGuardTestModule {}

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

async function createMerchant() {
  return client.merchant.create({
    data: { displayName: `${TEST_PREFIX} Merchant ${randomUUID()}` },
  });
}

async function createMembership(userId: string, merchantId: string) {
  return client.merchantMembership.create({ data: { userId, merchantId } });
}

async function createRole(merchantId: string, name: string) {
  return client.role.create({
    data: { merchantId, name: `${name} ${randomUUID()}` },
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

function protectedRoute(
  merchantId: string,
  route: string,
  rawToken?: string,
): Promise<Response> {
  return fetch(`${baseUrl}/test/merchants/${merchantId}/permission/${route}`, {
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

function context(merchantId: string, rawToken: string): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/merchants/${merchantId}/context`, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${rawToken}` },
  });
}

async function cleanup(): Promise<void> {
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
    where: { key: { in: [READ_PERMISSION, WRITE_PERMISSION] } },
  });
  await client.user.deleteMany({
    where: { displayName: { startsWith: TEST_PREFIX } },
  });
  await client.merchant.deleteMany({
    where: { displayName: { startsWith: TEST_PREFIX } },
  });
}

before(async () => {
  await cleanup();
  readPermission = await client.permission.create({
    data: { key: READ_PERMISSION },
  });
  writePermission = await client.permission.create({
    data: { key: WRITE_PERMISSION },
  });
  app = await NestFactory.create(PermissionGuardTestModule, {
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

void test('guard pipeline distinguishes authentication, merchant input, membership, and permission denial', async () => {
  const created = await createUser();
  const merchant = await createMerchant();
  const rawToken = await login(created.localPhone);
  assert.equal((await protectedRoute(merchant.id, 'read')).status, 401);
  assert.equal(
    (await protectedRoute('not-a-uuid', 'read', rawToken)).status,
    400,
  );
  const noMembership = await protectedRoute(merchant.id, 'read', rawToken);
  assert.equal(noMembership.status, 403);
  const genericForbidden = (await noMembership.json()) as unknown;

  const membership = await createMembership(created.user.id, merchant.id);
  const zeroRole = await protectedRoute(merchant.id, 'read', rawToken);
  assert.equal(zeroRole.status, 403);
  assert.deepEqual(await zeroRole.json(), genericForbidden);
  const contextResponse = await context(merchant.id, rawToken);
  assert.equal(contextResponse.status, 200);
  assert.deepEqual(await contextResponse.json(), {
    merchant: { id: merchant.id, displayName: merchant.displayName },
    membership: { id: membership.id },
    roles: [],
    permissions: [],
  });
});

void test('exact grants allow while different, disabled, deprecated, case, and wildcard requirements deny generically', async () => {
  const created = await createUser();
  const merchant = await createMerchant();
  const membership = await createMembership(created.user.id, merchant.id);
  const firstRole = await createRole(merchant.id, 'First');
  const secondRole = await createRole(merchant.id, 'Second');
  await assignRole(membership, firstRole);
  await assignRole(membership, secondRole);
  await grantPermission(firstRole, readPermission);
  await grantPermission(secondRole, readPermission);
  const rawToken = await login(created.localPhone);
  const before = await client.session.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(rawToken) },
  });
  const sessionCount = await client.session.count({
    where: { userId: created.user.id },
  });

  const allowed = await protectedRoute(merchant.id, 'read', rawToken);
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { ok: true });
  assert.equal(allowed.headers.get('set-cookie'), null);
  const different = await protectedRoute(merchant.id, 'write', rawToken);
  const caseMismatch = await protectedRoute(
    merchant.id,
    'case-mismatch',
    rawToken,
  );
  const wildcard = await protectedRoute(merchant.id, 'wildcard', rawToken);
  for (const denied of [different, caseMismatch, wildcard]) {
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), {
      message: 'Forbidden.',
      error: 'Forbidden',
      statusCode: 403,
    });
  }

  await client.role.updateMany({
    where: { id: { in: [firstRole.id, secondRole.id] } },
    data: { status: 'DISABLED' },
  });
  const disabled = await protectedRoute(merchant.id, 'read', rawToken);
  assert.equal(disabled.status, 403);
  assert.deepEqual(await disabled.json(), forbiddenBody());

  await client.role.update({
    where: { id: firstRole.id },
    data: { status: 'ACTIVE' },
  });
  await client.permission.update({
    where: { id: readPermission.id },
    data: { status: 'DEPRECATED' },
  });
  const deprecated = await protectedRoute(merchant.id, 'read', rawToken);
  assert.equal(deprecated.status, 403);
  assert.deepEqual(await deprecated.json(), forbiddenBody());
  await client.permission.update({
    where: { id: readPermission.id },
    data: { status: 'ACTIVE' },
  });

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

function forbiddenBody(): unknown {
  return {
    message: 'Forbidden.',
    error: 'Forbidden',
    statusCode: 403,
  };
}

void test('one Session remains tenant-scoped and sees a newly granted Merchant permission without re-login', async () => {
  const userA = await createUser();
  const userB = await createUser();
  const merchantA = await createMerchant();
  const merchantB = await createMerchant();
  const membershipA = await createMembership(userA.user.id, merchantA.id);
  const membershipB = await createMembership(userA.user.id, merchantB.id);
  const otherMembership = await createMembership(userB.user.id, merchantA.id);
  const roleA = await createRole(merchantA.id, 'Merchant A');
  const roleB = await createRole(merchantB.id, 'Merchant B');
  await assignRole(membershipA, roleA);
  await assignRole(membershipB, roleB);
  await grantPermission(roleA, readPermission);
  await grantPermission(roleB, writePermission);
  const tokenA = await login(userA.localPhone);
  const tokenB = await login(userB.localPhone);

  assert.equal(
    (await protectedRoute(merchantA.id, 'read', tokenA)).status,
    200,
  );
  assert.equal(
    (await protectedRoute(merchantB.id, 'read', tokenA)).status,
    403,
  );
  assert.equal(
    (await protectedRoute(merchantA.id, 'read', tokenB)).status,
    403,
  );
  assert.ok(otherMembership.id);

  await grantPermission(roleB, readPermission);
  assert.equal(
    (await protectedRoute(merchantB.id, 'read', tokenA)).status,
    200,
  );
});

void test('lifecycle revocation is immediate while global Session authentication remains usable', async () => {
  const created = await createUser();
  const merchant = await createMerchant();
  const membership = await createMembership(created.user.id, merchant.id);
  const role = await createRole(merchant.id, 'Lifecycle');
  await assignRole(membership, role);
  await grantPermission(role, readPermission);
  const rawToken = await login(created.localPhone);
  assert.equal(
    (await protectedRoute(merchant.id, 'read', rawToken)).status,
    200,
  );

  await client.permission.update({
    where: { id: readPermission.id },
    data: { status: 'DEPRECATED' },
  });
  assert.equal(
    (await protectedRoute(merchant.id, 'read', rawToken)).status,
    403,
  );
  await client.permission.update({
    where: { id: readPermission.id },
    data: { status: 'ACTIVE' },
  });

  await client.role.update({
    where: { id: role.id },
    data: { status: 'DISABLED' },
  });
  assert.equal(
    (await protectedRoute(merchant.id, 'read', rawToken)).status,
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
    (await protectedRoute(merchant.id, 'read', rawToken)).status,
    403,
  );
  assert.equal((await me(rawToken)).status, 200);
  await client.merchantMembership.update({
    where: { id: membership.id },
    data: { status: 'ACTIVE' },
  });

  await client.merchant.update({
    where: { id: merchant.id },
    data: { status: 'SUSPENDED' },
  });
  assert.equal(
    (await protectedRoute(merchant.id, 'read', rawToken)).status,
    403,
  );
  assert.equal((await me(rawToken)).status, 200);
});

void test('test-only misconfiguration routes fail closed with generic 500 responses', async () => {
  const created = await createUser();
  const merchant = await createMerchant();
  const membership = await createMembership(created.user.id, merchant.id);
  const role = await createRole(merchant.id, 'Configured');
  await assignRole(membership, role);
  await grantPermission(role, readPermission);
  const rawToken = await login(created.localPhone);

  for (const route of ['missing-metadata', 'missing-context']) {
    const response = await protectedRoute(merchant.id, route, rawToken);
    assert.equal(response.status, 500);
    const bodyText = JSON.stringify(await response.json());
    assert.equal(bodyText.includes(READ_PERMISSION), false);
    assert.equal(bodyText.includes('merchantContext'), false);
    assert.equal(bodyText.includes('metadata'), false);
  }
});
