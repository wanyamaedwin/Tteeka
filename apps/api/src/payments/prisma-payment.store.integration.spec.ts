import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { DatabaseService } from '../database/database.service';
import { PrismaOrderStore } from '../orders/prisma-order.store';
import { paymentRequestHash } from './payment-idempotency';
import { reportPaymentSchema } from './payment.schema';
import {
  PaymentIdempotencyConflictError,
  PaymentOrderIneligibleError,
  PaymentTransitionNotAllowedError,
} from './payment.store';
import { PrismaPaymentStore } from './prisma-payment.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Payment integration tests require DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const database = { client } as DatabaseService;
const payments = new PrismaPaymentStore(database);
const orders = new PrismaOrderStore(database);
const PREFIX = 'B7.1 Payment Test';
let phoneSequence = 40_000_000;

async function fixture(
  label: string,
  options: {
    currency?: string | null;
    subtotal?: bigint;
    status?: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  } = {},
) {
  const merchant = await client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
  const customer = await client.customer.create({
    data: {
      merchantId: merchant.id,
      phone: `+2567${phoneSequence++}`,
      name: 'Payment Customer',
    },
  });
  const status = options.status ?? 'DRAFT';
  const confirmedAt = status === 'CONFIRMED' ? new Date() : undefined;
  const order = await client.order.create({
    data: {
      merchantId: merchant.id,
      customerId: customer.id,
      customerPhoneSnapshot: customer.phone,
      currency: options.currency === undefined ? 'UGX' : options.currency,
      subtotal: options.subtotal ?? 100_000n,
      status,
      ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
      ...(confirmedAt === undefined
        ? {}
        : {
            confirmedAt,
            stockHoldExpiresAt: new Date(confirmedAt.getTime() + 3_600_000),
            confirmationIdempotencyKey: randomUUID(),
            confirmationRequestHash: 'd'.repeat(64),
          }),
      idempotencyKey: randomUUID(),
      requestHash: 'a'.repeat(64),
    },
  });
  return { merchant, customer, order };
}

function command(orderId: string, key: string, body: Record<string, unknown>) {
  const input = reportPaymentSchema.parse(body);
  return {
    ...input,
    amountValue: BigInt(input.amount),
    idempotencyKey: key,
    requestHash: paymentRequestHash(orderId, input),
    now: new Date(),
  };
}

async function cleanup() {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const merchantIds = merchants.map(({ id }) => id);
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
  await client.order.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await client.productVariant.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.product.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.customer.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.merchant.deleteMany({ where: { id: { in: merchantIds } } });
}

after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('cash report is hash-idempotent, Merchant-local, and rejects conflicts', async () => {
  const a = await fixture('Replay A');
  const b = await fixture('Replay B');
  const key = 'Payment-Replay';
  const reportA = command(a.order.id, key, {
    method: 'CASH',
    amount: '40000',
    merchantReference: 'counter-1',
  });
  const first = await payments.report(a.merchant.id, a.order.id, reportA);
  const replay = await payments.report(a.merchant.id, a.order.id, reportA);
  assert.ok(first);
  assert.equal(replay?.id, first.id);
  assert.equal(first.status, 'REPORTED');
  assert.equal(first.amount, 40_000n);
  assert.equal(first.currency, 'UGX');
  assert.equal(first.providerReference, null);
  await assert.rejects(
    payments.report(
      a.merchant.id,
      a.order.id,
      command(a.order.id, key, { method: 'CASH', amount: '40001' }),
    ),
    PaymentIdempotencyConflictError,
  );
  const crossMerchant = await payments.report(
    b.merchant.id,
    b.order.id,
    command(b.order.id, key, { method: 'CASH', amount: '40000' }),
  );
  assert.ok(crossMerchant);
  assert.notEqual(crossMerchant.id, first.id);
});

void test('verified-only summaries derive unpaid, partial, paid, and overpaid amounts', async () => {
  const f = await fixture('Summary');
  const reported = await payments.report(
    f.merchant.id,
    f.order.id,
    command(f.order.id, 'summary-a', { method: 'CASH', amount: '40000' }),
  );
  assert.ok(reported);
  assert.equal(
    (await payments.summary(f.merchant.id, f.order.id))?.verifiedAmount,
    0n,
  );
  await payments.transition(
    f.merchant.id,
    f.order.id,
    reported.id,
    'VERIFIED',
    new Date(),
  );
  assert.equal(
    (await payments.summary(f.merchant.id, f.order.id))?.verifiedAmount,
    40_000n,
  );
  const second = await payments.report(
    f.merchant.id,
    f.order.id,
    command(f.order.id, 'summary-b', { method: 'CASH', amount: '60000' }),
  );
  assert.ok(second);
  await payments.transition(
    f.merchant.id,
    f.order.id,
    second.id,
    'VERIFIED',
    new Date(),
  );
  assert.equal(
    (await payments.summary(f.merchant.id, f.order.id))?.verifiedAmount,
    100_000n,
  );
  const extra = await payments.report(
    f.merchant.id,
    f.order.id,
    command(f.order.id, 'summary-c', { method: 'CASH', amount: '20000' }),
  );
  assert.ok(extra);
  await payments.transition(
    f.merchant.id,
    f.order.id,
    extra.id,
    'VERIFIED',
    new Date(),
  );
  assert.equal(
    (await payments.summary(f.merchant.id, f.order.id))?.verifiedAmount,
    120_000n,
  );
});

void test('mobile lifecycle preserves replay timestamps and verify/reject serialize', async () => {
  const f = await fixture('Lifecycle');
  const mobile = await payments.report(
    f.merchant.id,
    f.order.id,
    command(f.order.id, 'mobile', {
      method: 'MTN_MOMO',
      amount: '100000',
      payerPhone: '0712345678',
    }),
  );
  assert.ok(mobile);
  assert.equal(mobile.payerPhone, '+256712345678');
  assert.equal(
    (await payments.summary(f.merchant.id, f.order.id))?.verifiedAmount,
    0n,
  );
  const pending = await payments.transition(
    f.merchant.id,
    f.order.id,
    mobile.id,
    'VERIFICATION_PENDING',
    new Date(),
  );
  const pendingReplay = await payments.transition(
    f.merchant.id,
    f.order.id,
    mobile.id,
    'VERIFICATION_PENDING',
    new Date(Date.now() + 60_000),
  );
  assert.equal(
    pendingReplay?.verificationPendingAt?.getTime(),
    pending?.verificationPendingAt?.getTime(),
  );
  assert.equal(
    (await payments.summary(f.merchant.id, f.order.id))?.verifiedAmount,
    0n,
  );
  const raced = await Promise.allSettled([
    payments.transition(
      f.merchant.id,
      f.order.id,
      mobile.id,
      'VERIFIED',
      new Date(),
    ),
    payments.transition(
      f.merchant.id,
      f.order.id,
      mobile.id,
      'REJECTED',
      new Date(),
    ),
  ]);
  assert.equal(raced.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(raced.filter(({ status }) => status === 'rejected').length, 1);
  const final = await client.paymentTransaction.findUniqueOrThrow({
    where: { id: mobile.id },
  });
  assert.ok(final.status === 'VERIFIED' || final.status === 'REJECTED');
  assert.equal(final.verifiedAt !== null && final.rejectedAt !== null, false);
  const failure = raced.find(({ status }) => status === 'rejected');
  assert.ok(failure?.status === 'rejected');
  assert.ok(failure.reason instanceof PaymentTransitionNotAllowedError);
});

void test('confirmed Orders accept reports while CASH cannot enter verification pending', async () => {
  const f = await fixture('Confirmed', { status: 'CONFIRMED' });
  const payment = await payments.report(
    f.merchant.id,
    f.order.id,
    command(f.order.id, 'confirmed-cash', { method: 'CASH', amount: '1000' }),
  );
  assert.ok(payment);
  await assert.rejects(
    payments.transition(
      f.merchant.id,
      f.order.id,
      payment.id,
      'VERIFICATION_PENDING',
      new Date(),
    ),
    PaymentTransitionNotAllowedError,
  );
});

void test('rejected transactions never contribute to the verified total', async () => {
  const f = await fixture('Rejected Summary');
  const payment = await payments.report(
    f.merchant.id,
    f.order.id,
    command(f.order.id, 'rejected-summary', {
      method: 'AIRTEL_MONEY',
      amount: '100000',
      payerPhone: '0712345678',
    }),
  );
  assert.ok(payment);
  await payments.transition(
    f.merchant.id,
    f.order.id,
    payment.id,
    'REJECTED',
    new Date(),
  );
  assert.equal(
    (await payments.summary(f.merchant.id, f.order.id))?.verifiedAmount,
    0n,
  );
});

void test('empty or terminal Orders reject reports and tenant-safe FK blocks attacks', async () => {
  const empty = await fixture('Empty', { currency: null, subtotal: 0n });
  await assert.rejects(
    payments.report(
      empty.merchant.id,
      empty.order.id,
      command(empty.order.id, 'empty', { method: 'CASH', amount: '1' }),
    ),
    PaymentOrderIneligibleError,
  );
  const terminal = await fixture('Terminal', { status: 'CANCELLED' });
  await assert.rejects(
    payments.report(
      terminal.merchant.id,
      terminal.order.id,
      command(terminal.order.id, 'terminal', { method: 'CASH', amount: '1' }),
    ),
    PaymentOrderIneligibleError,
  );
  await assert.rejects(
    client.paymentTransaction.create({
      data: {
        merchantId: empty.merchant.id,
        orderId: terminal.order.id,
        method: 'CASH',
        amount: 1n,
        currency: 'UGX',
        reportedAt: new Date(),
        idempotencyKey: randomUUID(),
        requestHash: 'b'.repeat(64),
      },
    }),
  );
});

void test('verification has no Order/Inventory effect and cancellation retains history', async () => {
  const f = await fixture('Independence');
  const before = {
    order: await client.order.findUniqueOrThrow({ where: { id: f.order.id } }),
    holds: await client.stockHold.count({
      where: { merchantId: f.merchant.id },
    }),
    balances: await client.inventoryBalance.count({
      where: { merchantId: f.merchant.id },
    }),
    ledger: await client.inventoryLedgerEntry.count({
      where: { merchantId: f.merchant.id },
    }),
  };
  const payment = await payments.report(
    f.merchant.id,
    f.order.id,
    command(f.order.id, 'independence', { method: 'CASH', amount: '100000' }),
  );
  assert.ok(payment);
  await payments.transition(
    f.merchant.id,
    f.order.id,
    payment.id,
    'VERIFIED',
    new Date(),
  );
  assert.equal(
    (await client.order.findUniqueOrThrow({ where: { id: f.order.id } }))
      .status,
    before.order.status,
  );
  assert.equal(
    await client.stockHold.count({ where: { merchantId: f.merchant.id } }),
    before.holds,
  );
  assert.equal(
    await client.inventoryBalance.count({
      where: { merchantId: f.merchant.id },
    }),
    before.balances,
  );
  assert.equal(
    await client.inventoryLedgerEntry.count({
      where: { merchantId: f.merchant.id },
    }),
    before.ledger,
  );
  await orders.transition(f.merchant.id, f.order.id, 'CANCELLED');
  const retained = await client.paymentTransaction.findUniqueOrThrow({
    where: { id: payment.id },
  });
  assert.equal(retained.status, 'VERIFIED');
  assert.equal(
    await client.paymentTransaction.count({ where: { orderId: f.order.id } }),
    1,
  );

  const abandoned = await fixture('Abandonment');
  const reported = await payments.report(
    abandoned.merchant.id,
    abandoned.order.id,
    command(abandoned.order.id, 'abandonment', {
      method: 'CASH',
      amount: '1000',
    }),
  );
  assert.ok(reported);
  await orders.transition(
    abandoned.merchant.id,
    abandoned.order.id,
    'ABANDONED',
  );
  assert.equal(
    (
      await client.paymentTransaction.findUniqueOrThrow({
        where: { id: reported.id },
      })
    ).status,
    'REPORTED',
  );
});

void test('DRAFT item replacement and payment reporting serialize on the Order row', async () => {
  const f = await fixture('Draft Race', { currency: null, subtotal: 0n });
  const product = await client.product.create({
    data: { merchantId: f.merchant.id, name: 'Race Product' },
  });
  const variant = await client.productVariant.create({
    data: {
      merchantId: f.merchant.id,
      productId: product.id,
      sku: `RACE-${randomUUID()}`.toUpperCase(),
      status: 'ACTIVE',
      sellingPrice: 100_000n,
      priceCurrency: 'UGX',
      priceUpdatedAt: new Date(),
    },
  });
  await orders.replaceItems(f.merchant.id, f.order.id, {
    items: [{ variantId: variant.id, quantity: '1' }],
  });
  const raced = await Promise.allSettled([
    payments.report(
      f.merchant.id,
      f.order.id,
      command(f.order.id, 'draft-race', { method: 'CASH', amount: '10000' }),
    ),
    orders.replaceItems(f.merchant.id, f.order.id, { items: [] }),
  ]);
  assert.equal(raced[1]?.status, 'fulfilled');
  const finalOrder = await client.order.findUniqueOrThrow({
    where: { id: f.order.id },
  });
  assert.equal(finalOrder.currency, null);
  const persisted = await client.paymentTransaction.findMany({
    where: { orderId: f.order.id },
  });
  if (raced[0]?.status === 'fulfilled') {
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]?.currency, 'UGX');
  } else {
    assert.ok(raced[0]?.reason instanceof PaymentOrderIneligibleError);
    assert.equal(persisted.length, 0);
  }
});
