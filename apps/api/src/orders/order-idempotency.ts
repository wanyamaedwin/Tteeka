import { createHash } from 'node:crypto';

import type { ConfirmOrderInput, CreateOrderInput } from './order.schema';

export function orderCreateRequestHash(input: CreateOrderInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        customerId: input.customerId,
        deliveryLocationId: input.deliveryLocationId,
      }),
    )
    .digest('hex');
}

export function orderConfirmationRequestHash(
  orderId: string,
  input: ConfirmOrderInput,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ orderId, expiresAt: input.expiresAt }))
    .digest('hex');
}
