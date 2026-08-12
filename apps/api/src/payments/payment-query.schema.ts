import { z } from 'zod';

const positiveInteger = z.coerce.number().int().min(1);

export const paymentListQuerySchema = z
  .object({
    status: z
      .enum([
        'REPORTED',
        'VERIFICATION_PENDING',
        'VERIFIED',
        'REJECTED',
        'FAILED',
        'REVERSED',
        'REFUNDED',
      ])
      .optional(),
    method: z.enum(['CASH', 'MTN_MOMO', 'AIRTEL_MONEY']).optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(20),
  })
  .strict();

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
