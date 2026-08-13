import { z } from 'zod';

export const idempotencyKeySchema = z.string().regex(/^[!-~]{1,128}$/);

const boundedTrimmed = (maximum: number) =>
  z.string().trim().min(1).max(maximum);

export const registrationRequestSchema = z
  .object({
    name: boundedTrimmed(160),
    phone: z.string().min(1).max(64),
    password: z.string().min(8).max(1024),
    businessName: boundedTrimmed(160),
  })
  .strict();

export const workspaceRequestSchema = z
  .object({ businessName: boundedTrimmed(160) })
  .strict();

export type RegistrationRequest = z.infer<typeof registrationRequestSchema>;
export type WorkspaceRequest = z.infer<typeof workspaceRequestSchema>;
