import { z } from 'zod';

const positiveInteger = z.coerce.number().int().min(1);

export const inventoryLedgerQuerySchema = z
  .object({
    type: z.enum(['RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']).optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(50),
  })
  .strict();

export type InventoryLedgerQuery = z.infer<typeof inventoryLedgerQuerySchema>;
