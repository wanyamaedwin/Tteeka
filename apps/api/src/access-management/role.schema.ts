import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';
import { isApplicationPermissionKey } from './application-permission-catalog';

const roleNameSchema = z.string().trim().min(1).max(80);
const roleDescriptionSchema = z.string().trim().min(1).max(320).nullable();

export const roleIdSchema = uuidV7Schema('roleId must be a UUIDv7 value');

export const createRoleSchema = z
  .object({
    name: roleNameSchema,
    description: roleDescriptionSchema.optional(),
  })
  .strict();

export const rolePatchSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: roleDescriptionSchema.optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Role field is required.',
  });

export const rolePermissionAssignmentSchema = z
  .object({
    permissionKeys: z
      .array(
        z
          .string()
          .max(120)
          .refine(
            isApplicationPermissionKey,
            'Unknown application Permission.',
          ),
      )
      .max(200)
      .transform((values) => [...new Set(values)]),
  })
  .strict();

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type RolePatch = z.infer<typeof rolePatchSchema>;
export type RolePermissionAssignment = z.infer<
  typeof rolePermissionAssignmentSchema
>;
