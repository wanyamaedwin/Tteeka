import { z } from 'zod';

import { uuidV7Schema } from '../common/uuid-v7';

const MAX_BIGINT = 9_223_372_036_854_775_807n;

export const orderItemQuantitySchema = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .refine((value) => {
    if (!/^\d+$/.test(value)) return false;
    const quantity = BigInt(value);
    return quantity > 0n && quantity <= MAX_BIGINT;
  })
  .transform((value) => BigInt(value).toString());

const desiredOrderItemSchema = z
  .object({
    variantId: uuidV7Schema('variantId must be a UUIDv7 value'),
    quantity: orderItemQuantitySchema,
  })
  .strict();

export const replaceOrderItemsSchema = z
  .object({ items: z.array(desiredOrderItemSchema).max(100) })
  .strict()
  .superRefine(({ items }, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.variantId)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'variantId'],
          message: 'Duplicate variantId.',
        });
      }
      seen.add(item.variantId);
    }
  });

export type ReplaceOrderItemsInput = z.infer<typeof replaceOrderItemsSchema>;
