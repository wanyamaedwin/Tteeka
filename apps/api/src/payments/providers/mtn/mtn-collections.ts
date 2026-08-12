import { randomUUID } from 'node:crypto';

export const MTN_MOMO_SANDBOX_BASE_URL =
  'https://sandbox.momodeveloper.mtn.com';
export const MTN_MOMO_SANDBOX_TARGET_ENVIRONMENT = 'sandbox';
export const MTN_MOMO_SANDBOX_CURRENCY = 'EUR';

export type MtnCollectionsErrorCode =
  | 'AUTHENTICATION_FAILURE'
  | 'AUTHORIZATION_FAILURE'
  | 'DUPLICATE_REFERENCE'
  | 'NOT_FOUND'
  | 'INVALID_TARGET_ENVIRONMENT'
  | 'INVALID_CURRENCY'
  | 'PROVIDER_UNAVAILABLE'
  | 'BAD_REQUEST'
  | 'TIMEOUT'
  | 'CONNECTION_FAILURE'
  | 'UNEXPECTED_RESPONSE';

export interface MtnCollectionsFailure {
  readonly code: MtnCollectionsErrorCode;
  readonly message: string;
  readonly httpStatus: number | null;
  readonly providerCode: string | null;
}

export interface MtnRequestToPayInput {
  readonly referenceId: string;
  readonly amount: string;
  readonly payerMsisdn: string;
  readonly externalId: string;
  readonly payerMessage: string;
  readonly payeeNote: string;
}

export type MtnRequestToPaySubmissionResult =
  | Readonly<{ outcome: 'ACCEPTED'; referenceId: string }>
  | Readonly<{
      outcome: 'REJECTED';
      referenceId: string;
      error: MtnCollectionsFailure;
    }>
  | Readonly<{
      outcome: 'UNKNOWN';
      referenceId: string;
      error: MtnCollectionsFailure;
    }>;

interface MtnStatusEvidence {
  readonly referenceId: string;
  readonly providerStatus: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  readonly amount: string | null;
  readonly currency: string | null;
  readonly financialTransactionId: string | null;
  readonly externalId: string | null;
  readonly reasonCode: string | null;
  readonly reasonMessage: string | null;
}

export type MtnRequestToPayStatusResult =
  | Readonly<MtnStatusEvidence & { outcome: 'PENDING' }>
  | Readonly<MtnStatusEvidence & { outcome: 'SUCCESSFUL' }>
  | Readonly<MtnStatusEvidence & { outcome: 'FAILED' }>
  | Readonly<{
      outcome: 'NOT_FOUND';
      referenceId: string;
      error: MtnCollectionsFailure;
    }>
  | Readonly<{
      outcome: 'TECHNICAL_FAILURE';
      referenceId: string;
      error: MtnCollectionsFailure;
    }>;

export interface MtnAccessTokenResult {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresInSeconds: number;
}

export class MtnCollectionsClientError extends Error {
  public readonly code: MtnCollectionsErrorCode;
  public readonly httpStatus: number | null;
  public readonly providerCode: string | null;

  public constructor(failure: MtnCollectionsFailure) {
    super(failure.message);
    this.name = 'MtnCollectionsClientError';
    this.code = failure.code;
    this.httpStatus = failure.httpStatus;
    this.providerCode = failure.providerCode;
  }

  public toJSON(): MtnCollectionsFailure {
    return {
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      providerCode: this.providerCode,
    };
  }
}

export interface MtnCollectionsClient {
  getAccessToken(): Promise<MtnAccessTokenResult>;
  requestToPay(
    input: MtnRequestToPayInput,
  ): Promise<MtnRequestToPaySubmissionResult>;
  getRequestToPayStatus(
    referenceId: string,
  ): Promise<MtnRequestToPayStatusResult>;
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMtnReferenceId(value: string): boolean {
  return UUID_V4.test(value);
}

export function generateMtnReferenceId(): string {
  return randomUUID();
}
