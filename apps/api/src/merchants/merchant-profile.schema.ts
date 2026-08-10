import { z } from 'zod';

import { normalizeUgandaPhone } from '../common/uganda-phone';

const nullableLegalNameSchema = z.string().trim().min(1).max(200).nullable();

const nullablePhoneSchema = z
  .string()
  .max(64)
  .transform((value, context) => {
    const normalized = normalizeUgandaPhone(value);
    if (normalized === null) {
      context.addIssue({ code: 'custom', message: 'Invalid Uganda phone.' });
      return z.NEVER;
    }
    return normalized;
  })
  .nullable();

const nullableEmailSchema = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .email()
  .transform((value) => value.toLowerCase())
  .nullable();

export const merchantProfilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160).optional(),
    legalName: nullableLegalNameSchema.optional(),
    phone: nullablePhoneSchema.optional(),
    email: nullableEmailSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one profile field is required.',
  });

export type MerchantProfilePatch = z.infer<typeof merchantProfilePatchSchema>;
