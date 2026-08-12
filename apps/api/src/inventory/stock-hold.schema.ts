import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';
import { inventoryQuantitySchema } from './inventory-movement.schema';

const timezoneAwareDateTime = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) && !Number.isNaN(Date.parse(value)),
  )
  .transform((value) => new Date(value).toISOString());

export const holdIdSchema = uuidV7Schema('holdId must be a UUIDv7 value');

export const createStockHoldSchema = z
  .object({
    quantity: inventoryQuantitySchema,
    expiresAt: timezoneAwareDateTime,
  })
  .strict();

export const updateStockHoldExpirySchema = z
  .object({ expiresAt: timezoneAwareDateTime })
  .strict();

export type CreateStockHoldInput = z.infer<typeof createStockHoldSchema>;
export type UpdateStockHoldExpiryInput = z.infer<
  typeof updateStockHoldExpirySchema
>;
