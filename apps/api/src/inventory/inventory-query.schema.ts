import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';

const positiveInteger = z.coerce.number().int().min(1);

export const inventoryListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    productId: uuidV7Schema('productId must be a UUIDv7 value').optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(50),
  })
  .strict();

export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;
