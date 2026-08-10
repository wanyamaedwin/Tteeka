import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';
import { hashPassword, hashSessionToken } from '@tteeka/security';
import cookieParser from 'cookie-parser';

import { syncApplicationPermissions } from '../access-management/permission-sync';
import { AppModule } from '../app.module';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { CATALOGUE_PERMISSIONS } from './catalogue-permissions';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Product E2E tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const PREFIX = 'B3.1 Product API Test';
const PASSWORD = 'Synthetic B3.1 Password';
let app: INestApplication;
let baseUrl: string;

function phone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}

async function merchant(label: string) {
  return client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
}

async function actor(keys: readonly string[]) {
  const phoneE164 = phone();
  const user = await client.user.create({
    data: {
      displayName: `${PREFIX} User ${randomUUID()}`,
      phoneE164,
      passwordCredential: {
        create: { passwordHash: await hashPassword(PASSWORD) },
      },
    },
  });
  const owner = await merchant('Merchant');
  const membership = await client.merchantMembership.create({
    data: { userId: user.id, merchantId: owner.id },
  });
  const role = await client.role.create({
    data: { merchantId: owner.id, name: `${PREFIX} Role ${randomUUID()}` },
  });
  await client.membershipRole.create({
    data: {
      merchantId: owner.id,
      membershipId: membership.id,
      roleId: role.id,
    },
  });
  await grant(role, keys);
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      phone: `0${phoneE164.slice(4)}`,
      password: PASSWORD,
    }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.ok(setCookie);
  const pair = setCookie.split(';', 1)[0];
  if (pair === undefined) throw new Error('Session cookie pair is missing.');
  assert.ok(pair.startsWith(`${SESSION_COOKIE_NAME}=`));
  const token = pair.slice(`${SESSION_COOKIE_NAME}=`.length);
  return { user, merchant: owner, membership, role, token };
}

async function grant(
  role: { id: string; merchantId: string },
  keys: readonly string[],
) {
  const permissions = await client.permission.findMany({
    where: { key: { in: [...keys] } },
    select: { id: true },
  });
  await client.rolePermission.createMany({
    data: permissions.map(({ id }) => ({
      merchantId: role.merchantId,
      roleId: role.id,
      permissionId: id,
    })),
    skipDuplicates: true,
  });
}

function request(
  merchantId: string,
  path = '',
  options: { token?: string; method?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) {
    headers.cookie = `${SESSION_COOKIE_NAME}=${options.token}`;
  }
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}/api/v1/merchants/${merchantId}/products${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

async function cleanup(): Promise<void> {
  const users = await client.user.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  const merchantIds = merchants.map(({ id }) => id);
  const memberships = await client.merchantMembership.findMany({
    where: {
      OR: [{ userId: { in: userIds } }, { merchantId: { in: merchantIds } }],
    },
    select: { id: true },
  });
  const roles = await client.role.findMany({
    where: { merchantId: { in: merchantIds } },
    select: { id: true },
  });
  const membershipIds = memberships.map(({ id }) => id);
  const roleIds = roles.map(({ id }) => id);
  await client.product.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.rolePermission.deleteMany({
    where: { roleId: { in: roleIds } },
  });
  await client.membershipRole.deleteMany({
    where: {
      OR: [
        { membershipId: { in: membershipIds } },
        { roleId: { in: roleIds } },
      ],
    },
  });
  await client.session.deleteMany({ where: { userId: { in: userIds } } });
  await client.passwordCredential.deleteMany({
    where: { userId: { in: userIds } },
  });
  await client.merchantMembership.deleteMany({
    where: { id: { in: membershipIds } },
  });
  await client.role.deleteMany({ where: { id: { in: roleIds } } });
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

void test('all four Product routes enforce authentication and validated Merchant context', async () => {
  const owner = await merchant('Unauthenticated');
  for (const [method, path, body] of [
    ['GET', '', undefined],
    ['POST', '', { name: 'Shirt' }],
    ['GET', '/01910000-0000-7000-8000-000000000099', undefined],
    ['PATCH', '/01910000-0000-7000-8000-000000000099', { name: 'Shirt' }],
  ] as const) {
    assert.equal((await request(owner.id, path, { method, body })).status, 401);
  }
  const authorized = await actor([CATALOGUE_PERMISSIONS.READ]);
  assert.equal(
    (
      await request(authorized.merchant.id, '', {
        token: authorized.token,
        method: 'POST',
        body: { name: 'Forbidden write' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('not-a-uuid', '', { token: authorized.token })).status,
    400,
  );
  const outsider = await actor([CATALOGUE_PERMISSIONS.READ]);
  assert.equal(
    (await request(owner.id, '', { token: outsider.token })).status,
    403,
  );
});

void test('manage permits create/update but does not imply read; adding read works without relogin or Session mutation', async () => {
  const admin = await actor([CATALOGUE_PERMISSIONS.MANAGE]);
  const sessionBefore = await client.session.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(admin.token) },
  });
  const created = await request(admin.merchant.id, '', {
    token: admin.token,
    method: 'POST',
    body: {
      name: ' Classic Shirt ',
      description: ' Cotton ',
      category: ' Apparel ',
      brand: ' Tteeka ',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.equal(created.headers.get('set-cookie'), null);
  const product = (await created.json()) as {
    id: string;
    name: string;
    status: string;
    merchantId?: string;
  };
  assert.equal(product.name, 'Classic Shirt');
  assert.equal(product.status, 'ACTIVE');
  assert.equal(product.merchantId, undefined);
  assert.equal(
    (
      await request(admin.merchant.id, `/${product.id}`, {
        token: admin.token,
        method: 'PATCH',
        body: { name: 'Updated Shirt' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(admin.merchant.id, '', { token: admin.token })).status,
    403,
  );
  assert.equal(
    (await request(admin.merchant.id, `/${product.id}`, { token: admin.token }))
      .status,
    403,
  );
  await grant(admin.role, [CATALOGUE_PERMISSIONS.READ]);
  const detail = await request(admin.merchant.id, `/${product.id}`, {
    token: admin.token,
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.headers.get('set-cookie'), null);
  const readPermission = await client.permission.findUniqueOrThrow({
    where: { key: CATALOGUE_PERMISSIONS.READ },
  });
  await client.rolePermission.delete({
    where: {
      roleId_permissionId: {
        roleId: admin.role.id,
        permissionId: readPermission.id,
      },
    },
  });
  assert.equal(
    (
      await request(admin.merchant.id, `/${product.id}`, {
        token: admin.token,
      })
    ).status,
    403,
  );
  await grant(admin.role, [CATALOGUE_PERMISSIONS.READ]);
  assert.equal(
    (
      await request(admin.merchant.id, `/${product.id}`, {
        token: admin.token,
      })
    ).status,
    200,
  );
  const sessionAfter = await client.session.findUniqueOrThrow({
    where: { id: sessionBefore.id },
  });
  assert.equal(
    await client.session.count({ where: { userId: admin.user.id } }),
    1,
  );
  assert.equal(sessionAfter.tokenHash, sessionBefore.tokenHash);
  assert.equal(
    sessionAfter.expiresAt.getTime(),
    sessionBefore.expiresAt.getTime(),
  );
});

void test('list/search/filter/pagination are deterministic and tenant isolated', async () => {
  const admin = await actor(Object.values(CATALOGUE_PERMISSIONS));
  const foreign = await merchant('Foreign');
  await client.product.create({
    data: { merchantId: foreign.id, name: 'Foreign Shirt' },
  });
  for (const data of [
    {
      name: 'Zulu Bag',
      description: 'Hand woven',
      category: 'Accessories',
      brand: 'Acme',
    },
    { name: 'Alpha Shirt', category: 'Apparel', brand: 'Tteeka' },
    { name: 'Beta Shirt', category: 'Apparel', brand: 'Acme' },
  ]) {
    assert.equal(
      (
        await request(admin.merchant.id, '', {
          token: admin.token,
          method: 'POST',
          body: data,
        })
      ).status,
      201,
    );
  }
  const page1 = await request(admin.merchant.id, '?page=1&pageSize=2', {
    token: admin.token,
  });
  const page1Body = (await page1.json()) as {
    products: { name: string }[];
    pagination: { total: number; totalPages: number };
  };
  assert.deepEqual(
    page1Body.products.map(({ name }) => name),
    ['Alpha Shirt', 'Beta Shirt'],
  );
  assert.deepEqual(page1Body.pagination, {
    page: 1,
    pageSize: 2,
    total: 3,
    totalPages: 2,
  });
  const page2 = (await (
    await request(admin.merchant.id, '?page=2&pageSize=2', {
      token: admin.token,
    })
  ).json()) as { products: { name: string }[] };
  assert.deepEqual(
    page2.products.map(({ name }) => name),
    ['Zulu Bag'],
  );
  const out = (await (
    await request(admin.merchant.id, '?page=9&pageSize=2', {
      token: admin.token,
    })
  ).json()) as { products: unknown[]; pagination: { total: number } };
  assert.deepEqual(out.products, []);
  assert.equal(out.pagination.total, 3);
  const search = (await (
    await request(admin.merchant.id, '?q=WOVEN', { token: admin.token })
  ).json()) as { products: { name: string }[] };
  assert.deepEqual(
    search.products.map(({ name }) => name),
    ['Zulu Bag'],
  );
  const filtered = (await (
    await request(
      admin.merchant.id,
      '?q=shirt&status=ACTIVE&category=apparel&brand=ACME',
      { token: admin.token },
    )
  ).json()) as { products: { name: string }[] };
  assert.deepEqual(
    filtered.products.map(({ name }) => name),
    ['Beta Shirt'],
  );
});

void test('detail/update are UUIDv7-valid, lifecycle-reversible, nullable, and cross-tenant safe', async () => {
  const admin = await actor(Object.values(CATALOGUE_PERMISSIONS));
  const foreign = await merchant('Foreign target');
  const product = await client.product.create({
    data: {
      merchantId: admin.merchant.id,
      name: 'Lifecycle',
      description: 'D',
      category: 'C',
      brand: 'B',
    },
  });
  const foreignProduct = await client.product.create({
    data: { merchantId: foreign.id, name: 'Foreign' },
  });
  assert.equal(
    (await request(admin.merchant.id, '/not-a-uuid', { token: admin.token }))
      .status,
    400,
  );
  const unknown = '01910000-0000-7000-8000-000000000099';
  assert.equal(
    (await request(admin.merchant.id, `/${unknown}`, { token: admin.token }))
      .status,
    404,
  );
  const foreignGet = await request(admin.merchant.id, `/${foreignProduct.id}`, {
    token: admin.token,
  });
  assert.equal(foreignGet.status, 404);
  assert.equal(
    (
      await request(admin.merchant.id, `/${foreignProduct.id}`, {
        token: admin.token,
        method: 'PATCH',
        body: { name: 'Attack' },
      })
    ).status,
    404,
  );
  for (const status of ['INACTIVE', 'ARCHIVED', 'ACTIVE'] as const) {
    const response = await request(admin.merchant.id, `/${product.id}`, {
      token: admin.token,
      method: 'PATCH',
      body:
        status === 'INACTIVE'
          ? { status, description: null, category: null, brand: null }
          : { status },
    });
    assert.equal(response.status, 200);
  }
  const archived = await request(admin.merchant.id, `/${product.id}`, {
    token: admin.token,
    method: 'PATCH',
    body: { status: 'ARCHIVED' },
  });
  assert.equal(archived.status, 200);
  assert.equal(
    (await request(admin.merchant.id, `/${product.id}`, { token: admin.token }))
      .status,
    200,
  );
  assert.equal(
    (await client.product.findUniqueOrThrow({ where: { id: product.id } }))
      .status,
    'ARCHIVED',
  );
  const archivedList = (await (
    await request(admin.merchant.id, '?status=ARCHIVED', {
      token: admin.token,
    })
  ).json()) as { products: { id: string }[] };
  assert.equal(
    archivedList.products.some(({ id }) => id === product.id),
    true,
  );
  assert.equal(
    (
      await client.product.findUniqueOrThrow({
        where: { id: foreignProduct.id },
      })
    ).name,
    'Foreign',
  );
});

void test('invalid Product bodies and queries fail atomically with HTTP 400', async () => {
  const admin = await actor(Object.values(CATALOGUE_PERMISSIONS));
  for (const body of [
    { name: ' ' },
    { name: 'x'.repeat(161) },
    { name: 'Valid', status: 'ACTIVE' },
    { name: 'Valid', sku: 'SKU' },
    { name: 'Valid', price: 100 },
  ]) {
    assert.equal(
      (
        await request(admin.merchant.id, '', {
          token: admin.token,
          method: 'POST',
          body,
        })
      ).status,
      400,
    );
  }
  const product = await client.product.create({
    data: { merchantId: admin.merchant.id, name: 'Unchanged' },
  });
  for (const body of [
    {},
    { status: 'DELETED' },
    { name: 'Changed', price: 1 },
  ]) {
    assert.equal(
      (
        await request(admin.merchant.id, `/${product.id}`, {
          token: admin.token,
          method: 'PATCH',
          body,
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (await client.product.findUniqueOrThrow({ where: { id: product.id } }))
      .name,
    'Unchanged',
  );
  for (const query of [
    '?page=0',
    '?pageSize=101',
    '?status=DELETED',
    '?q=%20',
    '?unknown=x',
  ]) {
    assert.equal(
      (await request(admin.merchant.id, query, { token: admin.token })).status,
      400,
    );
  }
});

void test('Merchant and Membership lifecycle revoke catalogue access without revoking authentication', async () => {
  const admin = await actor([CATALOGUE_PERMISSIONS.READ]);
  assert.equal(
    (await request(admin.merchant.id, '', { token: admin.token })).status,
    200,
  );
  await client.merchantMembership.update({
    where: { id: admin.membership.id },
    data: { status: 'DISABLED' },
  });
  assert.equal(
    (await request(admin.merchant.id, '', { token: admin.token })).status,
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
  await client.merchantMembership.update({
    where: { id: admin.membership.id },
    data: { status: 'ACTIVE' },
  });
  await client.merchant.update({
    where: { id: admin.merchant.id },
    data: { status: 'SUSPENDED' },
  });
  assert.equal(
    (await request(admin.merchant.id, '', { token: admin.token })).status,
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

void test('PostgreSQL outage produces 500-class Product failure while liveness stays up and readiness recovers', async () => {
  const admin = await actor([CATALOGUE_PERMISSIONS.READ]);
  const repositoryRoot = path.resolve(process.cwd(), '..', '..');
  execFileSync('docker', ['compose', 'stop', 'postgres'], {
    cwd: repositoryRoot,
    stdio: 'ignore',
  });
  try {
    const failed = await request(admin.merchant.id, '', { token: admin.token });
    assert.equal(failed.status >= 500 && failed.status < 600, true);
    assert.notEqual(failed.status, 403);
    assert.notEqual(failed.status, 404);
    assert.equal((await fetch(`${baseUrl}/api/v1/health/live`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/v1/health/ready`)).status, 503);
  } finally {
    execFileSync('docker', ['compose', 'start', 'postgres'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  }
  let readyStatus = 503;
  for (let attempt = 0; attempt < 60 && readyStatus !== 200; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    readyStatus = (await fetch(`${baseUrl}/api/v1/health/ready`)).status;
  }
  assert.equal(readyStatus, 200);
  await client.$disconnect();
});
