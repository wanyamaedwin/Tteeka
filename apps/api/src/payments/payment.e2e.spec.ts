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
import { PAYMENT_PERMISSIONS } from './payment-permissions';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Payment E2E tests require DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const PREFIX = 'B7.1 Payment API Test';
let app: INestApplication;
let baseUrl: string;
let phoneSequence = 50_000_000;

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

async function order(
  merchantId: string,
  options: { currency?: string | null; subtotal?: bigint } = {},
) {
  const customer = await client.customer.create({
    data: {
      merchantId,
      phone: `+2567${phoneSequence++}`,
      name: 'Payment Customer',
    },
  });
  return client.order.create({
    data: {
      merchantId,
      customerId: customer.id,
      customerPhoneSnapshot: customer.phone,
      currency: options.currency === undefined ? 'UGX' : options.currency,
      subtotal: options.subtotal ?? 100_000n,
      idempotencyKey: randomUUID(),
      requestHash: 'c'.repeat(64),
    },
  });
}

function call(
  merchantId: string,
  orderId: string,
  token: string | undefined,
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
) {
  return fetch(
    `${baseUrl}/api/v1/merchants/${merchantId}/orders/${orderId}/${path}`,
    {
      method: options.method ?? 'GET',
      headers: {
        ...(token === undefined
          ? {}
          : { cookie: `${SESSION_COOKIE_NAME}=${token}` }),
        ...(options.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        ...(options.key === undefined
          ? {}
          : { 'idempotency-key': options.key }),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    },
  );
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
  await client.paymentVerificationAttempt.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.paymentTransaction.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.orderItem.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.order.deleteMany({ where: { merchantId: { in: merchantIds } } });
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

void test('HTTP reporting, manual lifecycle, list/detail, and derived summaries are safe', async () => {
  const owner = await actor(Object.values(PAYMENT_PERMISSIONS));
  const target = await order(owner.merchant.id);
  const reportedResponse = await call(
    owner.merchant.id,
    target.id,
    owner.token,
    'payments',
    {
      method: 'POST',
      key: 'cash-a',
      body: { method: 'CASH', amount: '40000', note: ' Deposit ' },
    },
  );
  assert.equal(reportedResponse.status, 201);
  assert.equal(reportedResponse.headers.get('cache-control'), 'no-store');
  const cash = (await reportedResponse.json()) as Record<string, unknown>;
  assert.equal(cash.status, 'REPORTED');
  assert.equal(cash.amount, '40000');
  assert.equal(cash.currency, 'UGX');
  assert.equal(cash.note, 'Deposit');
  const serialized = JSON.stringify(cash).toLowerCase();
  assert.equal(serialized.includes('idempotency'), false);
  assert.equal(serialized.includes('requesthash'), false);

  let summary = (await (
    await call(owner.merchant.id, target.id, owner.token, 'payment-summary')
  ).json()) as Record<string, unknown>;
  assert.deepEqual(summary, {
    orderId: target.id,
    currency: 'UGX',
    orderAmount: '100000',
    verifiedAmount: '0',
    amountDue: '100000',
    overpaidAmount: '0',
    status: 'UNPAID',
  });
  const verified = await call(
    owner.merchant.id,
    target.id,
    owner.token,
    `payments/${String(cash.id)}/verify`,
    { method: 'POST' },
  );
  assert.equal(verified.status, 200);
  const verifiedBody = (await verified.json()) as Record<string, unknown>;
  assert.equal(verifiedBody.status, 'VERIFIED');
  assert.equal(verifiedBody.verificationSource, 'MANUAL');
  const firstVerifiedAt = verifiedBody.verifiedAt;
  const verifyReplay = (await (
    await call(
      owner.merchant.id,
      target.id,
      owner.token,
      `payments/${String(cash.id)}/verify`,
      { method: 'POST' },
    )
  ).json()) as Record<string, unknown>;
  assert.equal(verifyReplay.verifiedAt, firstVerifiedAt);
  summary = (await (
    await call(owner.merchant.id, target.id, owner.token, 'payment-summary')
  ).json()) as Record<string, unknown>;
  assert.equal(summary.status, 'PARTIALLY_PAID');
  assert.equal(summary.verifiedAmount, '40000');
  assert.equal(summary.amountDue, '60000');

  for (const [key, amount] of [
    ['cash-b', '60000'],
    ['cash-c', '20000'],
  ] as const) {
    const created = (await (
      await call(owner.merchant.id, target.id, owner.token, 'payments', {
        method: 'POST',
        key,
        body: { method: 'CASH', amount },
      })
    ).json()) as Record<string, unknown>;
    assert.equal(
      (
        await call(
          owner.merchant.id,
          target.id,
          owner.token,
          `payments/${String(created.id)}/verify`,
          { method: 'POST' },
        )
      ).status,
      200,
    );
  }
  summary = (await (
    await call(owner.merchant.id, target.id, owner.token, 'payment-summary')
  ).json()) as Record<string, unknown>;
  assert.equal(summary.status, 'OVERPAID');
  assert.equal(summary.verifiedAmount, '120000');
  assert.equal(summary.amountDue, '0');
  assert.equal(summary.overpaidAmount, '20000');

  const listResponse = await call(
    owner.merchant.id,
    target.id,
    owner.token,
    'payments?status=VERIFIED&page=1&pageSize=2',
  );
  assert.equal(listResponse.status, 200);
  const list = (await listResponse.json()) as {
    items: Record<string, unknown>[];
    total: number;
  };
  assert.equal(list.items.length, 2);
  assert.equal(list.total, 3);
  assert.equal(
    (
      await call(
        owner.merchant.id,
        target.id,
        owner.token,
        `payments/${String(cash.id)}`,
      )
    ).status,
    200,
  );
});

void test('method validation, replay/conflict, pending/rejection, and empty Order rejection work', async () => {
  const owner = await actor(Object.values(PAYMENT_PERMISSIONS));
  const target = await order(owner.merchant.id);
  const empty = await order(owner.merchant.id, {
    currency: null,
    subtotal: 0n,
  });
  for (const body of [
    { method: 'MTN_MOMO', amount: '1000' },
    { method: 'CASH', amount: '1000', providerReference: 'not-cash' },
    { method: 'CASH', amount: '1000', screenshot: 'not-accepted' },
  ]) {
    assert.equal(
      (
        await call(owner.merchant.id, target.id, owner.token, 'payments', {
          method: 'POST',
          key: randomUUID(),
          body,
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await call(owner.merchant.id, empty.id, owner.token, 'payments', {
        method: 'POST',
        key: 'empty',
        body: { method: 'CASH', amount: '1' },
      })
    ).status,
    422,
  );
  const body = {
    method: 'MTN_MOMO',
    amount: '100000',
    payerPhone: '0712345678',
    providerReference: ' ref-1 ',
  };
  const first = await call(
    owner.merchant.id,
    target.id,
    owner.token,
    'payments',
    {
      method: 'POST',
      key: 'mobile-replay',
      body,
    },
  );
  const payment = (await first.json()) as Record<string, unknown>;
  assert.equal(payment.payerPhone, '+256712345678');
  const replay = (await (
    await call(owner.merchant.id, target.id, owner.token, 'payments', {
      method: 'POST',
      key: 'mobile-replay',
      body,
    })
  ).json()) as Record<string, unknown>;
  assert.equal(replay.id, payment.id);
  assert.equal(
    (
      await call(owner.merchant.id, target.id, owner.token, 'payments', {
        method: 'POST',
        key: 'mobile-replay',
        body: { ...body, amount: '99999' },
      })
    ).status,
    409,
  );
  const pending = await call(
    owner.merchant.id,
    target.id,
    owner.token,
    `payments/${String(payment.id)}/verification-pending`,
    { method: 'POST' },
  );
  assert.equal(pending.status, 200);
  const pendingBody = (await pending.json()) as Record<string, unknown>;
  const pendingAt = pendingBody.verificationPendingAt;
  const pendingReplay = (await (
    await call(
      owner.merchant.id,
      target.id,
      owner.token,
      `payments/${String(payment.id)}/verification-pending`,
      { method: 'POST' },
    )
  ).json()) as Record<string, unknown>;
  assert.equal(pendingReplay.verificationPendingAt, pendingAt);
  const rejected = (await (
    await call(
      owner.merchant.id,
      target.id,
      owner.token,
      `payments/${String(payment.id)}/reject`,
      { method: 'POST' },
    )
  ).json()) as Record<string, unknown>;
  assert.equal(rejected.status, 'REJECTED');
  const rejectedAt = rejected.rejectedAt;
  const rejectReplay = (await (
    await call(
      owner.merchant.id,
      target.id,
      owner.token,
      `payments/${String(payment.id)}/reject`,
      { method: 'POST' },
    )
  ).json()) as Record<string, unknown>;
  assert.equal(rejectReplay.rejectedAt, rejectedAt);
  assert.equal(
    (
      await call(
        owner.merchant.id,
        target.id,
        owner.token,
        `payments/${String(payment.id)}/verify`,
        { method: 'POST' },
      )
    ).status,
    409,
  );
});

void test('payment permissions are exact and tenant/order targets are concealed', async () => {
  const reader = await actor([PAYMENT_PERMISSIONS.READ]);
  const manager = await actor([PAYMENT_PERMISSIONS.MANAGE]);
  const orderReader = await actor([ORDER_PERMISSIONS.READ]);
  const unprivileged = await actor([]);
  const readerOrder = await order(reader.merchant.id);
  const managerOrder = await order(manager.merchant.id);
  const orderReaderOrder = await order(orderReader.merchant.id);
  const managed = (await (
    await call(
      manager.merchant.id,
      managerOrder.id,
      manager.token,
      'payments',
      {
        method: 'POST',
        key: 'managed',
        body: { method: 'CASH', amount: '1' },
      },
    )
  ).json()) as Record<string, unknown>;

  assert.equal(
    (await call(reader.merchant.id, readerOrder.id, undefined, 'payments'))
      .status,
    401,
  );
  assert.equal(
    (await call(reader.merchant.id, readerOrder.id, manager.token, 'payments'))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        unprivileged.merchant.id,
        await order(unprivileged.merchant.id).then(({ id }) => id),
        unprivileged.token,
        'payments',
      )
    ).status,
    403,
  );
  for (const path of ['payments', 'payment-summary']) {
    assert.equal(
      (await call(reader.merchant.id, readerOrder.id, reader.token, path))
        .status,
      200,
    );
    assert.equal(
      (await call(manager.merchant.id, managerOrder.id, manager.token, path))
        .status,
      403,
    );
    assert.equal(
      (
        await call(
          orderReader.merchant.id,
          orderReaderOrder.id,
          orderReader.token,
          path,
        )
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await call(reader.merchant.id, readerOrder.id, reader.token, 'payments', {
        method: 'POST',
        key: 'denied',
        body: { method: 'CASH', amount: '1' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await call(reader.merchant.id, managerOrder.id, reader.token, 'payments'))
      .status,
    404,
  );
  assert.equal(
    (
      await call(
        manager.merchant.id,
        await order(manager.merchant.id).then(({ id }) => id),
        manager.token,
        `payments/${String(managed.id)}/verify`,
        { method: 'POST' },
      )
    ).status,
    404,
  );
});

void test('provider verification is unavailable by default while Attempt history remains exact and private', async () => {
  const reader = await actor([PAYMENT_PERMISSIONS.READ]);
  const manager = await actor([PAYMENT_PERMISSIONS.MANAGE]);
  const orderReader = await actor([ORDER_PERMISSIONS.READ]);
  const unprivileged = await actor([]);
  const managerOrder = await order(manager.merchant.id);
  const readerOrder = await order(reader.merchant.id);
  const orderReaderOrder = await order(orderReader.merchant.id);
  const unprivilegedOrder = await order(unprivileged.merchant.id);
  const paymentResponse = await call(
    manager.merchant.id,
    managerOrder.id,
    manager.token,
    'payments',
    {
      method: 'POST',
      key: 'provider-route-payment',
      body: {
        method: 'MTN_MOMO',
        amount: '40000',
        payerPhone: '0712345678',
        providerReference: 'route-ref',
      },
    },
  );
  const payment = (await paymentResponse.json()) as Record<string, unknown>;
  const providerPath = `payments/${String(payment.id)}/provider-verify`;
  assert.equal(
    (
      await call(
        manager.merchant.id,
        managerOrder.id,
        undefined,
        providerPath,
        { method: 'POST', key: 'provider-unauthenticated' },
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        reader.merchant.id,
        readerOrder.id,
        manager.token,
        providerPath,
        { method: 'POST', key: 'provider-no-membership' },
      )
    ).status,
    403,
  );
  const unavailable = await call(
    manager.merchant.id,
    managerOrder.id,
    manager.token,
    providerPath,
    { method: 'POST', key: 'provider-route-attempt' },
  );
  assert.equal(unavailable.status, 503);
  assert.equal(
    (
      await call(
        manager.merchant.id,
        managerOrder.id,
        manager.token,
        providerPath,
        { method: 'POST', key: 'provider-route-attempt' },
      )
    ).status,
    503,
  );
  assert.equal(
    await client.paymentVerificationAttempt.count({
      where: { paymentTransactionId: String(payment.id) },
    }),
    1,
  );
  const managerHistory = `payments/${String(payment.id)}/verification-attempts`;
  assert.equal(
    (
      await call(
        manager.merchant.id,
        managerOrder.id,
        manager.token,
        managerHistory,
      )
    ).status,
    403,
  );

  const readerPayment = await client.paymentTransaction.create({
    data: {
      merchantId: reader.merchant.id,
      orderId: readerOrder.id,
      method: 'AIRTEL_MONEY',
      amount: 40_000n,
      currency: 'UGX',
      payerPhone: '+256712345678',
      providerReference: 'reader-ref',
      reportedAt: new Date(),
      idempotencyKey: randomUUID(),
      requestHash: '9'.repeat(64),
    },
  });
  const readerAttempt = await client.paymentVerificationAttempt.create({
    data: {
      merchantId: reader.merchant.id,
      paymentTransactionId: readerPayment.id,
      provider: 'AIRTEL_MONEY',
      status: 'NOT_VERIFIED',
      providerReferenceSnapshot: 'reader-ref',
      payerPhoneSnapshot: '+256712345678',
      amountSnapshot: 40_000n,
      currencySnapshot: 'UGX',
      providerStatusCode: 'NOT_FOUND',
      providerStatusText: 'No matching transaction',
      requestedAt: new Date(Date.now() - 1000),
      completedAt: new Date(),
      idempotencyKey: randomUUID(),
      requestHash: '8'.repeat(64),
    },
  });
  const readerHistory = `payments/${readerPayment.id}/verification-attempts?status=NOT_VERIFIED&page=1&pageSize=20`;
  const otherReaderOrder = await order(reader.merchant.id);
  const historyResponse = await call(
    reader.merchant.id,
    readerOrder.id,
    reader.token,
    readerHistory,
  );
  assert.equal(historyResponse.status, 200);
  const history = (await historyResponse.json()) as {
    items: Record<string, unknown>[];
    total: number;
  };
  assert.equal(history.total, 1);
  assert.equal(history.items[0]?.id, readerAttempt.id);
  const serialized = JSON.stringify(history).toLowerCase();
  for (const privateField of [
    'idempotencykey',
    'requesthash',
    'payerphonesnapshot',
    'amountsnapshot',
    'currencysnapshot',
    'providerreferencesnapshot',
  ]) {
    assert.equal(serialized.includes(privateField), false);
  }
  assert.equal(
    (
      await call(
        reader.merchant.id,
        readerOrder.id,
        reader.token,
        `payments/${readerPayment.id}/provider-verify`,
        { method: 'POST', key: 'reader-denied' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        orderReader.merchant.id,
        orderReaderOrder.id,
        orderReader.token,
        `payments/${readerPayment.id}/verification-attempts`,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        unprivileged.merchant.id,
        unprivilegedOrder.id,
        unprivileged.token,
        `payments/${readerPayment.id}/verification-attempts`,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        reader.merchant.id,
        managerOrder.id,
        reader.token,
        `payments/${readerPayment.id}/verification-attempts`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        reader.merchant.id,
        otherReaderOrder.id,
        reader.token,
        `payments/${readerPayment.id}/verification-attempts`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        reader.merchant.id,
        readerOrder.id,
        undefined,
        `payments/${readerPayment.id}/verification-attempts`,
      )
    ).status,
    401,
  );
});
