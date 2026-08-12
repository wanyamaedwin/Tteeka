import { z } from 'zod';

import { normalizeUgandaPhone } from '../common/uganda-phone';
import { uuidV7Schema } from '../common/uuid-v7';

export const customerIdSchema = uuidV7Schema(
  'customerId must be a UUIDv7 value',
);

export const ugandaPhoneSchema = z.string().transform((value, context) => {
  const normalized = normalizeUgandaPhone(value);
  if (normalized === null) {
    context.addIssue({ code: 'custom', message: 'Invalid Uganda phone.' });
    return z.NEVER;
  }
  return normalized;
});

const customerNameSchema = z.string().trim().min(1).max(160).nullable();

export const createCustomerSchema = z
  .object({
    phone: ugandaPhoneSchema,
    name: customerNameSchema.optional(),
  })
  .strict();

export const customerPatchSchema = z
  .object({
    phone: ugandaPhoneSchema.optional(),
    name: customerNameSchema.optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Customer field is required.',
  });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CustomerPatch = z.infer<typeof customerPatchSchema>;
