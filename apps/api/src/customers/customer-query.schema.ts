import { z } from 'zod';

import { ugandaPhoneSchema } from './customer.schema';

const positiveInteger = z.coerce.number().int().min(1);

export const customerListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    phone: ugandaPhoneSchema.optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(20),
  })
  .strict();

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
