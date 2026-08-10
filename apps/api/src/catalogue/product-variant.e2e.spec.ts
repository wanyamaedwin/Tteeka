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
  throw new Error('Product Variant E2E tests require DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const PREFIX = 'B3.2 Variant API Test';
const PASSWORD = 'Synthetic B3.2 Password';
let app: INestApplication;
let baseUrl: string;

function phone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}

async function merchant(label: string, currency = 'UGX') {
  return client.merchant.create({
    data: {
      displayName: `${PREFIX} ${label} ${randomUUID()}`,
      currency,
    },
  });
}

async function grant(
  role: { id: string; merchantId: string },
  keys: readonly string[],
) {
  const permissions = await client.permission.findMany({
    where: { key: { in: [...keys] }, status: 'ACTIVE' },
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

async function revoke(roleId: string, key: string): Promise<void> {
  const permission = await client.permission.findUniqueOrThrow({
    where: { key },
  });
  await client.rolePermission.deleteMany({
    where: { roleId, permissionId: permission.id },
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
  assert.ok(setCookie !== null);
  const pair = setCookie.split(';', 1)[0];
  if (pair === undefined) throw new Error('Session cookie pair is missing.');
  return {
    user,
    merchant: owner,
    membership,
    role,
    token: pair.slice(`${SESSION_COOKIE_NAME}=`.length),
  };
}

function request(
  merchantId: string,
  route: string,
  options: { token?: string; method?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token !== undefined) {
    headers.cookie = `${SESSION_COOKIE_NAME}=${options.token}`;
  }
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}/api/v1/merchants/${merchantId}${route}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

async function createProduct(merchantId: string, name = 'Shirt') {
  return client.product.create({ data: { merchantId, name } });
}

async function createVariant(
  merchantId: string,
  productId: string,
  sku = `SKU-${randomUUID()}`,
) {
  return client.productVariant.create({ data: { merchantId, productId, sku } });
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
  await client.variantPriceHistory.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.productVariant.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
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

void test('all seven Variant routes enforce authentication and no-store responses', async () => {
  const owner = await merchant('Unauthenticated');
  const product = await createProduct(owner.id);
  const variant = await createVariant(owner.id, product.id, 'AUTH-1');
  for (const [method, route, body] of [
    ['GET', `/products/${product.id}/variants`, undefined],
    ['POST', `/products/${product.id}/variants`, { sku: 'AUTH-2' }],
    ['GET', `/products/${product.id}/variants/${variant.id}`, undefined],
    ['PATCH', `/products/${product.id}/variants/${variant.id}`, { size: 'M' }],
    [
      'PUT',
      `/products/${product.id}/variants/${variant.id}/price`,
      { sellingPrice: '1' },
    ],
    [
      'GET',
      `/products/${product.id}/variants/${variant.id}/price-history`,
      undefined,
    ],
    ['GET', '/variants/lookup?sku=AUTH-1', undefined],
  ] as const) {
    assert.equal(
      (await request(owner.id, route, { method, body })).status,
      401,
    );
  }
  const reader = await actor([CATALOGUE_PERMISSIONS.READ]);
  const ownProduct = await createProduct(reader.merchant.id);
  const list = await request(
    reader.merchant.id,
    `/products/${ownProduct.id}/variants`,
    { token: reader.token },
  );
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('cache-control'), 'no-store');
  assert.equal(list.headers.get('pragma'), 'no-cache');
  assert.equal(list.headers.get('set-cookie'), null);
});

void test('manage, read, and price-manage remain exact independent permissions', async () => {
  const manager = await actor([CATALOGUE_PERMISSIONS.MANAGE]);
  const product = await createProduct(manager.merchant.id);
  const created = await request(
    manager.merchant.id,
    `/products/${product.id}/variants`,
    { token: manager.token, method: 'POST', body: { sku: ' manage-1 ' } },
  );
  assert.equal(created.status, 201);
  const variant = (await created.json()) as {
    id: string;
    sku: string;
    status: string;
    price: null;
  };
  assert.equal(variant.sku, 'MANAGE-1');
  assert.equal(variant.status, 'INACTIVE');
  assert.equal(variant.price, null);
  assert.equal(
    (
      await request(manager.merchant.id, `/products/${product.id}/variants`, {
        token: manager.token,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        manager.merchant.id,
        `/products/${product.id}/variants/${variant.id}/price`,
        { token: manager.token, method: 'PUT', body: { sellingPrice: '100' } },
      )
    ).status,
    403,
  );

  const priceManager = await actor([CATALOGUE_PERMISSIONS.PRICE_MANAGE]);
  const priceProduct = await createProduct(priceManager.merchant.id);
  const priceVariant = await createVariant(
    priceManager.merchant.id,
    priceProduct.id,
    'PRICE-ONLY',
  );
  assert.equal(
    (
      await request(
        priceManager.merchant.id,
        `/products/${priceProduct.id}/variants/${priceVariant.id}/price`,
        {
          token: priceManager.token,
          method: 'PUT',
          body: { sellingPrice: '45000', costPrice: '30000' },
        },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        priceManager.merchant.id,
        `/products/${priceProduct.id}/variants/${priceVariant.id}`,
        { token: priceManager.token, method: 'PATCH', body: { size: 'L' } },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        priceManager.merchant.id,
        `/products/${priceProduct.id}/variants/${priceVariant.id}`,
        { token: priceManager.token },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        priceManager.merchant.id,
        `/products/${priceProduct.id}/variants/${priceVariant.id}/price-history`,
        { token: priceManager.token },
      )
    ).status,
    200,
  );
});

void test('complete Variant lifecycle, lookup, price, history, bigint, and currency snapshots work through HTTP', async () => {
  const admin = await actor(Object.values(CATALOGUE_PERMISSIONS));
  const product = await createProduct(admin.merchant.id, 'Lifecycle Product');
  const created = await request(
    admin.merchant.id,
    `/products/${product.id}/variants`,
    {
      token: admin.token,
      method: 'POST',
      body: {
        sku: ' shirt.blk-m ',
        barcode: 'CaseSensitive-1',
        size: ' M ',
        colour: ' Black ',
      },
    },
  );
  assert.equal(created.status, 201);
  const variant = (await created.json()) as { id: string; sku: string };
  assert.equal(variant.sku, 'SHIRT.BLK-M');
  const unpricedActivation = await request(
    admin.merchant.id,
    `/products/${product.id}/variants/${variant.id}`,
    { token: admin.token, method: 'PATCH', body: { status: 'ACTIVE' } },
  );
  assert.equal(unpricedActivation.status, 422);
  const first = await request(
    admin.merchant.id,
    `/products/${product.id}/variants/${variant.id}/price`,
    {
      token: admin.token,
      method: 'PUT',
      body: { sellingPrice: '9007199254740993', costPrice: '30000' },
    },
  );
  assert.equal(first.status, 200);
  const firstPrice = (await first.json()) as {
    sellingPrice: string;
    costPrice: string;
    currency: string;
    updatedAt: string;
  };
  assert.equal(firstPrice.sellingPrice, '9007199254740993');
  assert.equal(firstPrice.costPrice, '30000');
  assert.equal(firstPrice.currency, 'UGX');
  const identical = await request(
    admin.merchant.id,
    `/products/${product.id}/variants/${variant.id}/price`,
    {
      token: admin.token,
      method: 'PUT',
      body: { sellingPrice: '9007199254740993', costPrice: '30000' },
    },
  );
  assert.equal(
    ((await identical.json()) as { updatedAt: string }).updatedAt,
    firstPrice.updatedAt,
  );
  await client.merchant.update({
    where: { id: admin.merchant.id },
    data: { currency: 'KES' },
  });
  const beforeReprice = await request(
    admin.merchant.id,
    `/products/${product.id}/variants/${variant.id}`,
    { token: admin.token },
  );
  assert.equal(
    ((await beforeReprice.json()) as { price: { currency: string } }).price
      .currency,
    'UGX',
  );
  await request(
    admin.merchant.id,
    `/products/${product.id}/variants/${variant.id}/price`,
    {
      token: admin.token,
      method: 'PUT',
      body: { sellingPrice: '9007199254740994', costPrice: null },
    },
  );
  for (const status of ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'ACTIVE'] as const) {
    assert.equal(
      (
        await request(
          admin.merchant.id,
          `/products/${product.id}/variants/${variant.id}`,
          { token: admin.token, method: 'PATCH', body: { status } },
        )
      ).status,
      200,
    );
  }
  const listBody = (await (
    await request(
      admin.merchant.id,
      `/products/${product.id}/variants?q=black&page=1&pageSize=50`,
      { token: admin.token },
    )
  ).json()) as {
    variants: Record<string, unknown>[];
    pagination: { total: number };
  };
  assert.equal(listBody.pagination.total, 1);
  assert.equal('costPrice' in listBody.variants[0]!, false);
  const skuLookup = await request(
    admin.merchant.id,
    '/variants/lookup?sku=shirt.blk-m',
    { token: admin.token },
  );
  const barcodeLookup = await request(
    admin.merchant.id,
    '/variants/lookup?barcode=CaseSensitive-1',
    { token: admin.token },
  );
  assert.equal(skuLookup.status, 200);
  assert.equal(barcodeLookup.status, 200);
  for (const route of [
    '/variants/lookup',
    '/variants/lookup?sku=SHIRT.BLK-M&barcode=CaseSensitive-1',
  ]) {
    assert.equal(
      (await request(admin.merchant.id, route, { token: admin.token })).status,
      400,
    );
  }
  const history = (await (
    await request(
      admin.merchant.id,
      `/products/${product.id}/variants/${variant.id}/price-history?page=1&pageSize=50`,
      { token: admin.token },
    )
  ).json()) as {
    prices: {
      sellingPrice: string;
      costPrice: string | null;
      currency: string;
    }[];
  };
  assert.deepEqual(
    history.prices.map(({ currency }) => currency),
    ['KES', 'UGX'],
  );
  assert.equal(history.prices[0]?.costPrice, null);
  assert.equal(history.prices[1]?.sellingPrice, '9007199254740993');
});

void test('duplicate identifiers, patch conflicts, null clearing, invalid bodies, and malformed ids are safe', async () => {
  const admin = await actor(Object.values(CATALOGUE_PERMISSIONS));
  const product = await createProduct(admin.merchant.id);
  const first = await createVariant(
    admin.merchant.id,
    product.id,
    'DUPLICATE-A',
  );
  await client.productVariant.update({
    where: { id: first.id },
    data: { barcode: 'DUPLICATE-BARCODE', size: 'M', colour: 'Blue' },
  });
  const second = await createVariant(
    admin.merchant.id,
    product.id,
    'DUPLICATE-B',
  );
  assert.equal(
    (
      await request(admin.merchant.id, `/products/${product.id}/variants`, {
        token: admin.token,
        method: 'POST',
        body: { sku: 'duplicate-a' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(admin.merchant.id, `/products/${product.id}/variants`, {
        token: admin.token,
        method: 'POST',
        body: { sku: 'UNIQUE', barcode: 'DUPLICATE-BARCODE' },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        admin.merchant.id,
        `/products/${product.id}/variants/${second.id}`,
        {
          token: admin.token,
          method: 'PATCH',
          body: { sku: 'duplicate-a' },
        },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        admin.merchant.id,
        `/products/${product.id}/variants/${second.id}`,
        {
          token: admin.token,
          method: 'PATCH',
          body: { barcode: 'DUPLICATE-BARCODE' },
        },
      )
    ).status,
    409,
  );
  const cleared = await request(
    admin.merchant.id,
    `/products/${product.id}/variants/${first.id}`,
    {
      token: admin.token,
      method: 'PATCH',
      body: { barcode: null, size: null, colour: null },
    },
  );
  const clearedBody = (await cleared.json()) as {
    barcode: null;
    size: null;
    colour: null;
  };
  assert.deepEqual(
    [clearedBody.barcode, clearedBody.size, clearedBody.colour],
    [null, null, null],
  );
  for (const body of [
    { sku: 'BAD SKU' },
    { sku: 'VALID', barcode: 'BAD CODE' },
    { sku: 'VALID', sellingPrice: '1' },
    { sku: 'VALID', unknown: true },
  ]) {
    assert.equal(
      (
        await request(admin.merchant.id, `/products/${product.id}/variants`, {
          token: admin.token,
          method: 'POST',
          body,
        })
      ).status,
      400,
    );
  }
  for (const body of [
    {},
    { sellingPrice: '1' },
    { productId: product.id },
    { status: 'DELETED' },
  ]) {
    assert.equal(
      (
        await request(
          admin.merchant.id,
          `/products/${product.id}/variants/${first.id}`,
          {
            token: admin.token,
            method: 'PATCH',
            body,
          },
        )
      ).status,
      400,
    );
  }
  for (const body of [
    { sellingPrice: '0' },
    { sellingPrice: '1.5' },
    { sellingPrice: '9223372036854775808' },
    { sellingPrice: '1', currency: 'UGX' },
  ]) {
    assert.equal(
      (
        await request(
          admin.merchant.id,
          `/products/${product.id}/variants/${first.id}/price`,
          {
            token: admin.token,
            method: 'PUT',
            body,
          },
        )
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await request(admin.merchant.id, '/products/not-a-uuid/variants', {
        token: admin.token,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        admin.merchant.id,
        `/products/${product.id}/variants/not-a-uuid`,
        { token: admin.token },
      )
    ).status,
    400,
  );
});

void test('nested foreign targets are indistinguishable 404 and Product lifecycle is independent', async () => {
  const admin = await actor(Object.values(CATALOGUE_PERMISSIONS));
  const foreign = await merchant('Foreign');
  const ownProduct = await createProduct(admin.merchant.id, 'Own');
  const otherProduct = await createProduct(admin.merchant.id, 'Other');
  const foreignProduct = await createProduct(foreign.id, 'Foreign');
  const variant = await createVariant(
    admin.merchant.id,
    ownProduct.id,
    'NESTED',
  );
  const foreignVariant = await createVariant(
    foreign.id,
    foreignProduct.id,
    'FOREIGN',
  );
  const unknown = '01910000-0000-7000-8000-000000000099';
  for (const route of [
    `/products/${unknown}/variants`,
    `/products/${foreignProduct.id}/variants`,
    `/products/${otherProduct.id}/variants/${variant.id}`,
    `/products/${ownProduct.id}/variants/${foreignVariant.id}`,
    `/products/${ownProduct.id}/variants/${unknown}`,
  ]) {
    assert.equal(
      (await request(admin.merchant.id, route, { token: admin.token })).status,
      404,
    );
  }
  await client.product.update({
    where: { id: ownProduct.id },
    data: { status: 'ARCHIVED' },
  });
  assert.equal(
    (
      await client.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      })
    ).status,
    'INACTIVE',
  );
  assert.equal(
    (
      await request(
        admin.merchant.id,
        `/products/${ownProduct.id}/variants/${variant.id}`,
        { token: admin.token },
      )
    ).status,
    200,
  );
});

void test('permission and Merchant lifecycle changes take effect without relogin or Session mutation', async () => {
  const admin = await actor(Object.values(CATALOGUE_PERMISSIONS));
  const product = await createProduct(admin.merchant.id);
  const variant = await createVariant(admin.merchant.id, product.id, 'SESSION');
  const sessionBefore = await client.session.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(admin.token) },
  });
  const detailRoute = `/products/${product.id}/variants/${variant.id}`;
  assert.equal(
    (await request(admin.merchant.id, detailRoute, { token: admin.token }))
      .status,
    200,
  );
  await revoke(admin.role.id, CATALOGUE_PERMISSIONS.READ);
  assert.equal(
    (await request(admin.merchant.id, detailRoute, { token: admin.token }))
      .status,
    403,
  );
  await grant(admin.role, [CATALOGUE_PERMISSIONS.READ]);
  assert.equal(
    (await request(admin.merchant.id, detailRoute, { token: admin.token }))
      .status,
    200,
  );
  await revoke(admin.role.id, CATALOGUE_PERMISSIONS.PRICE_MANAGE);
  assert.equal(
    (
      await request(admin.merchant.id, `${detailRoute}/price`, {
        token: admin.token,
        method: 'PUT',
        body: { sellingPrice: '1' },
      })
    ).status,
    403,
  );
  await grant(admin.role, [CATALOGUE_PERMISSIONS.PRICE_MANAGE]);
  assert.equal(
    (
      await request(admin.merchant.id, `${detailRoute}/price`, {
        token: admin.token,
        method: 'PUT',
        body: { sellingPrice: '1' },
      })
    ).status,
    200,
  );
  await client.merchantMembership.update({
    where: { id: admin.membership.id },
    data: { status: 'DISABLED' },
  });
  assert.equal(
    (await request(admin.merchant.id, detailRoute, { token: admin.token }))
      .status,
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
    (await request(admin.merchant.id, detailRoute, { token: admin.token }))
      .status,
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

void test('DEPRECATED price permission stays deprecated and immediately denies price writes', async () => {
  const admin = await actor([CATALOGUE_PERMISSIONS.PRICE_MANAGE]);
  const product = await createProduct(admin.merchant.id);
  const variant = await createVariant(
    admin.merchant.id,
    product.id,
    'DEPRECATED',
  );
  await client.permission.update({
    where: { key: CATALOGUE_PERMISSIONS.PRICE_MANAGE },
    data: { status: 'DEPRECATED' },
  });
  try {
    await syncApplicationPermissions(client);
    assert.equal(
      (
        await client.permission.findUniqueOrThrow({
          where: { key: CATALOGUE_PERMISSIONS.PRICE_MANAGE },
        })
      ).status,
      'DEPRECATED',
    );
    assert.equal(
      (
        await request(
          admin.merchant.id,
          `/products/${product.id}/variants/${variant.id}/price`,
          { token: admin.token, method: 'PUT', body: { sellingPrice: '1' } },
        )
      ).status,
      403,
    );
    assert.equal(
      await client.rolePermission.count({ where: { roleId: admin.role.id } }),
      1,
    );
  } finally {
    await client.permission.update({
      where: { key: CATALOGUE_PERMISSIONS.PRICE_MANAGE },
      data: { status: 'ACTIVE' },
    });
  }
});

void test('PostgreSQL outage yields 500-class Variant failure while health behaves correctly', async () => {
  const admin = await actor([CATALOGUE_PERMISSIONS.READ]);
  const product = await createProduct(admin.merchant.id);
  const repositoryRoot = path.resolve(process.cwd(), '..', '..');
  execFileSync('docker', ['compose', 'stop', 'postgres'], {
    cwd: repositoryRoot,
    stdio: 'ignore',
  });
  try {
    const failed = await request(
      admin.merchant.id,
      `/products/${product.id}/variants`,
      { token: admin.token },
    );
    assert.equal(failed.status >= 500 && failed.status < 600, true);
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
