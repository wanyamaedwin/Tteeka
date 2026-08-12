import { z } from 'zod';

const positiveInteger = z.coerce.number().int().min(1);

export const providerVerificationBodySchema = z.union([
  z.undefined(),
  z.object({}).strict(),
]);

export const verificationAttemptListQuerySchema = z
  .object({
    status: z
      .enum(['PENDING', 'VERIFIED', 'NOT_VERIFIED', 'FAILED'])
      .optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(20),
  })
  .strict();

export type VerificationAttemptListQuery = z.infer<
  typeof verificationAttemptListQuerySchema
>;
