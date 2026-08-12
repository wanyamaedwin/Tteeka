import { createHash } from 'node:crypto';

import type {
  PaymentProvider,
  ProviderVerificationInput,
} from './provider-verification';

export interface ProviderVerificationSnapshot extends Omit<
  ProviderVerificationInput,
  'providerReference'
> {
  readonly provider: PaymentProvider;
  readonly providerReference: string;
}

export function providerVerificationRequestHash(
  snapshot: ProviderVerificationSnapshot,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        paymentTransactionId: snapshot.paymentTransactionId,
        provider: snapshot.provider,
        providerReference: snapshot.providerReference,
        payerPhone: snapshot.payerPhone,
        amount: snapshot.amount.toString(),
        currency: snapshot.currency,
      }),
    )
    .digest('hex');
}
