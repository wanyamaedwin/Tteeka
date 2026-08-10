import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';
import { createSessionToken } from '@tteeka/security';
import cookieParser from 'cookie-parser';

import { syncApplicationPermissions } from '../access-management/permission-sync';
import { AppModule } from '../app.module';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { INVENTORY_PERMISSIONS } from './inventory-permissions';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0)
  throw new Error('Inventory E2E requires DATABASE_URL.');
const client = createPrismaClient({ databaseUrl });
const PREFIX = 'B4.1 Inventory API Test';
let app: INestApplication;
let baseUrl: string;
const execFileAsync = promisify(execFile);

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
  const sessionToken = createSessionToken();
  const session = await client.session.create({
    data: {
      userId: user.id,
      tokenHash: sessionToken.tokenHash,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  return {
    merchant,
    user,
    membership,
    role,
    session,
    token: sessionToken.token,
  };
}

function call(
  merchantId: string,
  token: string,
  path: string,
  options: { method?: string; key?: string; body?: unknown } = {},
) {
  return fetch(`${baseUrl}/api/v1/merchants/${merchantId}/inventory${path}`, {
    method: options.method ?? 'GET',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      ...(options.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
      ...(options.key === undefined ? {} : { 'idempotency-key': options.key }),
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
  await client.inventoryLedgerEntry.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.inventoryBalance.deleteMany({
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

void test('real guards and PostgreSQL expose zero, movements, replay, ledger privacy, and no session mutation', async () => {
  const owner = await actor(Object.values(INVENTORY_PERMISSIONS));
  const product = await client.product.create({
    data: { merchantId: owner.merchant.id, name: 'Unpriced archived stock' },
  });
  const variant = await client.productVariant.create({
    data: {
      merchantId: owner.merchant.id,
      productId: product.id,
      sku: 'INV-E2E',
      status: 'ARCHIVED',
    },
  });
  const zero = await call(owner.merchant.id, owner.token, `/${variant.id}`);
  assert.equal(zero.status, 200);
  assert.equal(
    ((await zero.json()) as { availableQuantity: string }).availableQuantity,
    '0',
  );
  const key = 'Inventory-E2E-Key';
  const receipt = await call(
    owner.merchant.id,
    owner.token,
    `/${variant.id}/movements`,
    { method: 'POST', key, body: { type: 'RECEIPT', quantity: '50' } },
  );
  assert.equal(receipt.status, 200);
  const first = (await receipt.json()) as {
    id: string;
    availableAfter: string;
  };
  assert.equal(first.availableAfter, '50');
  const replay = await call(
    owner.merchant.id,
    owner.token,
    `/${variant.id}/movements`,
    { method: 'POST', key, body: { type: 'RECEIPT', quantity: '050' } },
  );
  assert.equal(replay.status, 200);
  assert.equal(((await replay.json()) as { id: string }).id, first.id);
  const out = await call(
    owner.merchant.id,
    owner.token,
    `/${variant.id}/movements`,
    {
      method: 'POST',
      key: 'out-key',
      body: { type: 'ADJUSTMENT_OUT', quantity: '3', note: ' Physical count ' },
    },
  );
  assert.equal(out.status, 200);
  const inbound = await call(
    owner.merchant.id,
    owner.token,
    `/${variant.id}/movements`,
    {
      method: 'POST',
      key: 'in-key',
      body: { type: 'ADJUSTMENT_IN', quantity: '2', note: 'Correction' },
    },
  );
  assert.equal(inbound.status, 200);
  assert.equal(
    ((await inbound.json()) as { availableAfter: string }).availableAfter,
    '49',
  );
  const ledger = await call(
    owner.merchant.id,
    owner.token,
    `/${variant.id}/ledger`,
  );
  const ledgerBody = (await ledger.json()) as {
    movements: readonly Record<string, unknown>[];
  };
  assert.equal(ledger.status, 200);
  assert.equal(ledgerBody.movements.length, 3);
  assert.equal('idempotencyKey' in ledgerBody.movements[0]!, false);
  assert.equal('requestHash' in ledgerBody.movements[0]!, false);
  const unchanged = await client.session.findUniqueOrThrow({
    where: { id: owner.session.id },
  });
  assert.equal(unchanged.tokenHash, owner.session.tokenHash);
  assert.equal(
    unchanged.expiresAt.getTime(),
    owner.session.expiresAt.getTime(),
  );
  assert.equal(receipt.headers.get('set-cookie'), null);
});

void test('permissions are independent and foreign Variants are concealed', async () => {
  const manager = await actor([INVENTORY_PERMISSIONS.MANAGE]);
  const reader = await actor([INVENTORY_PERMISSIONS.READ]);
  const foreignProduct = await client.product.create({
    data: { merchantId: reader.merchant.id, name: 'Foreign' },
  });
  const foreignVariant = await client.productVariant.create({
    data: {
      merchantId: reader.merchant.id,
      productId: foreignProduct.id,
      sku: 'FOREIGN-E2E',
    },
  });
  assert.equal(
    (await call(manager.merchant.id, manager.token, '')).status,
    403,
  );
  assert.equal(
    (
      await call(
        manager.merchant.id,
        manager.token,
        `/${foreignVariant.id}/movements`,
        {
          method: 'POST',
          key: 'foreign',
          body: { type: 'RECEIPT', quantity: '1' },
        },
      )
    ).status,
    404,
  );
  assert.equal((await call(reader.merchant.id, reader.token, '')).status, 200);
  assert.equal(
    (
      await call(
        reader.merchant.id,
        reader.token,
        `/${foreignVariant.id}/movements`,
        {
          method: 'POST',
          key: 'denied',
          body: { type: 'RECEIPT', quantity: '1' },
        },
      )
    ).status,
    403,
  );
});

void test(
  'database outage stays 500-class while liveness remains up and readiness recovers',
  { timeout: 30_000 },
  async () => {
    const reader = await actor([INVENTORY_PERMISSIONS.READ]);
    const product = await client.product.create({
      data: { merchantId: reader.merchant.id, name: 'Outage Product' },
    });
    const variant = await client.productVariant.create({
      data: {
        merchantId: reader.merchant.id,
        productId: product.id,
        sku: 'OUTAGE-E2E',
      },
    });
    assert.equal(
      (await call(reader.merchant.id, reader.token, `/${variant.id}`)).status,
      200,
    );
    try {
      await execFileAsync(
        'docker',
        [
          'compose',
          '--env-file',
          '../../.env',
          '-f',
          '../../compose.yaml',
          'stop',
          'postgres',
        ],
        { windowsHide: true },
      );
      const failed = await call(
        reader.merchant.id,
        reader.token,
        `/${variant.id}`,
      );
      assert.equal(failed.status >= 500 && failed.status < 600, true);
      assert.equal((await fetch(`${baseUrl}/api/v1/health/live`)).status, 200);
      assert.equal((await fetch(`${baseUrl}/api/v1/health/ready`)).status, 503);
    } finally {
      await execFileAsync(
        'docker',
        [
          'compose',
          '--env-file',
          '../../.env',
          '-f',
          '../../compose.yaml',
          'up',
          '-d',
          '--wait',
          'postgres',
        ],
        { windowsHide: true },
      );
    }
    assert.equal((await fetch(`${baseUrl}/api/v1/health/ready`)).status, 200);
  },
);
