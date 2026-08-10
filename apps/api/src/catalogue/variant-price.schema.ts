import { z } from 'zod';

const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;
const INTEGER_MONEY_PATTERN = /^(0|[1-9][0-9]*)$/;
const integerMoneySchema = z
  .string()
  .trim()
  .regex(INTEGER_MONEY_PATTERN)
  .refine(
    (value) =>
      !INTEGER_MONEY_PATTERN.test(value) ||
      BigInt(value) <= POSTGRES_BIGINT_MAX,
    {
      message: 'Money exceeds the PostgreSQL BIGINT maximum.',
    },
  );

export const setVariantPriceSchema = z
  .object({
    sellingPrice: integerMoneySchema.refine(
      (value) => !INTEGER_MONEY_PATTERN.test(value) || BigInt(value) > 0n,
      { message: 'sellingPrice must be greater than zero.' },
    ),
    costPrice: integerMoneySchema.nullable().optional(),
  })
  .strict();

const positiveInteger = z.coerce.number().int().min(1);

export const variantPriceHistoryQuerySchema = z
  .object({
    page: positiveInteger.default(1),
    pageSize: positiveInteger.max(100).default(50),
  })
  .strict();

export type SetVariantPriceInput = z.infer<typeof setVariantPriceSchema>;
export type VariantPriceHistoryQuery = z.infer<
  typeof variantPriceHistoryQuerySchema
>;
