import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type { PaymentListQuery } from './payment-query.schema';
import {
  PaymentIdempotencyConflictError,
  PaymentOrderIneligibleError,
  PaymentTransitionNotAllowedError,
  type PaymentListResult,
  type PaymentStore,
  type PaymentSummaryRecord,
  type PaymentTransactionRecord,
  type PaymentTransition,
  type ReportPaymentCommand,
} from './payment.store';

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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Injectable()
export class PrismaPaymentStore implements PaymentStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async report(
    merchantId: string,
    orderId: string,
    command: ReportPaymentCommand,
  ): Promise<PaymentTransactionRecord | null> {
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const locked = await transaction.$queryRaw<readonly { id: string }[]>`
          SELECT "id" FROM "orders"
          WHERE "merchant_id" = ${merchantId}::uuid AND "id" = ${orderId}::uuid
          FOR UPDATE`;
        if (locked.length === 0) return null;
        const order = await transaction.order.findUniqueOrThrow({
          where: { merchantId_id: { merchantId, id: orderId } },
          select: { status: true, currency: true },
        });
        if (
          !['DRAFT', 'CONFIRMED'].includes(order.status) ||
          order.currency === null
        ) {
          throw new PaymentOrderIneligibleError();
        }
        const replay = await transaction.paymentTransaction.findUnique({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: { ...paymentSelect, requestHash: true },
        });
        if (replay !== null) {
          if (
            replay.orderId !== orderId ||
            replay.requestHash !== command.requestHash
          ) {
            throw new PaymentIdempotencyConflictError();
          }
          return replay;
        }
        return transaction.paymentTransaction.create({
          data: {
            merchantId,
            orderId,
            method: command.method,
            amount: command.amountValue,
            currency: order.currency,
            payerPhone: command.payerPhone,
            providerReference: command.providerReference,
            merchantReference: command.merchantReference,
            note: command.note,
            reportedAt: command.now,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
          },
          select: paymentSelect,
        });
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      const replay = await this.database.client.paymentTransaction.findUnique({
        where: {
          merchantId_idempotencyKey: {
            merchantId,
            idempotencyKey: command.idempotencyKey,
          },
        },
        select: { ...paymentSelect, requestHash: true },
      });
      if (
        replay !== null &&
        replay.orderId === orderId &&
        replay.requestHash === command.requestHash
      ) {
        return replay;
      }
      throw new PaymentIdempotencyConflictError();
    }
  }

  public async list(
    merchantId: string,
    orderId: string,
    query: PaymentListQuery,
  ): Promise<PaymentListResult | null> {
    return this.database.client.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { merchantId_id: { merchantId, id: orderId } },
        select: { id: true },
      });
      if (order === null) return null;
      const where = {
        merchantId,
        orderId,
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.method === undefined ? {} : { method: query.method }),
      };
      const [rows, total] = await Promise.all([
        transaction.paymentTransaction.findMany({
          where,
          select: paymentSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        transaction.paymentTransaction.count({ where }),
      ]);
      return { rows, total };
    });
  }

  public detail(
    merchantId: string,
    orderId: string,
    paymentId: string,
  ): Promise<PaymentTransactionRecord | null> {
    return this.database.client.paymentTransaction.findFirst({
      where: { merchantId, orderId, id: paymentId },
      select: paymentSelect,
    });
  }

  public transition(
    merchantId: string,
    orderId: string,
    paymentId: string,
    target: PaymentTransition,
    now: Date,
  ): Promise<PaymentTransactionRecord | null> {
    return this.database.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<readonly { id: string }[]>`
        SELECT "id" FROM "payment_transactions"
        WHERE "merchant_id" = ${merchantId}::uuid
          AND "order_id" = ${orderId}::uuid
          AND "id" = ${paymentId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) return null;
      const current = await transaction.paymentTransaction.findUniqueOrThrow({
        where: { id: paymentId },
        select: paymentSelect,
      });
      if (current.status === target) return current;
      if (target === 'VERIFICATION_PENDING') {
        if (current.status !== 'REPORTED' || current.method === 'CASH') {
          throw new PaymentTransitionNotAllowedError();
        }
        return transaction.paymentTransaction.update({
          where: { id: paymentId },
          data: { status: target, verificationPendingAt: now },
          select: paymentSelect,
        });
      }
      if (target === 'VERIFIED') {
        if (
          current.status !== 'REPORTED' &&
          current.status !== 'VERIFICATION_PENDING'
        ) {
          throw new PaymentTransitionNotAllowedError();
        }
        return transaction.paymentTransaction.update({
          where: { id: paymentId },
          data: {
            status: target,
            verificationSource: 'MANUAL',
            verifiedAt: now,
          },
          select: paymentSelect,
        });
      }
      if (
        current.status !== 'REPORTED' &&
        current.status !== 'VERIFICATION_PENDING'
      ) {
        throw new PaymentTransitionNotAllowedError();
      }
      return transaction.paymentTransaction.update({
        where: { id: paymentId },
        data: { status: target, rejectedAt: now },
        select: paymentSelect,
      });
    });
  }

  public async summary(
    merchantId: string,
    orderId: string,
  ): Promise<PaymentSummaryRecord | null> {
    return this.database.client.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { merchantId_id: { merchantId, id: orderId } },
        select: { currency: true, subtotal: true },
      });
      if (order === null) return null;
      const verified = await transaction.paymentTransaction.aggregate({
        where: { merchantId, orderId, status: 'VERIFIED' },
        _sum: { amount: true },
      });
      return {
        currency: order.currency,
        orderAmount: order.subtotal,
        verifiedAmount: verified._sum.amount ?? 0n,
      };
    });
  }
}
