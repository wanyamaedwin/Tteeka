import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';

const positiveInteger = z.coerce.number().int().min(1);
const timezoneAwareDateTime = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) && !Number.isNaN(Date.parse(value)),
  )
  .transform((value) => new Date(value));

export const orderListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    customerId: uuidV7Schema('customerId must be a UUIDv7 value').optional(),
    status: z
      .enum([
        'DRAFT',
        'CONFIRMED',
        'FULFILLED',
        'COMPLETED',
        'ABANDONED',
        'CANCELLED',
      ])
      .optional(),
    createdFrom: timezoneAwareDateTime.optional(),
    createdTo: timezoneAwareDateTime.optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(20),
  })
  .strict()
  .refine(
    ({ createdFrom, createdTo }) =>
      createdFrom === undefined ||
      createdTo === undefined ||
      createdFrom < createdTo,
    { message: 'createdFrom must be earlier than createdTo.' },
  );

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
