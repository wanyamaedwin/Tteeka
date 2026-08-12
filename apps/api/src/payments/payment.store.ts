import type { PaymentListQuery } from './payment-query.schema';
import type { ReportPaymentInput } from './payment.schema';

export const PAYMENT_STORE = Symbol('PAYMENT_STORE');

export type PaymentMethod = 'CASH' | 'MTN_MOMO' | 'AIRTEL_MONEY';
export type PaymentTransactionStatus =
  | 'REPORTED'
  | 'VERIFICATION_PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'FAILED'
  | 'REVERSED'
  | 'REFUNDED';

export interface PaymentTransactionRecord {
  readonly id: string;
  readonly merchantId: string;
  readonly orderId: string;
  readonly method: PaymentMethod;
  readonly status: PaymentTransactionStatus;
  readonly amount: bigint;
  readonly currency: string;
  readonly payerPhone: string | null;
  readonly providerReference: string | null;
  readonly merchantReference: string | null;
  readonly note: string | null;
  readonly reportedAt: Date;
  readonly verificationPendingAt: Date | null;
  readonly verifiedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly failedAt: Date | null;
  readonly reversedAt: Date | null;
  readonly refundedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ReportPaymentCommand extends ReportPaymentInput {
  readonly amountValue: bigint;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly now: Date;
}

export interface PaymentListResult {
  readonly rows: readonly PaymentTransactionRecord[];
  readonly total: number;
}

export interface PaymentSummaryRecord {
  readonly currency: string | null;
  readonly orderAmount: bigint;
  readonly verifiedAmount: bigint;
}

export type PaymentTransition =
  'VERIFICATION_PENDING' | 'VERIFIED' | 'REJECTED';

export interface PaymentStore {
  report(
    merchantId: string,
    orderId: string,
    command: ReportPaymentCommand,
  ): Promise<PaymentTransactionRecord | null>;
  list(
    merchantId: string,
    orderId: string,
    query: PaymentListQuery,
  ): Promise<PaymentListResult | null>;
  detail(
    merchantId: string,
    orderId: string,
    paymentId: string,
  ): Promise<PaymentTransactionRecord | null>;
  transition(
    merchantId: string,
    orderId: string,
    paymentId: string,
    target: PaymentTransition,
    now: Date,
  ): Promise<PaymentTransactionRecord | null>;
  summary(
    merchantId: string,
    orderId: string,
  ): Promise<PaymentSummaryRecord | null>;
}

export class PaymentIdempotencyConflictError extends Error {}
export class PaymentOrderIneligibleError extends Error {}
export class PaymentTransitionNotAllowedError extends Error {}
