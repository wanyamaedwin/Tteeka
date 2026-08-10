import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';

const productNameSchema = z.string().trim().min(1).max(160);
const descriptionSchema = z.string().trim().min(1).max(2000).nullable();
const metadataSchema = z.string().trim().min(1).max(120).nullable();

export const productIdSchema = uuidV7Schema('productId must be a UUIDv7 value');

export const createProductSchema = z
  .object({
    name: productNameSchema,
    description: descriptionSchema.optional(),
    category: metadataSchema.optional(),
    brand: metadataSchema.optional(),
  })
  .strict();

export const productPatchSchema = z
  .object({
    name: productNameSchema.optional(),
    description: descriptionSchema.optional(),
    category: metadataSchema.optional(),
    brand: metadataSchema.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Product field is required.',
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type ProductPatch = z.infer<typeof productPatchSchema>;
