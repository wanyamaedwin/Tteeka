import { z } from 'zod';

const positiveInteger = z.coerce.number().int().min(1);

export const deliveryLocationListQuerySchema = z
  .object({
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(20),
  })
  .strict();

export type DeliveryLocationListQuery = z.infer<
  typeof deliveryLocationListQuerySchema
>;
