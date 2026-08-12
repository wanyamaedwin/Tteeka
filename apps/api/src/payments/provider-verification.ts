export type PaymentProvider = 'MTN_MOMO' | 'AIRTEL_MONEY';

export interface ProviderVerificationInput {
  readonly provider: PaymentProvider;
  readonly paymentTransactionId: string;
  readonly providerReference: string;
  readonly payerPhone: string;
  readonly amount: bigint;
  readonly currency: string;
}

interface ProviderEvidence {
  readonly providerTransactionId?: string | null;
  readonly providerStatusCode?: string | null;
  readonly providerStatusText?: string | null;
}

export interface ProviderVerifiedResult extends ProviderEvidence {
  readonly outcome: 'VERIFIED';
  readonly provider: PaymentProvider;
  readonly amount: bigint;
  readonly currency: string;
  readonly payerPhone?: string | null;
  readonly providerReference?: string | null;
}

export interface ProviderNotVerifiedResult extends ProviderEvidence {
  readonly outcome: 'NOT_VERIFIED';
}

export interface ProviderFailedResult extends ProviderEvidence {
  readonly outcome: 'FAILED';
  readonly failureCode: string;
  readonly failureMessage?: string | null;
}

export type ProviderVerificationResult =
  ProviderVerifiedResult | ProviderNotVerifiedResult | ProviderFailedResult;

export interface ProviderVerificationAdapter {
  verifyPayment(
    input: ProviderVerificationInput,
  ): Promise<ProviderVerificationResult>;
}

export const PROVIDER_VERIFICATION_REGISTRY = Symbol(
  'PROVIDER_VERIFICATION_REGISTRY',
);

export interface ProviderVerificationRegistry {
  resolve(provider: PaymentProvider): ProviderVerificationAdapter | null;
}

export class EmptyProviderVerificationRegistry implements ProviderVerificationRegistry {
  public resolve(provider: PaymentProvider): null {
    void provider;
    return null;
  }
}
