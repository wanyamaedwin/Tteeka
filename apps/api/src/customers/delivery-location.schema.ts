import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';
import { ugandaPhoneSchema } from './customer.schema';

export const deliveryLocationIdSchema = uuidV7Schema(
  'locationId must be a UUIDv7 value',
);

const areaSchema = z.string().trim().min(1).max(120);
const landmarkSchema = z.string().trim().min(1).max(240);
const instructionsSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().min(1).max(500).nullable(),
);
const mapPinUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine(
      (value) => {
        try {
          return ['http:', 'https:'].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      },
      { message: 'Map pin URL must use HTTP or HTTPS.' },
    )
    .nullable(),
);

export const createDeliveryLocationSchema = z
  .object({
    area: areaSchema,
    landmark: landmarkSchema,
    phone: ugandaPhoneSchema,
    instructions: instructionsSchema.optional(),
    mapPinUrl: mapPinUrlSchema.optional(),
  })
  .strict();

export const deliveryLocationPatchSchema = z
  .object({
    area: areaSchema.optional(),
    landmark: landmarkSchema.optional(),
    phone: ugandaPhoneSchema.optional(),
    instructions: instructionsSchema.optional(),
    mapPinUrl: mapPinUrlSchema.optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one DeliveryLocation field is required.',
  });

export type CreateDeliveryLocationInput = z.infer<
  typeof createDeliveryLocationSchema
>;
export type DeliveryLocationPatch = z.infer<typeof deliveryLocationPatchSchema>;
