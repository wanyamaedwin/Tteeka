import { createHash } from 'node:crypto';

import type { CreateStockHoldInput } from './stock-hold.schema';

export function stockHoldRequestHash(
  variantId: string,
  input: CreateStockHoldInput,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        variantId,
        quantity: input.quantity,
        expiresAt: input.expiresAt,
      }),
    )
    .digest('hex');
}
