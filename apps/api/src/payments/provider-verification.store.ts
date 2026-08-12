import type { VerificationAttemptListQuery } from './provider-verification.schema';
import type {
  PaymentProvider,
  ProviderVerificationInput,
} from './provider-verification';
import type { PaymentTransactionRecord } from './payment.store';

export const PROVIDER_VERIFICATION_STORE = Symbol(
  'PROVIDER_VERIFICATION_STORE',
);

export type PaymentVerificationAttemptStatus =
  'PENDING' | 'VERIFIED' | 'NOT_VERIFIED' | 'FAILED';

export interface PaymentVerificationAttemptRecord {
  readonly id: string;
  readonly merchantId: string;
  readonly paymentTransactionId: string;
  readonly provider: PaymentProvider;
  readonly status: PaymentVerificationAttemptStatus;
  readonly providerReferenceSnapshot: string | null;
  readonly payerPhoneSnapshot: string;
  readonly amountSnapshot: bigint;
  readonly currencySnapshot: string;
  readonly providerTransactionId: string | null;
  readonly providerStatusCode: string | null;
  readonly providerStatusText: string | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly requestedAt: Date;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BeginProviderVerificationCommand {
  readonly idempotencyKey: string;
  readonly now: Date;
}

export interface BegunProviderVerification {
  readonly isNew: boolean;
  readonly payment: PaymentTransactionRecord;
  readonly attempt: PaymentVerificationAttemptRecord;
  readonly adapterInput: ProviderVerificationInput;
}

export interface CompleteProviderVerificationCommand {
  readonly status: Exclude<PaymentVerificationAttemptStatus, 'PENDING'>;
  readonly providerTransactionId: string | null;
  readonly providerStatusCode: string | null;
  readonly providerStatusText: string | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly now: Date;
}

export interface CompletedProviderVerification {
  readonly payment: PaymentTransactionRecord;
  readonly attempt: PaymentVerificationAttemptRecord;
}

export interface VerificationAttemptListResult {
  readonly rows: readonly PaymentVerificationAttemptRecord[];
  readonly total: number;
}

export interface ProviderVerificationStore {
  begin(
    merchantId: string,
    orderId: string,
    paymentId: string,
    command: BeginProviderVerificationCommand,
  ): Promise<BegunProviderVerification | null>;
  complete(
    merchantId: string,
    orderId: string,
    paymentId: string,
    attemptId: string,
    command: CompleteProviderVerificationCommand,
  ): Promise<CompletedProviderVerification | null>;
  list(
    merchantId: string,
    orderId: string,
    paymentId: string,
    query: VerificationAttemptListQuery,
  ): Promise<VerificationAttemptListResult | null>;
}

export class ProviderVerificationIdempotencyConflictError extends Error {}
export class ProviderVerificationNotApplicableError extends Error {}
export class ProviderReferenceRequiredError extends Error {}
export class ProviderVerificationStateConflictError extends Error {}
