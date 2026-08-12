import { z } from 'zod';

import { normalizeUgandaPhone } from '../common/uganda-phone';
import { uuidV7Schema } from '../common/uuid-v7';

const MAX_BIGINT = 9_223_372_036_854_775_807n;

const amountSchema = z
  .string()
  .regex(/^\d+$/)
  .refine((value) => {
    if (!/^\d+$/.test(value)) return false;
    const amount = BigInt(value);
    return amount > 0n && amount <= MAX_BIGINT;
  })
  .transform((value) => BigInt(value).toString());

function nullableTrimmed(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);
}

const rawReportPaymentSchema = z
  .object({
    method: z.enum(['CASH', 'MTN_MOMO', 'AIRTEL_MONEY']),
    amount: amountSchema,
    payerPhone: nullableTrimmed(40),
    providerReference: nullableTrimmed(160),
    merchantReference: nullableTrimmed(160),
    note: nullableTrimmed(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.method === 'CASH' && value.providerReference !== null) {
      context.addIssue({
        code: 'custom',
        path: ['providerReference'],
        message: 'Cash payments cannot have a provider reference.',
      });
    }
    const normalized =
      value.payerPhone === null ? null : normalizeUgandaPhone(value.payerPhone);
    if (value.payerPhone !== null && normalized === null) {
      context.addIssue({
        code: 'custom',
        path: ['payerPhone'],
        message: 'payerPhone must be a valid Uganda phone number.',
      });
    }
    if (value.method !== 'CASH' && normalized === null) {
      context.addIssue({
        code: 'custom',
        path: ['payerPhone'],
        message: 'Mobile Money payments require payerPhone.',
      });
    }
  });

export const reportPaymentSchema = rawReportPaymentSchema.transform(
  (value) => ({
    ...value,
    payerPhone:
      value.payerPhone === null ? null : normalizeUgandaPhone(value.payerPhone),
  }),
);

export const paymentIdSchema = uuidV7Schema('paymentId must be a UUIDv7 value');
export const paymentIdempotencyKeySchema = z.string().regex(/^[!-~]{1,128}$/);

export type ReportPaymentInput = z.infer<typeof reportPaymentSchema>;
