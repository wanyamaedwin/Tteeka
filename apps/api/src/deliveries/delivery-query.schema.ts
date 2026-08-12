import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';
import {
  DELIVERY_ATTEMPT_RESULTS,
  DELIVERY_FAILURE_REASONS,
  DELIVERY_JOB_STATUSES,
} from './delivery.schema';

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

export const deliveryListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    orderId: uuidV7Schema('orderId must be a UUIDv7 value').optional(),
    status: z.enum(DELIVERY_JOB_STATUSES).optional(),
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

export const deliveryAttemptListQuerySchema = z
  .object({
    result: z.enum(DELIVERY_ATTEMPT_RESULTS).optional(),
    failureReason: z.enum(DELIVERY_FAILURE_REASONS).optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(20),
  })
  .strict();

export type DeliveryListQuery = z.infer<typeof deliveryListQuerySchema>;
export type DeliveryAttemptListQuery = z.infer<
  typeof deliveryAttemptListQuerySchema
>;
