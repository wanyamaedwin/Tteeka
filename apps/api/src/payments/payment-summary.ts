export type DerivedPaymentStatus =
  'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID' | 'REFUNDED';

export function derivePaymentSummary(
  orderAmount: bigint,
  verifiedAmount: bigint,
): {
  status: Exclude<DerivedPaymentStatus, 'REFUNDED'>;
  amountDue: bigint;
  overpaidAmount: bigint;
} {
  if (verifiedAmount === 0n) {
    return { status: 'UNPAID', amountDue: orderAmount, overpaidAmount: 0n };
  }
  if (verifiedAmount < orderAmount) {
    return {
      status: 'PARTIALLY_PAID',
      amountDue: orderAmount - verifiedAmount,
      overpaidAmount: 0n,
    };
  }
  if (verifiedAmount === orderAmount) {
    return { status: 'PAID', amountDue: 0n, overpaidAmount: 0n };
  }
  return {
    status: 'OVERPAID',
    amountDue: 0n,
    overpaidAmount: verifiedAmount - orderAmount,
  };
}
