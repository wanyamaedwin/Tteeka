import { z } from 'zod';

const positiveInteger = z.coerce.number().int().min(1);

export const stockHoldListQuerySchema = z
  .object({
    status: z.enum(['ACTIVE', 'RELEASED', 'EXPIRED']).optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(20),
  })
  .strict();

export type StockHoldListQuery = z.infer<typeof stockHoldListQuerySchema>;
