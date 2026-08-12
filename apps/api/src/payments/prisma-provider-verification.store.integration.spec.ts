import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { ConflictException } from '@nestjs/common';
import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import type { DatabaseService } from '../database/database.service';
import { paymentRequestHash } from './payment-idempotency';
import { reportPaymentSchema } from './payment.schema';
import {
  PaymentTransitionNotAllowedError,
  type PaymentTransactionRecord,
} from './payment.store';
import type {
  ProviderVerificationAdapter,
  ProviderVerificationInput,
  ProviderVerificationRegistry,
  ProviderVerificationResult,
} from './provider-verification';
import { ProviderVerificationService } from './provider-verification.service';
import {
  ProviderReferenceRequiredError,
  ProviderVerificationNotApplicableError,
} from './provider-verification.store';
import { PrismaPaymentStore } from './prisma-payment.store';
import { PrismaProviderVerificationStore } from './prisma-provider-verification.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error(
    'Provider verification integration tests require DATABASE_URL.',
  );
}
const client = createPrismaClient({ databaseUrl });
const database = { client } as DatabaseService;
const payments = new PrismaPaymentStore(database);
const verificationStore = new PrismaProviderVerificationStore(database);
const PREFIX = 'B7.2 Provider Verification Test';
let phoneSequence = 60_000_000;

class AdapterRegistry implements ProviderVerificationRegistry {
  public constructor(
    private readonly adapter: ProviderVerificationAdapter | null,
  ) {}

  public resolve(): ProviderVerificationAdapter | null {
    return this.adapter;
  }
}

class Deferred<T> {
  public readonly promise: Promise<T>;
  public resolve!: (value: T) => void;

  public constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.resolve = resolve;
    });
  }
}

function service(adapter: ProviderVerificationAdapter | null) {
  return new ProviderVerificationService(
    verificationStore,
    new AdapterRegistry(adapter),
  );
}

function exactResult(
  input: ProviderVerificationInput,
): ProviderVerificationResult {
  return {
    outcome: 'VERIFIED',
    provider: input.provider,
    amount: input.amount,
    currency: input.currency,
    payerPhone: input.payerPhone,
    providerReference: input.providerReference,
    providerTransactionId: `provider-${input.paymentTransactionId}`,
    providerStatusCode: 'SUCCESS',
    providerStatusText: 'Transaction confirmed',
  };
}

async function fixture(label: string) {
  const merchant = await client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
  const customer = await client.customer.create({
    data: {
      merchantId: merchant.id,
      phone: `+2567${phoneSequence++}`,
      name: 'Provider Verification Customer',
    },
  });
  const order = await client.order.create({
    data: {
      merchantId: merchant.id,
      customerId: customer.id,
      customerPhoneSnapshot: customer.phone,
      currency: 'UGX',
      subtotal: 100_000n,
      idempotencyKey: randomUUID(),
      requestHash: 'e'.repeat(64),
    },
  });
  const context: ResolvedMerchantContext = {
    merchant: { id: merchant.id, displayName: merchant.displayName },
    membership: { id: randomUUID() },
    roles: [],
    permissions: new Set(),
  };
  return { merchant, customer, order, context };
}

async function report(
  f: Awaited<ReturnType<typeof fixture>>,
  options: {
    method?: 'CASH' | 'MTN_MOMO' | 'AIRTEL_MONEY';
    amount?: string;
    providerReference?: string;
  } = {},
): Promise<PaymentTransactionRecord> {
  const input = reportPaymentSchema.parse({
    method: options.method ?? 'MTN_MOMO',
    amount: options.amount ?? '40000',
    ...(options.method === 'CASH' ? {} : { payerPhone: '0712345678' }),
    ...(options.providerReference === undefined
      ? {}
      : { providerReference: options.providerReference }),
  });
  const payment = await payments.report(f.merchant.id, f.order.id, {
    ...input,
    amountValue: BigInt(input.amount),
    idempotencyKey: randomUUID(),
    requestHash: paymentRequestHash(f.order.id, input),
    now: new Date(),
  });
  assert.ok(payment);
  return payment;
}

async function cleanup() {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const merchantIds = merchants.map(({ id }) => id);
  await client.paymentVerificationAttempt.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.paymentTransaction.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.order.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await client.customer.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.merchant.deleteMany({ where: { id: { in: merchantIds } } });
}

after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('manual verification records MANUAL once and summary counts it', async () => {
  const f = await fixture('Manual');
  const payment = await report(f, { method: 'CASH' });
  const first = await payments.transition(
    f.merchant.id,
    f.order.id,
    payment.id,
    'VERIFIED',
    new Date(),
  );
  const replay = await payments.transition(
    f.merchant.id,
    f.order.id,
    payment.id,
    'VERIFIED',
    new Date(Date.now() + 60_000),
  );
  assert.equal(first?.verificationSource, 'MANUAL');
  assert.equal(replay?.verificationSource, 'MANUAL');
  assert.equal(replay?.verifiedAt?.getTime(), first?.verifiedAt?.getTime());
  assert.equal(
    (await payments.summary(f.merchant.id, f.order.id))?.verifiedAmount,
    40_000n,
  );
});

void test('CASH and missing provider reference reject before creating an Attempt', async () => {
  const cashFixture = await fixture('Cash Reject');
  const cash = await report(cashFixture, { method: 'CASH' });
  await assert.rejects(
    verificationStore.begin(
      cashFixture.merchant.id,
      cashFixture.order.id,
      cash.id,
      { idempotencyKey: 'cash-provider', now: new Date() },
    ),
    ProviderVerificationNotApplicableError,
  );
  const missingFixture = await fixture('Missing Reference');
  const missing = await report(missingFixture);
  await assert.rejects(
    verificationStore.begin(
      missingFixture.merchant.id,
      missingFixture.order.id,
      missing.id,
      { idempotencyKey: 'missing-reference', now: new Date() },
    ),
    ProviderReferenceRequiredError,
  );
  assert.equal(
    await client.paymentVerificationAttempt.count({
      where: {
        merchantId: {
          in: [cashFixture.merchant.id, missingFixture.merchant.id],
        },
      },
    }),
    0,
  );
});

void test('exact provider evidence verifies once, replays, and has no Order or Inventory effects', async () => {
  const f = await fixture('Provider Success');
  const payment = await report(f, { providerReference: 'mtn-ref-success' });
  let calls = 0;
  const adapter: ProviderVerificationAdapter = {
    verifyPayment: (input) => {
      calls += 1;
      return Promise.resolve(exactResult(input));
    },
  };
  const providerService = service(adapter);
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
  const first = await providerService.verify(
    f.context,
    f.order.id,
    payment.id,
    'provider-success',
  );
  const replay = await providerService.verify(
    f.context,
    f.order.id,
    payment.id,
    'provider-success',
  );
  assert.equal(calls, 1);
  assert.equal(first.attempt.id, replay.attempt.id);
  assert.equal(first.attempt.status, 'VERIFIED');
  assert.equal(first.payment.verificationSource, 'PROVIDER');
  assert.equal(
    (await payments.summary(f.merchant.id, f.order.id))?.verifiedAmount,
    40_000n,
  );
  const manualPayment = await report(f, { method: 'CASH', amount: '60000' });
  await payments.transition(
    f.merchant.id,
    f.order.id,
    manualPayment.id,
    'VERIFIED',
    new Date(),
  );
  assert.equal(
    (await payments.summary(f.merchant.id, f.order.id))?.verifiedAmount,
    100_000n,
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
  await assert.rejects(
    payments.transition(
      f.merchant.id,
      f.order.id,
      payment.id,
      'REJECTED',
      new Date(),
    ),
    PaymentTransitionNotAllowedError,
  );
});

void test('amount/currency mismatch and technical failure finalize evidence without changing Payment', async () => {
  for (const [label, result, expectedStatus] of [
    [
      'Amount Mismatch',
      {
        outcome: 'VERIFIED',
        provider: 'MTN_MOMO',
        amount: 39_000n,
        currency: 'UGX',
      },
      'NOT_VERIFIED',
    ],
    [
      'Currency Mismatch',
      {
        outcome: 'VERIFIED',
        provider: 'MTN_MOMO',
        amount: 40_000n,
        currency: 'USD',
      },
      'NOT_VERIFIED',
    ],
    [
      'Technical Failure',
      {
        outcome: 'FAILED',
        failureCode: 'NETWORK_UNAVAILABLE',
        failureMessage: 'Provider could not be reached.',
      },
      'FAILED',
    ],
  ] as const) {
    const f = await fixture(label);
    const payment = await report(f, { providerReference: `ref-${label}` });
    const response = await service({
      verifyPayment: () => Promise.resolve(result),
    }).verify(
      f.context,
      f.order.id,
      payment.id,
      `key-${label.replaceAll(' ', '-')}`,
    );
    assert.equal(response.attempt.status, expectedStatus);
    const unchanged = await client.paymentTransaction.findUniqueOrThrow({
      where: { id: payment.id },
    });
    assert.equal(unchanged.status, 'REPORTED');
    assert.equal(unchanged.verificationSource, null);
    assert.equal(unchanged.failedAt, null);
  }
});

void test('NOT_VERIFIED preserves VERIFICATION_PENDING Payment state', async () => {
  const f = await fixture('Pending Not Verified');
  const payment = await report(f, { providerReference: 'pending-ref' });
  await payments.transition(
    f.merchant.id,
    f.order.id,
    payment.id,
    'VERIFICATION_PENDING',
    new Date(),
  );
  const response = await service({
    verifyPayment: () => Promise.resolve({ outcome: 'NOT_VERIFIED' }),
  }).verify(f.context, f.order.id, payment.id, 'pending-not-verified');
  assert.equal(response.attempt.status, 'NOT_VERIFIED');
  assert.equal(response.payment.status, 'VERIFICATION_PENDING');
  assert.equal(response.payment.verificationSource, null);
});

void test('attempt keys conflict across Payments but remain independent across Merchants', async () => {
  const a = await fixture('Key A');
  const b = await fixture('Key B');
  const aSecond = await report(a, {
    providerReference: 'key-a-second',
    amount: '50000',
  });
  const aFirst = await report(a, { providerReference: 'key-a-first' });
  const bFirst = await report(b, { providerReference: 'key-b-first' });
  let calls = 0;
  const providerService = service({
    verifyPayment: (input) => {
      calls += 1;
      return Promise.resolve(exactResult(input));
    },
  });
  await providerService.verify(a.context, a.order.id, aFirst.id, 'shared-key');
  await assert.rejects(
    providerService.verify(a.context, a.order.id, aSecond.id, 'shared-key'),
    ConflictException,
  );
  await providerService.verify(b.context, b.order.id, bFirst.id, 'shared-key');
  assert.equal(calls, 2);
});

void test('adapter phase holds no Payment row lock and manual verification source wins without rewrite', async () => {
  const f = await fixture('Manual Race');
  const payment = await report(f, { providerReference: 'manual-race-ref' });
  const entered = new Deferred<void>();
  const release = new Deferred<void>();
  const providerService = service({
    verifyPayment: async (input) => {
      entered.resolve();
      await release.promise;
      return exactResult(input);
    },
  });
  const command = providerService.verify(
    f.context,
    f.order.id,
    payment.id,
    'manual-race',
  );
  await entered.promise;
  await client.$transaction(async (transaction) => {
    const locked = await transaction.$queryRaw<readonly { id: string }[]>`
      SELECT "id" FROM "payment_transactions"
      WHERE "id" = ${payment.id}::uuid
      FOR UPDATE NOWAIT`;
    assert.equal(locked.length, 1);
  });
  const manual = await payments.transition(
    f.merchant.id,
    f.order.id,
    payment.id,
    'VERIFIED',
    new Date(),
  );
  release.resolve();
  const provider = await command;
  assert.equal(manual?.verificationSource, 'MANUAL');
  assert.equal(provider.payment.verificationSource, 'MANUAL');
  assert.equal(provider.attempt.status, 'VERIFIED');
});

void test('provider verification and rejection serialize without hybrid Payment state', async () => {
  const f = await fixture('Reject Race');
  const payment = await report(f, { providerReference: 'reject-race-ref' });
  const entered = new Deferred<void>();
  const release = new Deferred<void>();
  const providerService = service({
    verifyPayment: async (input) => {
      entered.resolve();
      await release.promise;
      return exactResult(input);
    },
  });
  const providerCommand = providerService.verify(
    f.context,
    f.order.id,
    payment.id,
    'reject-race',
  );
  await entered.promise;
  await payments.transition(
    f.merchant.id,
    f.order.id,
    payment.id,
    'REJECTED',
    new Date(),
  );
  release.resolve();
  const response = await providerCommand;
  assert.equal(response.attempt.status, 'VERIFIED');
  assert.equal(response.payment.status, 'REJECTED');
  assert.equal(response.payment.verificationSource, null);
  assert.equal(response.payment.verifiedAt, null);
});

void test('attempt history is tenant-scoped, filtered, ordered, and snapshot-immutable', async () => {
  const f = await fixture('History');
  const foreign = await fixture('History Foreign');
  const payment = await report(f, { providerReference: 'history-ref' });
  const providerService = service({
    verifyPayment: () =>
      Promise.resolve({
        outcome: 'NOT_VERIFIED',
        providerStatusCode: 'NOT_FOUND',
      }),
  });
  await providerService.verify(f.context, f.order.id, payment.id, 'history-a');
  await providerService.verify(f.context, f.order.id, payment.id, 'history-b');
  const list = await verificationStore.list(
    f.merchant.id,
    f.order.id,
    payment.id,
    {
      status: 'NOT_VERIFIED',
      page: 1,
      pageSize: 1,
    },
  );
  assert.ok(list);
  assert.equal(list.total, 2);
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0]?.providerReferenceSnapshot, 'history-ref');
  assert.equal(list.rows[0]?.payerPhoneSnapshot, '+256712345678');
  assert.equal(list.rows[0]?.amountSnapshot, 40_000n);
  assert.equal(list.rows[0]?.currencySnapshot, 'UGX');
  assert.equal(
    await verificationStore.list(foreign.merchant.id, f.order.id, payment.id, {
      page: 1,
      pageSize: 20,
    }),
    null,
  );
  await assert.rejects(
    client.paymentVerificationAttempt.create({
      data: {
        merchantId: foreign.merchant.id,
        paymentTransactionId: payment.id,
        provider: 'MTN_MOMO',
        payerPhoneSnapshot: '+256712345678',
        amountSnapshot: 1n,
        currencySnapshot: 'UGX',
        requestedAt: new Date(),
        idempotencyKey: randomUUID(),
        requestHash: 'f'.repeat(64),
      },
    }),
  );
});
