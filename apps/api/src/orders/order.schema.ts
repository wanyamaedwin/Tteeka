import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';

export const orderIdSchema = uuidV7Schema('orderId must be a UUIDv7 value');
export const orderCustomerIdSchema = uuidV7Schema(
  'customerId must be a UUIDv7 value',
);
export const orderDeliveryLocationIdSchema = uuidV7Schema(
  'deliveryLocationId must be a UUIDv7 value',
);

export const createOrderSchema = z
  .object({
    customerId: orderCustomerIdSchema,
    deliveryLocationId: orderDeliveryLocationIdSchema.nullable().optional(),
  })
  .strict()
  .transform((value) => ({
    customerId: value.customerId,
    deliveryLocationId: value.deliveryLocationId ?? null,
  }));

export const orderPatchSchema = z
  .object({
    customerId: orderCustomerIdSchema.optional(),
    deliveryLocationId: orderDeliveryLocationIdSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Order field is required.',
  });

export const orderIdempotencyKeySchema = z.string().regex(/^[!-~]{1,128}$/);

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderPatchInput = z.infer<typeof orderPatchSchema>;
