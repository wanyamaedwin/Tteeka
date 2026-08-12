import { createHash } from 'node:crypto';

import type { CreateOrderInput } from './order.schema';

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
