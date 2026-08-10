import { z } from 'zod';

import { createProductVariantSchema } from './product-variant.schema';

const positiveInteger = z.coerce.number().int().min(1);
const skuSchema = createProductVariantSchema.shape.sku;
const barcodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/);

export const productVariantListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(50),
  })
  .strict();

export const productVariantLookupQuerySchema = z
  .object({
    sku: skuSchema.optional(),
    barcode: barcodeSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      Number(value.sku !== undefined) + Number(value.barcode !== undefined) ===
      1,
    {
      message: 'Exactly one of sku or barcode is required.',
    },
  );

export type ProductVariantListQuery = z.infer<
  typeof productVariantListQuerySchema
>;
export type ProductVariantLookupQuery = z.infer<
  typeof productVariantLookupQuerySchema
>;
