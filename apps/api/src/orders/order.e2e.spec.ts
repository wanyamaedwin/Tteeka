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
import { ORDER_PERMISSIONS } from './order-permissions';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0)
  throw new Error('Order E2E requires DATABASE_URL.');
const client = createPrismaClient({ databaseUrl });
const PREFIX = 'B6.1 Order API Test';
let app: INestApplication;
let baseUrl: string;
let phoneSequence = 20_000_000;

async function actor(keys: readonly string[]) {
  const merchant = await client.merchant.create({
    data: { displayName: `${PREFIX} ${randomUUID()}` },
  });
  const user = await client.user.create({
    data: {
      displayName: `${PREFIX} User ${randomUUID()}`,
      phoneE164: `+2567${phoneSequence++}`,
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
  return { merchant, user, token: token.token };
}

async function customer(merchantId: string, name = 'Sarah') {
  return client.customer.create({
    data: { merchantId, name, phone: `+2567${phoneSequence++}` },
  });
}

async function location(merchantId: string, customerId: string, label: string) {
  return client.deliveryLocation.create({
    data: {
      merchantId,
      customerId,
      area: `${label} Area`,
      landmark: `${label} Landmark`,
      phone: `+2567${phoneSequence++}`,
      instructions: `${label} instructions`,
      mapPinUrl: `https://maps.example/${label}`,
    },
  });
}

async function variant(merchantId: string, label: string, price = 85_000n) {
  const product = await client.product.create({
    data: { merchantId, name: `${label} Product`, status: 'ACTIVE' },
  });
  const item = await client.productVariant.create({
    data: {
      merchantId,
      productId: product.id,
      sku: `${label}-${randomUUID()}`.toUpperCase(),
      size: 'M',
      colour: 'Blue',
      status: 'ACTIVE',
      sellingPrice: price,
      priceCurrency: 'UGX',
      priceUpdatedAt: new Date(),
    },
  });
  return { product, variant: item };
}

function call(
  merchantId: string,
  token: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    idempotencyKey?: string;
  } = {},
) {
  return fetch(`${baseUrl}/api/v1/merchants/${merchantId}/orders${path}`, {
    method: options.method ?? 'GET',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      ...(options.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
      ...(options.idempotencyKey === undefined
        ? {}
        : { 'idempotency-key': options.idempotencyKey }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

async function cleanup() {
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
  await client.orderItem.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.order.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await client.deliveryLocation.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.customer.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.variantPriceHistory.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.productVariant.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.product.deleteMany({
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

void test('HTTP draft lifecycle exposes immutable bounded snapshots and no inventory side effects', async () => {
  const owner = await actor(Object.values(ORDER_PERMISSIONS));
  const [a, b] = await Promise.all([
    customer(owner.merchant.id, 'Customer A'),
    customer(owner.merchant.id, 'Customer B'),
  ]);
  const loc = await location(owner.merchant.id, a.id, 'Kira');
  const priced = await variant(owner.merchant.id, 'Shirt');
  const balancesBefore = await client.inventoryBalance.count({
    where: { merchantId: owner.merchant.id },
  });
  const holdsBefore = await client.stockHold.count({
    where: { merchantId: owner.merchant.id },
  });
  const created = await call(owner.merchant.id, owner.token, '', {
    method: 'POST',
    idempotencyKey: 'HTTP-Lifecycle',
    body: { customerId: a.id, deliveryLocationId: loc.id },
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  const order = (await created.json()) as {
    id: string;
    [key: string]: unknown;
  };
  assert.equal('idempotencyKey' in order, false);
  assert.equal('requestHash' in order, false);
  const itemsResponse = await call(
    owner.merchant.id,
    owner.token,
    `/${order.id}/items`,
    {
      method: 'PUT',
      body: { items: [{ variantId: priced.variant.id, quantity: '2' }] },
    },
  );
  assert.equal(itemsResponse.status, 200);
  const items = (await itemsResponse.json()) as {
    order: { subtotal: string; currency: string };
    items: {
      unitSellingPrice: string;
      lineTotal: string;
      skuSnapshot: string;
    }[];
  };
  assert.deepEqual(
    [items.order.subtotal, items.order.currency, items.items[0]?.lineTotal],
    ['170000', 'UGX', '170000'],
  );
  await client.customer.update({
    where: { id: a.id },
    data: { name: 'Changed Customer' },
  });
  await client.deliveryLocation.update({
    where: { id: loc.id },
    data: { landmark: 'Changed Landmark' },
  });
  await client.productVariant.update({
    where: { id: priced.variant.id },
    data: { sellingPrice: 90_000n },
  });
  const detail = (await (
    await call(owner.merchant.id, owner.token, `/${order.id}`)
  ).json()) as Record<string, unknown>;
  assert.deepEqual(
    [detail.customerNameSnapshot, detail.deliveryLandmarkSnapshot],
    ['Customer A', 'Kira Landmark'],
  );
  const listedItems = (await (
    await call(owner.merchant.id, owner.token, `/${order.id}/items`)
  ).json()) as { items: { unitSellingPrice: string }[] };
  assert.equal(listedItems.items[0]?.unitSellingPrice, '85000');
  const changed = await call(owner.merchant.id, owner.token, `/${order.id}`, {
    method: 'PATCH',
    body: { customerId: b.id },
  });
  assert.equal(changed.status, 200);
  const changedBody = (await changed.json()) as Record<string, unknown>;
  assert.deepEqual(
    [
      changedBody.customerId,
      changedBody.deliveryLocationId,
      changedBody.deliveryAreaSnapshot,
    ],
    [b.id, null, null],
  );
  const list = await call(
    owner.merchant.id,
    owner.token,
    '?q=Customer%20B&status=DRAFT&page=1&pageSize=20',
  );
  assert.equal(list.status, 200);
  const cancel = await call(
    owner.merchant.id,
    owner.token,
    `/${order.id}/cancel`,
    { method: 'POST' },
  );
  assert.equal(cancel.status, 201);
  const cancelled = (await cancel.json()) as {
    cancelledAt: string;
    status: string;
  };
  const repeat = (await (
    await call(owner.merchant.id, owner.token, `/${order.id}/cancel`, {
      method: 'POST',
    })
  ).json()) as { cancelledAt: string };
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.cancelledAt, repeat.cancelledAt);
  assert.equal(
    (
      await call(owner.merchant.id, owner.token, `/${order.id}/items`, {
        method: 'PUT',
        body: { items: [] },
      })
    ).status,
    409,
  );
  assert.equal(
    await client.inventoryBalance.count({
      where: { merchantId: owner.merchant.id },
    }),
    balancesBefore,
  );
  assert.equal(
    await client.stockHold.count({ where: { merchantId: owner.merchant.id } }),
    holdsBefore,
  );
});

void test('HTTP create replay, conflict, and concurrent exact retry are database-authoritative', async () => {
  const owner = await actor([ORDER_PERMISSIONS.MANAGE]);
  const [a, b] = await Promise.all([
    customer(owner.merchant.id),
    customer(owner.merchant.id),
  ]);
  const options = {
    method: 'POST',
    idempotencyKey: 'HTTP-Replay',
    body: { customerId: a.id },
  };
  const [one, two] = await Promise.all([
    call(owner.merchant.id, owner.token, '', options),
    call(owner.merchant.id, owner.token, '', options),
  ]);
  assert.deepEqual([one.status, two.status], [201, 201]);
  const ids = (await Promise.all([one.json(), two.json()])) as {
    id: string;
  }[];
  assert.equal(ids[0]?.id, ids[1]?.id);
  assert.equal(
    (
      await call(owner.merchant.id, owner.token, '', {
        method: 'POST',
        idempotencyKey: 'HTTP-Replay',
        body: { customerId: b.id },
      })
    ).status,
    409,
  );
});

void test('all eight routes enforce authentication, exact permissions, membership, and tenant concealment', async () => {
  const [owner, manager, reader, foreign] = await Promise.all([
    actor(Object.values(ORDER_PERMISSIONS)),
    actor([ORDER_PERMISSIONS.MANAGE]),
    actor([ORDER_PERMISSIONS.READ]),
    actor(Object.values(ORDER_PERMISSIONS)),
  ]);
  const ownerCustomer = await customer(owner.merchant.id);
  const ownerLocation = await location(
    owner.merchant.id,
    ownerCustomer.id,
    'Owner',
  );
  const ownerVariant = await variant(owner.merchant.id, 'Owner');
  const create = await call(owner.merchant.id, owner.token, '', {
    method: 'POST',
    idempotencyKey: 'Security-Owner',
    body: {
      customerId: ownerCustomer.id,
      deliveryLocationId: ownerLocation.id,
    },
  });
  const order = (await create.json()) as { id: string };
  const routes = [
    { path: '', method: 'GET' },
    {
      path: '',
      method: 'POST',
      body: { customerId: ownerCustomer.id },
      idempotencyKey: randomUUID(),
    },
    { path: `/${order.id}`, method: 'GET' },
    {
      path: `/${order.id}`,
      method: 'PATCH',
      body: { deliveryLocationId: null },
    },
    {
      path: `/${order.id}/items`,
      method: 'PUT',
      body: { items: [{ variantId: ownerVariant.variant.id, quantity: '1' }] },
    },
    { path: `/${order.id}/abandon`, method: 'POST' },
    { path: `/${order.id}/cancel`, method: 'POST' },
    { path: `/${order.id}/items`, method: 'GET' },
  ];
  for (const route of routes) {
    assert.equal(
      (await call(owner.merchant.id, 'invalid', route.path, route)).status,
      401,
    );
  }
  assert.equal((await call(manager.merchant.id, owner.token, '')).status, 403);
  assert.equal(
    (await call(manager.merchant.id, manager.token, '')).status,
    403,
  );
  assert.equal(
    (
      await call(reader.merchant.id, reader.token, '', {
        method: 'POST',
        idempotencyKey: randomUUID(),
        body: { customerId: ownerCustomer.id },
      })
    ).status,
    403,
  );
  const foreignCustomer = await customer(foreign.merchant.id);
  const foreignCreate = await call(foreign.merchant.id, foreign.token, '', {
    method: 'POST',
    idempotencyKey: 'Foreign-Order',
    body: { customerId: foreignCustomer.id },
  });
  const foreignOrder = (await foreignCreate.json()) as { id: string };
  assert.equal(
    (await call(owner.merchant.id, owner.token, `/${foreignOrder.id}`)).status,
    404,
  );
  assert.equal(
    (
      await call(manager.merchant.id, manager.token, '', {
        method: 'POST',
        idempotencyKey: randomUUID(),
        body: { customerId: ownerCustomer.id },
      })
    ).status,
    422,
  );
  const managerCustomer = await customer(manager.merchant.id);
  const managerCreate = await call(manager.merchant.id, manager.token, '', {
    method: 'POST',
    idempotencyKey: 'Manager-Order',
    body: { customerId: managerCustomer.id },
  });
  const managerOrder = (await managerCreate.json()) as { id: string };
  assert.equal(
    (
      await call(manager.merchant.id, manager.token, `/${managerOrder.id}`, {
        method: 'PATCH',
        body: { deliveryLocationId: ownerLocation.id },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await call(
        manager.merchant.id,
        manager.token,
        `/${managerOrder.id}/items`,
        {
          method: 'PUT',
          body: {
            items: [{ variantId: ownerVariant.variant.id, quantity: '1' }],
          },
        },
      )
    ).status,
    422,
  );
});
