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
import { ORDER_PERMISSIONS } from '../orders/order-permissions';
import { PAYMENT_PERMISSIONS } from '../payments/payment-permissions';
import { DELIVERY_PERMISSIONS } from './delivery-permissions';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Delivery E2E requires DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const PREFIX = 'B8.1 Delivery API Test';
let app: INestApplication;
let baseUrl: string;
let phoneSequence = 50_000_000;

async function actor(keys: readonly string[]) {
  const merchant = await client.merchant.create({
    data: { displayName: `${PREFIX} ${randomUUID()}` },
  });
  return { merchant, ...(await member(merchant.id, keys)) };
}

async function member(merchantId: string, keys: readonly string[]) {
  const user = await client.user.create({
    data: {
      displayName: `${PREFIX} User ${randomUUID()}`,
      phoneE164: `+2567${phoneSequence++}`,
    },
  });
  const membership = await client.merchantMembership.create({
    data: { merchantId, userId: user.id },
  });
  const role = await client.role.create({
    data: { merchantId, name: `Role ${randomUUID()}` },
  });
  await client.membershipRole.create({
    data: { merchantId, membershipId: membership.id, roleId: role.id },
  });
  const permissions = await client.permission.findMany({
    where: { key: { in: [...keys] } },
    select: { id: true },
  });
  await client.rolePermission.createMany({
    data: permissions.map(({ id }) => ({
      merchantId,
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
  return { user, token: token.token };
}

async function confirmedOrder(
  merchantId: string,
  label: string,
  withLocation = true,
) {
  const customer = await client.customer.create({
    data: {
      merchantId,
      name: `${label} Customer`,
      phone: `+2567${phoneSequence++}`,
    },
  });
  const location = withLocation
    ? await client.deliveryLocation.create({
        data: {
          merchantId,
          customerId: customer.id,
          area: `${label} Area`,
          landmark: `${label} Landmark`,
          phone: `+2567${phoneSequence++}`,
          instructions: `${label} instructions`,
          mapPinUrl: `https://maps.example/${label}`,
        },
      })
    : null;
  const confirmedAt = new Date();
  const order = await client.order.create({
    data: {
      merchantId,
      customerId: customer.id,
      status: 'CONFIRMED',
      customerNameSnapshot: customer.name,
      customerPhoneSnapshot: customer.phone,
      deliveryLocationId: location?.id ?? null,
      deliveryAreaSnapshot: location?.area ?? null,
      deliveryLandmarkSnapshot: location?.landmark ?? null,
      deliveryPhoneSnapshot: location?.phone ?? null,
      deliveryInstructionsSnapshot: location?.instructions ?? null,
      deliveryMapPinUrlSnapshot: location?.mapPinUrl ?? null,
      idempotencyKey: `order-${randomUUID()}`,
      requestHash: 'a'.repeat(64),
      confirmedAt,
      stockHoldExpiresAt: new Date(confirmedAt.getTime() + 3_600_000),
      confirmationIdempotencyKey: `confirm-${randomUUID()}`,
      confirmationRequestHash: 'b'.repeat(64),
    },
  });
  return { customer, location, order };
}

function call(
  merchantId: string,
  path: string,
  options: {
    token?: string;
    method?: string;
    body?: unknown;
    idempotencyKey?: string;
  } = {},
) {
  return fetch(`${baseUrl}/api/v1/merchants/${merchantId}/deliveries${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token === undefined
        ? {}
        : { cookie: `${SESSION_COOKIE_NAME}=${options.token}` }),
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
  await client.deliveryAttempt.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.deliveryJob.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.paymentVerificationAttempt.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.paymentTransaction.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.stockHold.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.inventoryLedgerEntry.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.inventoryBalance.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.orderItem.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.order.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
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
  await client.role.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
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

void test('HTTP lifecycle creates immutable private snapshots and records a delivered Attempt', async () => {
  const owner = await actor(Object.values(DELIVERY_PERMISSIONS));
  const source = await confirmedOrder(owner.merchant.id, 'Kira');
  const before = await Promise.all([
    client.inventoryBalance.count({ where: { merchantId: owner.merchant.id } }),
    client.inventoryLedgerEntry.count({
      where: { merchantId: owner.merchant.id },
    }),
    client.stockHold.count({ where: { merchantId: owner.merchant.id } }),
    client.paymentTransaction.count({
      where: { merchantId: owner.merchant.id },
    }),
  ]);
  const createdResponse = await call(owner.merchant.id, '', {
    token: owner.token,
    method: 'POST',
    idempotencyKey: 'HTTP-Delivery-Create',
    body: { orderId: source.order.id },
  });
  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.headers.get('cache-control'), 'no-store');
  const created = (await createdResponse.json()) as Record<string, unknown> & {
    id: string;
    createdAt: string;
  };
  assert.deepEqual(
    [created.status, created.areaSnapshot, created.landmarkSnapshot],
    ['PENDING', 'Kira Area', 'Kira Landmark'],
  );
  assert.equal('idempotencyKey' in created, false);
  assert.equal('requestHash' in created, false);
  assert.equal('merchantId' in created, false);

  await Promise.all([
    client.customer.update({
      where: { id: source.customer.id },
      data: { name: 'Changed Customer' },
    }),
    client.deliveryLocation.update({
      where: { id: source.location!.id },
      data: { landmark: 'Changed Landmark' },
    }),
  ]);
  const replay = await call(owner.merchant.id, '', {
    token: owner.token,
    method: 'POST',
    idempotencyKey: 'HTTP-Delivery-Create',
    body: { orderId: source.order.id },
  });
  const replayBody = (await replay.json()) as Record<string, unknown>;
  assert.deepEqual(
    [replayBody.id, replayBody.createdAt, replayBody.landmarkSnapshot],
    [created.id, created.createdAt, 'Kira Landmark'],
  );

  for (const command of ['ready', 'dispatch']) {
    const response = await call(
      owner.merchant.id,
      `/${created.id}/${command}`,
      {
        token: owner.token,
        method: 'POST',
      },
    );
    assert.equal(response.status, 200);
  }
  const attempted = await call(owner.merchant.id, `/${created.id}/attempts`, {
    token: owner.token,
    method: 'POST',
    idempotencyKey: 'HTTP-Delivered-Attempt',
    body: { result: 'DELIVERED', note: '  Handed to customer  ' },
  });
  assert.equal(attempted.status, 201);
  const completed = (await attempted.json()) as {
    delivery: Record<string, unknown>;
    attempt: Record<string, unknown>;
  };
  assert.deepEqual(
    [
      completed.delivery.status,
      completed.attempt.attemptNumber,
      completed.attempt.result,
      completed.attempt.failureReason,
      completed.attempt.note,
    ],
    ['DELIVERED', 1, 'DELIVERED', null, 'Handed to customer'],
  );
  assert.equal('idempotencyKey' in completed.attempt, false);
  assert.equal('requestHash' in completed.attempt, false);

  const detail = (await (
    await call(owner.merchant.id, `/${created.id}`, { token: owner.token })
  ).json()) as Record<string, unknown>;
  assert.equal(detail.landmarkSnapshot, 'Kira Landmark');
  const listResponse = await call(
    owner.merchant.id,
    `?q=Kira&orderId=${source.order.id}&status=DELIVERED&createdFrom=${encodeURIComponent(
      new Date(Date.parse(created.createdAt) - 1).toISOString(),
    )}&createdTo=${encodeURIComponent(new Date(Date.now() + 10_000).toISOString())}`,
    { token: owner.token },
  );
  assert.equal(listResponse.status, 200);
  const listed = (await listResponse.json()) as {
    deliveries: { id: string }[];
    pagination: { total: number };
  };
  assert.deepEqual(
    listed.deliveries.map(({ id }) => id),
    [created.id],
  );
  assert.equal(listed.pagination.total, 1);
  const history = (await (
    await call(
      owner.merchant.id,
      `/${created.id}/attempts?result=DELIVERED&page=1&pageSize=20`,
      { token: owner.token },
    )
  ).json()) as { attempts: { id: string }[]; pagination: { total: number } };
  assert.deepEqual(
    history.attempts.map(({ id }) => id),
    [completed.attempt.id],
  );
  assert.equal(history.pagination.total, 1);

  const orderAfter = await client.order.findUniqueOrThrow({
    where: { id: source.order.id },
  });
  assert.equal(orderAfter.status, 'CONFIRMED');
  const after = await Promise.all([
    client.inventoryBalance.count({ where: { merchantId: owner.merchant.id } }),
    client.inventoryLedgerEntry.count({
      where: { merchantId: owner.merchant.id },
    }),
    client.stockHold.count({ where: { merchantId: owner.merchant.id } }),
    client.paymentTransaction.count({
      where: { merchantId: owner.merchant.id },
    }),
  ]);
  assert.deepEqual(after, before);
});

void test('HTTP creation and Attempt validation reject unsafe states atomically', async () => {
  const owner = await actor([DELIVERY_PERMISSIONS.MANAGE]);
  const noLocation = await confirmedOrder(
    owner.merchant.id,
    'No Location',
    false,
  );
  assert.equal(
    (
      await call(owner.merchant.id, '', {
        token: owner.token,
        method: 'POST',
        idempotencyKey: 'No-Location',
        body: { orderId: noLocation.order.id },
      })
    ).status,
    422,
  );
  const draftSource = await confirmedOrder(owner.merchant.id, 'Draft');
  await client.order.update({
    where: { id: draftSource.order.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    },
  });
  assert.equal(
    (
      await call(owner.merchant.id, '', {
        token: owner.token,
        method: 'POST',
        idempotencyKey: 'Cancelled-Order',
        body: { orderId: draftSource.order.id },
      })
    ).status,
    422,
  );

  const source = await confirmedOrder(owner.merchant.id, 'Attempt Validation');
  const created = (await (
    await call(owner.merchant.id, '', {
      token: owner.token,
      method: 'POST',
      idempotencyKey: 'Attempt-Validation-Create',
      body: { orderId: source.order.id },
    })
  ).json()) as { id: string };
  assert.equal(
    (
      await call(owner.merchant.id, `/${created.id}/attempts`, {
        token: owner.token,
        method: 'POST',
        idempotencyKey: 'Early-Attempt',
        body: { result: 'DELIVERED' },
      })
    ).status,
    409,
  );
  for (const body of [
    { result: 'DELIVERED', failureReason: 'OTHER' },
    { result: 'FAILED' },
    { result: 'FAILED', failureReason: 'INVALID' },
    { result: 'FAILED', failureReason: 'OTHER', attemptNumber: 1 },
  ]) {
    assert.equal(
      (
        await call(owner.merchant.id, `/${created.id}/attempts`, {
          token: owner.token,
          method: 'POST',
          idempotencyKey: randomUUID(),
          body,
        })
      ).status,
      400,
    );
  }
});

void test('all eight routes enforce authentication, exact independent permissions, and tenant concealment', async () => {
  const [owner, outsider] = await Promise.all([
    actor(Object.values(DELIVERY_PERMISSIONS)),
    actor(Object.values(DELIVERY_PERMISSIONS)),
  ]);
  const source = await confirmedOrder(owner.merchant.id, 'Permissions');
  const created = (await (
    await call(owner.merchant.id, '', {
      token: owner.token,
      method: 'POST',
      idempotencyKey: 'Permission-Create',
      body: { orderId: source.order.id },
    })
  ).json()) as { id: string };

  const routes = [
    ['GET', '', undefined, undefined],
    ['POST', '', { orderId: source.order.id }, randomUUID()],
    ['GET', `/${created.id}`, undefined, undefined],
    ['POST', `/${created.id}/ready`, undefined, undefined],
    ['POST', `/${created.id}/dispatch`, undefined, undefined],
    ['POST', `/${created.id}/cancel`, undefined, undefined],
    ['GET', `/${created.id}/attempts`, undefined, undefined],
    ['POST', `/${created.id}/attempts`, { result: 'DELIVERED' }, randomUUID()],
  ] as const;
  for (const [method, path, body, idempotencyKey] of routes) {
    assert.equal(
      (
        await call(owner.merchant.id, path, {
          method,
          ...(body === undefined ? {} : { body }),
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
        })
      ).status,
      401,
    );
  }

  assert.equal(
    (
      await call(outsider.merchant.id, `/${created.id}`, {
        token: outsider.token,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(outsider.merchant.id, `/${created.id}/attempts`, {
        token: outsider.token,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(owner.merchant.id, `/${created.id}`, {
        token: outsider.token,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(outsider.merchant.id, '', {
        token: outsider.token,
        method: 'POST',
        idempotencyKey: 'Foreign-Order',
        body: { orderId: source.order.id },
      })
    ).status,
    422,
  );

  const readOnly = await member(owner.merchant.id, [DELIVERY_PERMISSIONS.READ]);
  assert.equal(
    (await call(owner.merchant.id, `/${created.id}`, { token: readOnly.token }))
      .status,
    200,
  );
  assert.equal(
    (
      await call(owner.merchant.id, `/${created.id}/ready`, {
        token: readOnly.token,
        method: 'POST',
      })
    ).status,
    403,
  );

  const manageOnly = await member(owner.merchant.id, [
    DELIVERY_PERMISSIONS.MANAGE,
  ]);
  assert.equal(
    (
      await call(owner.merchant.id, `/${created.id}`, {
        token: manageOnly.token,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(owner.merchant.id, `/${created.id}/ready`, {
        token: manageOnly.token,
        method: 'POST',
      })
    ).status,
    200,
  );

  const unrelated = await member(owner.merchant.id, [
    ...Object.values(ORDER_PERMISSIONS),
    ...Object.values(PAYMENT_PERMISSIONS),
  ]);
  assert.equal(
    (await call(owner.merchant.id, '', { token: unrelated.token })).status,
    403,
  );
  assert.equal(
    (
      await call(owner.merchant.id, `/${created.id}/cancel`, {
        token: unrelated.token,
        method: 'POST',
      })
    ).status,
    403,
  );
});
