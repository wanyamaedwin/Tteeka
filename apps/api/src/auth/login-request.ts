import { z } from 'zod';

export const loginRequestSchema = z
  .object({
    phone: z.string().min(1).max(64),
    password: z.string().min(1).max(1024),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;
