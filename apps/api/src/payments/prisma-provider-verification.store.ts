import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { providerVerificationRequestHash } from './provider-verification-idempotency';
import type { VerificationAttemptListQuery } from './provider-verification.schema';
import type { PaymentProvider } from './provider-verification';
import {
  ProviderReferenceRequiredError,
  ProviderVerificationIdempotencyConflictError,
  ProviderVerificationNotApplicableError,
  ProviderVerificationStateConflictError,
  type BegunProviderVerification,
  type BeginProviderVerificationCommand,
  type CompleteProviderVerificationCommand,
  type CompletedProviderVerification,
  type PaymentVerificationAttemptRecord,
  type ProviderVerificationStore,
  type VerificationAttemptListResult,
} from './provider-verification.store';

const paymentSelect = {
  id: true,
  merchantId: true,
  orderId: true,
  method: true,
  status: true,
  verificationSource: true,
  amount: true,
  currency: true,
  payerPhone: true,
  providerReference: true,
  merchantReference: true,
  note: true,
  reportedAt: true,
  verificationPendingAt: true,
  verifiedAt: true,
  rejectedAt: true,
  failedAt: true,
  reversedAt: true,
  refundedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const attemptSelect = {
  id: true,
  merchantId: true,
  paymentTransactionId: true,
  provider: true,
  status: true,
  providerReferenceSnapshot: true,
  payerPhoneSnapshot: true,
  amountSnapshot: true,
  currencySnapshot: true,
  providerTransactionId: true,
  providerStatusCode: true,
  providerStatusText: true,
  failureCode: true,
  failureMessage: true,
  requestedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function providerForMethod(method: string): PaymentProvider {
  if (method === 'MTN_MOMO' || method === 'AIRTEL_MONEY') return method;
  throw new ProviderVerificationNotApplicableError();
}

function adapterInput(attempt: PaymentVerificationAttemptRecord) {
  if (attempt.providerReferenceSnapshot === null) {
    throw new ProviderReferenceRequiredError();
  }
  return {
    provider: attempt.provider,
    paymentTransactionId: attempt.paymentTransactionId,
    providerReference: attempt.providerReferenceSnapshot,
    payerPhone: attempt.payerPhoneSnapshot,
    amount: attempt.amountSnapshot,
    currency: attempt.currencySnapshot,
  } as const;
}

@Injectable()
export class PrismaProviderVerificationStore implements ProviderVerificationStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async begin(
    merchantId: string,
    orderId: string,
    paymentId: string,
    command: BeginProviderVerificationCommand,
  ): Promise<BegunProviderVerification | null> {
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const locked = await transaction.$queryRaw<readonly { id: string }[]>`
          SELECT "id" FROM "payment_transactions"
          WHERE "merchant_id" = ${merchantId}::uuid
            AND "order_id" = ${orderId}::uuid
            AND "id" = ${paymentId}::uuid
          FOR UPDATE`;
        if (locked.length === 0) return null;
        const payment = await transaction.paymentTransaction.findUniqueOrThrow({
          where: { id: paymentId },
          select: paymentSelect,
        });
        const provider = providerForMethod(payment.method);
        if (payment.providerReference === null) {
          throw new ProviderReferenceRequiredError();
        }
        if (payment.payerPhone === null) {
          throw new ProviderVerificationNotApplicableError();
        }
        const input = {
          provider,
          paymentTransactionId: payment.id,
          providerReference: payment.providerReference,
          payerPhone: payment.payerPhone,
          amount: payment.amount,
          currency: payment.currency,
        } as const;
        const requestHash = providerVerificationRequestHash(input);
        const replay = await transaction.paymentVerificationAttempt.findUnique({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: { ...attemptSelect, requestHash: true },
        });
        if (replay !== null) {
          if (
            replay.paymentTransactionId !== paymentId ||
            replay.requestHash !== requestHash
          ) {
            throw new ProviderVerificationIdempotencyConflictError();
          }
          return {
            isNew: false,
            payment,
            attempt: replay,
            adapterInput: adapterInput(replay),
          };
        }
        if (
          payment.status !== 'REPORTED' &&
          payment.status !== 'VERIFICATION_PENDING'
        ) {
          throw new ProviderVerificationStateConflictError();
        }
        const attempt = await transaction.paymentVerificationAttempt.create({
          data: {
            merchantId,
            paymentTransactionId: paymentId,
            provider,
            providerReferenceSnapshot: payment.providerReference,
            payerPhoneSnapshot: payment.payerPhone,
            amountSnapshot: payment.amount,
            currencySnapshot: payment.currency,
            requestedAt: command.now,
            idempotencyKey: command.idempotencyKey,
            requestHash,
          },
          select: attemptSelect,
        });
        return { isNew: true, payment, attempt, adapterInput: input };
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      const [payment, replay] = await Promise.all([
        this.database.client.paymentTransaction.findFirst({
          where: { merchantId, orderId, id: paymentId },
          select: paymentSelect,
        }),
        this.database.client.paymentVerificationAttempt.findUnique({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: { ...attemptSelect, requestHash: true },
        }),
      ]);
      if (payment === null || replay === null) {
        throw new ProviderVerificationIdempotencyConflictError();
      }
      const provider = providerForMethod(payment.method);
      if (payment.providerReference === null) {
        throw new ProviderReferenceRequiredError();
      }
      if (payment.payerPhone === null) {
        throw new ProviderVerificationNotApplicableError();
      }
      const currentInput = {
        provider,
        paymentTransactionId: payment.id,
        providerReference: payment.providerReference,
        payerPhone: payment.payerPhone,
        amount: payment.amount,
        currency: payment.currency,
      } as const;
      if (
        replay.paymentTransactionId !== paymentId ||
        replay.requestHash !== providerVerificationRequestHash(currentInput)
      ) {
        throw new ProviderVerificationIdempotencyConflictError();
      }
      return {
        isNew: false,
        payment,
        attempt: replay,
        adapterInput: adapterInput(replay),
      };
    }
  }

  public complete(
    merchantId: string,
    orderId: string,
    paymentId: string,
    attemptId: string,
    command: CompleteProviderVerificationCommand,
  ): Promise<CompletedProviderVerification | null> {
    return this.database.client.$transaction(async (transaction) => {
      const paymentLock = await transaction.$queryRaw<
        readonly { id: string }[]
      >`
        SELECT "id" FROM "payment_transactions"
        WHERE "merchant_id" = ${merchantId}::uuid
          AND "order_id" = ${orderId}::uuid
          AND "id" = ${paymentId}::uuid
        FOR UPDATE`;
      if (paymentLock.length === 0) return null;
      const attemptLock = await transaction.$queryRaw<
        readonly { id: string }[]
      >`
        SELECT "id" FROM "payment_verification_attempts"
        WHERE "merchant_id" = ${merchantId}::uuid
          AND "payment_transaction_id" = ${paymentId}::uuid
          AND "id" = ${attemptId}::uuid
        FOR UPDATE`;
      if (attemptLock.length === 0) return null;
      let payment = await transaction.paymentTransaction.findUniqueOrThrow({
        where: { id: paymentId },
        select: paymentSelect,
      });
      const currentAttempt =
        await transaction.paymentVerificationAttempt.findUniqueOrThrow({
          where: { id: attemptId },
          select: attemptSelect,
        });
      if (currentAttempt.status !== 'PENDING') {
        return { payment, attempt: currentAttempt };
      }
      const attempt = await transaction.paymentVerificationAttempt.update({
        where: { id: attemptId },
        data: {
          status: command.status,
          providerTransactionId: command.providerTransactionId,
          providerStatusCode: command.providerStatusCode,
          providerStatusText: command.providerStatusText,
          failureCode: command.failureCode,
          failureMessage: command.failureMessage,
          completedAt: command.now,
        },
        select: attemptSelect,
      });
      if (
        command.status === 'VERIFIED' &&
        (payment.status === 'REPORTED' ||
          payment.status === 'VERIFICATION_PENDING')
      ) {
        payment = await transaction.paymentTransaction.update({
          where: { id: paymentId },
          data: {
            status: 'VERIFIED',
            verificationSource: 'PROVIDER',
            verifiedAt: command.now,
          },
          select: paymentSelect,
        });
      }
      return { payment, attempt };
    });
  }

  public async list(
    merchantId: string,
    orderId: string,
    paymentId: string,
    query: VerificationAttemptListQuery,
  ): Promise<VerificationAttemptListResult | null> {
    return this.database.client.$transaction(async (transaction) => {
      const payment = await transaction.paymentTransaction.findFirst({
        where: { merchantId, orderId, id: paymentId },
        select: { id: true },
      });
      if (payment === null) return null;
      const where = {
        merchantId,
        paymentTransactionId: paymentId,
        ...(query.status === undefined ? {} : { status: query.status }),
      };
      const [rows, total] = await Promise.all([
        transaction.paymentVerificationAttempt.findMany({
          where,
          select: attemptSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        transaction.paymentVerificationAttempt.count({ where }),
      ]);
      return { rows, total };
    });
  }
}
