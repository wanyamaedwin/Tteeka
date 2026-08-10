import { z } from 'zod';

const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value, context) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: value,
      }).resolvedOptions().timeZone;
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid IANA timezone.' });
      return z.NEVER;
    }
  });

export const merchantSettingsPatchSchema = z
  .object({
    currency: currencySchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one settings field is required.',
  });

export type MerchantSettingsPatch = z.infer<typeof merchantSettingsPatchSchema>;
