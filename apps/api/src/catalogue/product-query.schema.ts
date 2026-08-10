import { z } from 'zod';

const positiveInteger = z.coerce.number().int().min(1);

export const productListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    category: z.string().trim().min(1).max(120).optional(),
    brand: z.string().trim().min(1).max(120).optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(20),
  })
  .strict();

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
