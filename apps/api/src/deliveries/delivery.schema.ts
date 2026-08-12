import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';

export const DELIVERY_JOB_STATUSES = [
  'PENDING',
  'READY',
  'DISPATCHED',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;

export const DELIVERY_ATTEMPT_RESULTS = ['DELIVERED', 'FAILED'] as const;

export const DELIVERY_FAILURE_REASONS = [
  'CUSTOMER_UNREACHABLE',
  'CUSTOMER_UNAVAILABLE',
  'CUSTOMER_REFUSED',
  'WRONG_LOCATION',
  'ADDRESS_NOT_FOUND',
  'VEHICLE_OR_RIDER_ISSUE',
  'WEATHER_OR_ACCESS_ISSUE',
  'OTHER',
] as const;

export const deliveryIdSchema = uuidV7Schema(
  'deliveryId must be a UUIDv7 value',
);
export const deliveryOrderIdSchema = uuidV7Schema(
  'orderId must be a UUIDv7 value',
);
export const deliveryIdempotencyKeySchema = z.string().regex(/^[!-~]{1,128}$/);

export const createDeliverySchema = z
  .object({ orderId: deliveryOrderIdSchema })
  .strict();

const attemptNoteSchema = z
  .preprocess(
    (value) =>
      typeof value === 'string' && value.trim().length === 0 ? null : value,
    z.string().trim().min(1).max(500).nullable().optional(),
  )
  .transform((value) => value ?? null);

const deliveredAttemptSchema = z
  .object({
    result: z.literal('DELIVERED'),
    failureReason: z.null().optional(),
    note: attemptNoteSchema,
  })
  .strict()
  .transform((value) => ({
    result: value.result,
    failureReason: null,
    note: value.note,
  }));

const failedAttemptSchema = z
  .object({
    result: z.literal('FAILED'),
    failureReason: z.enum(DELIVERY_FAILURE_REASONS),
    note: attemptNoteSchema,
  })
  .strict();

export const recordDeliveryAttemptSchema = z.union([
  deliveredAttemptSchema,
  failedAttemptSchema,
]);

export type CreateDeliveryInput = z.infer<typeof createDeliverySchema>;
export type RecordDeliveryAttemptInput = z.infer<
  typeof recordDeliveryAttemptSchema
>;
