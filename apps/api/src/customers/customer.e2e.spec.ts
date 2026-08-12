import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';
import { createSessionToken } from '@tteeka/security';
import cookieParser from 'cookie-parser';

import { syncApplicationPermissions } from '../access-management/permission-sync';
import { AppModule } from '../app.module';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { CUSTOMER_PERMISSIONS } from './customer-permissions';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Customer E2E requires DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const PREFIX = 'B5 Customer API Test';
let app: INestApplication;
let baseUrl: string;

async function actor(keys: readonly string[]) {
  const merchant = await client.merchant.create({
    data: { displayName: `${PREFIX} ${randomUUID()}` },
  });
  const user = await client.user.create({
    data: {
      displayName: `${PREFIX} User ${randomUUID()}`,
      phoneE164: `+2567${Math.floor(10_000_000 + Math.random() * 90_000_000)}`,
    },
  });
  const membership = await client.merchantMembership.create({
    data: { merchantId: merchant.id, userId: user.id },
  });
  const role = await client.role.create({
    data: { merchantId: merchant.id, name: `Role ${randomUUID()}` },
  });
  await client.membershipRole.create({
    data: {
      merchantId: merchant.id,
      membershipId: membership.id,
      roleId: role.id,
    },
  });
  const permissions = await client.permission.findMany({
    where: { key: { in: [...keys] } },
    select: { id: true },
  });
  await client.rolePermission.createMany({
    data: permissions.map(({ id }) => ({
      merchantId: merchant.id,
      roleId: role.id,
      permissionId: id,
    })),
  });
  const token = createSessionToken();
  await client.session.create({
    data: {
      userId: user.id,
      tokenHash: token.tokenHash,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  return { merchant, user, membership, role, token: token.token };
}

function call(
  merchantId: string,
  token: string,
  path: string,
  options: { method?: string; body?: unknown } = {},
) {
  return fetch(`${baseUrl}/api/v1/merchants/${merchantId}/customers${path}`, {
    method: options.method ?? 'GET',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      ...(options.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

async function cleanup(): Promise<void> {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const users = await client.user.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const merchantIds = merchants.map(({ id }) => id);
  const userIds = users.map(({ id }) => id);
  await client.deliveryLocation.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.customer.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.session.deleteMany({ where: { userId: { in: userIds } } });
  await client.rolePermission.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.membershipRole.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.role.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await client.merchantMembership.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.user.deleteMany({ where: { id: { in: userIds } } });
  await client.merchant.deleteMany({ where: { id: { in: merchantIds } } });
}

before(async () => {
  await cleanup();
  await syncApplicationPermissions(client);
  app = await NestFactory.create(AppModule, { logger: false });
  app.use(cookieParser());
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

after(async () => {
  await app.close();
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('Customer and DeliveryLocation HTTP lifecycle, filters, privacy, and independence work', async () => {
  const owner = await actor(Object.values(CUSTOMER_PERMISSIONS));
  const created = await call(owner.merchant.id, owner.token, '', {
    method: 'POST',
    body: { phone: '712345678', name: ' Sarah ' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  const customer = (await created.json()) as Record<string, unknown> & {
    id: string;
    phone: string;
  };
  assert.equal(customer.phone, '+256712345678');
  for (const privateField of [
    'passwordHash',
    'sessionToken',
    'roles',
    'memberships',
    'inventory',
    'orders',
  ]) {
    assert.equal(privateField in customer, false);
  }
  const locationResponse = await call(
    owner.merchant.id,
    owner.token,
    `/${customer.id}/delivery-locations`,
    {
      method: 'POST',
      body: {
        area: ' Kira ',
        landmark: ' Near Shell ',
        phone: '0772222222',
        instructions: '',
        mapPinUrl: 'https://maps.example/pin',
      },
    },
  );
  assert.equal(locationResponse.status, 201);
  const location = (await locationResponse.json()) as {
    id: string;
    phone: string;
    instructions: string | null;
    status: string;
  };
  assert.equal(location.phone, '+256772222222');
  assert.equal(location.instructions, null);
  const exact = await call(owner.merchant.id, owner.token, '?phone=0712345678');
  assert.equal(exact.status, 200);
  assert.equal(
    ((await exact.json()) as { pagination: { total: number } }).pagination
      .total,
    1,
  );
  const searched = await call(owner.merchant.id, owner.token, '?q=sar');
  assert.equal(
    ((await searched.json()) as { pagination: { total: number } }).pagination
      .total,
    1,
  );
  const archivedLocation = await call(
    owner.merchant.id,
    owner.token,
    `/${customer.id}/delivery-locations/${location.id}`,
    { method: 'PATCH', body: { status: 'ARCHIVED' } },
  );
  assert.equal(
    ((await archivedLocation.json()) as { status: string }).status,
    'ARCHIVED',
  );
  const unchangedCustomer = await call(
    owner.merchant.id,
    owner.token,
    `/${customer.id}`,
  );
  assert.equal(
    ((await unchangedCustomer.json()) as { status: string }).status,
    'ACTIVE',
  );
  const restoredLocation = await call(
    owner.merchant.id,
    owner.token,
    `/${customer.id}/delivery-locations/${location.id}`,
    { method: 'PATCH', body: { status: 'ACTIVE', mapPinUrl: null } },
  );
  assert.equal(restoredLocation.status, 200);
  const archivedCustomer = await call(
    owner.merchant.id,
    owner.token,
    `/${customer.id}`,
    { method: 'PATCH', body: { status: 'ARCHIVED', name: null } },
  );
  assert.equal(
    ((await archivedCustomer.json()) as { status: string }).status,
    'ARCHIVED',
  );
  const retainedLocation = await call(
    owner.merchant.id,
    owner.token,
    `/${customer.id}/delivery-locations/${location.id}`,
  );
  assert.equal(retainedLocation.status, 200);
  assert.equal(
    ((await retainedLocation.json()) as { status: string }).status,
    'ACTIVE',
  );
  const duplicateArchived = await call(owner.merchant.id, owner.token, '', {
    method: 'POST',
    body: { phone: '+256712345678' },
  });
  assert.equal(duplicateArchived.status, 409);
  const restoredCustomer = await call(
    owner.merchant.id,
    owner.token,
    `/${customer.id}`,
    { method: 'PATCH', body: { status: 'ACTIVE' } },
  );
  assert.equal(restoredCustomer.status, 200);
});

void test('concurrent normalized Customer creates yield one success and one safe conflict', async () => {
  const owner = await actor([CUSTOMER_PERMISSIONS.MANAGE]);
  const responses = await Promise.all([
    call(owner.merchant.id, owner.token, '', {
      method: 'POST',
      body: { phone: '0712345678' },
    }),
    call(owner.merchant.id, owner.token, '', {
      method: 'POST',
      body: { phone: '+256712345678' },
    }),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(
    await client.customer.count({
      where: { merchantId: owner.merchant.id, phone: '+256712345678' },
    }),
    1,
  );
});

void test('all eight routes enforce exact permissions, membership, and nested tenant concealment', async () => {
  const owner = await actor(Object.values(CUSTOMER_PERMISSIONS));
  const manager = await actor([CUSTOMER_PERMISSIONS.MANAGE]);
  const reader = await actor([CUSTOMER_PERMISSIONS.READ]);
  const customer = await client.customer.create({
    data: { merchantId: owner.merchant.id, phone: '+256712345678' },
  });
  const otherCustomer = await client.customer.create({
    data: { merchantId: owner.merchant.id, phone: '+256712345679' },
  });
  const location = await client.deliveryLocation.create({
    data: {
      merchantId: owner.merchant.id,
      customerId: customer.id,
      area: 'Kira',
      landmark: 'Near Shell',
      phone: '+256772222222',
    },
  });
  const routes: readonly {
    path: string;
    options: { method?: string; body?: unknown };
  }[] = [
    { path: '', options: {} },
    {
      path: '',
      options: { method: 'POST', body: { phone: '+256700000001' } },
    },
    { path: `/${customer.id}`, options: {} },
    {
      path: `/${customer.id}`,
      options: { method: 'PATCH', body: { name: 'Updated' } },
    },
    { path: `/${customer.id}/delivery-locations`, options: {} },
    {
      path: `/${customer.id}/delivery-locations`,
      options: {
        method: 'POST',
        body: { area: 'Kira', landmark: 'Shell', phone: '0772222222' },
      },
    },
    {
      path: `/${customer.id}/delivery-locations/${location.id}`,
      options: {},
    },
    {
      path: `/${customer.id}/delivery-locations/${location.id}`,
      options: { method: 'PATCH', body: { area: 'Ntinda' } },
    },
  ];
  for (const route of routes) {
    assert.equal(
      (await call(owner.merchant.id, 'invalid', route.path, route.options))
        .status,
      401,
    );
  }
  assert.equal(
    (await call(manager.merchant.id, manager.token, '')).status,
    403,
  );
  assert.equal(
    (
      await call(manager.merchant.id, manager.token, '', {
        method: 'POST',
        body: { phone: '+256700000002' },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call(reader.merchant.id, reader.token, '', {
        method: 'POST',
        body: { phone: '+256700000003' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await call(owner.merchant.id, manager.token, `/${customer.id}`)).status,
    403,
  );
  assert.equal(
    (await call(manager.merchant.id, manager.token, `/${customer.id}`)).status,
    403,
  );
  assert.equal(
    (await call(manager.merchant.id, reader.token, `/${customer.id}`)).status,
    403,
  );
  assert.equal(
    (
      await call(
        owner.merchant.id,
        owner.token,
        `/${otherCustomer.id}/delivery-locations/${location.id}`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        manager.merchant.id,
        manager.token,
        `/${customer.id}/delivery-locations/${location.id}`,
        { method: 'PATCH', body: { area: 'Foreign' } },
      )
    ).status,
    404,
  );
});
