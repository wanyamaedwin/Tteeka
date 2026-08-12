import { createHash } from 'node:crypto';

import type { ReportPaymentInput } from './payment.schema';

export function paymentRequestHash(
  orderId: string,
  input: ReportPaymentInput,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        orderId,
        method: input.method,
        amount: input.amount,
        payerPhone: input.payerPhone,
        providerReference: input.providerReference,
        merchantReference: input.merchantReference,
        note: input.note,
      }),
    )
    .digest('hex');
}
