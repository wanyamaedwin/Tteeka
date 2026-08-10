import { z } from 'zod';

const MAX_BIGINT = 9_223_372_036_854_775_807n;

export const inventoryQuantitySchema = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .refine((value) => {
    if (!/^\d+$/.test(value)) return false;
    const quantity = BigInt(value);
    return quantity > 0n && quantity <= MAX_BIGINT;
  })
  .transform((value) => BigInt(value).toString());

const noteSchema = z.string().trim().min(1).max(500).nullable();

export const inventoryMovementSchema = z
  .object({
    type: z.enum(['RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
    quantity: inventoryQuantitySchema,
    note: noteSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type !== 'RECEIPT' && value.note == null) {
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'A note is required for manual adjustments.',
      });
    }
  })
  .transform((value) => ({ ...value, note: value.note ?? null }));

export const idempotencyKeySchema = z.string().regex(/^[!-~]{1,128}$/);

export type InventoryMovementInput = z.infer<typeof inventoryMovementSchema>;
