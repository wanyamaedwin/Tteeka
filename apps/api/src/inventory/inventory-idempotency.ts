import { createHash } from 'node:crypto';

import type { InventoryMovementInput } from './inventory-movement.schema';

export function inventoryRequestHash(
  variantId: string,
  command: InventoryMovementInput,
): string {
  const canonical = JSON.stringify({
    variantId,
    type: command.type,
    quantity: command.quantity,
    note: command.note,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
