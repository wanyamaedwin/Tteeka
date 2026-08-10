import { z } from 'zod';

import { normalizeUgandaPhone } from '../common/uganda-phone';
import { uuidV7Schema } from '../common/uuid-v7';

export const membershipIdSchema = uuidV7Schema(
  'membershipId must be a UUIDv7 value',
);

export const addStaffSchema = z
  .object({
    phone: z
      .string()
      .max(64)
      .transform((value, context) => {
        const normalized = normalizeUgandaPhone(value);
        if (normalized === null) {
          context.addIssue({
            code: 'custom',
            message: 'Invalid Uganda phone.',
          });
          return z.NEVER;
        }
        return normalized;
      }),
  })
  .strict();

export const membershipPatchSchema = z
  .object({ status: z.enum(['ACTIVE', 'DISABLED']).optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Membership field is required.',
  });

export const membershipRoleAssignmentSchema = z
  .object({
    roleIds: z
      .array(uuidV7Schema('roleId must be a UUIDv7 value'))
      .max(50)
      .transform((values) => [...new Set(values)]),
  })
  .strict();

export type AddStaffInput = z.infer<typeof addStaffSchema>;
export type MembershipPatch = z.infer<typeof membershipPatchSchema>;
export type MembershipRoleAssignment = z.infer<
  typeof membershipRoleAssignmentSchema
>;
