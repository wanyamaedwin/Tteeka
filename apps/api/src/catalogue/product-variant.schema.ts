import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';

const skuSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Z0-9][A-Z0-9._-]*$/),
  );

const barcodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/)
  .nullable();

const variantMetadataSchema = z.string().trim().min(1).max(80).nullable();

export const variantIdSchema = uuidV7Schema('variantId must be a UUIDv7 value');

export const createProductVariantSchema = z
  .object({
    sku: skuSchema,
    barcode: barcodeSchema.optional(),
    size: variantMetadataSchema.optional(),
    colour: variantMetadataSchema.optional(),
  })
  .strict();

export const productVariantPatchSchema = z
  .object({
    sku: skuSchema.optional(),
    barcode: barcodeSchema.optional(),
    size: variantMetadataSchema.optional(),
    colour: variantMetadataSchema.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Product Variant field is required.',
  });

export type CreateProductVariantInput = z.infer<
  typeof createProductVariantSchema
>;
export type ProductVariantPatch = z.infer<typeof productVariantPatchSchema>;
