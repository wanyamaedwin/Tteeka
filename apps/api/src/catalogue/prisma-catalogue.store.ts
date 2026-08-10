import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type {
  BarcodeAlreadyExistsError,
  CatalogueStore,
  ProductListResult,
  ProductRecord,
  ProductVariantListResult,
  ProductVariantRecord,
  SkuAlreadyExistsError,
  VariantPriceHistoryListResult,
} from './catalogue.store';
import {
  BarcodeAlreadyExistsError as BarcodeConflict,
  SkuAlreadyExistsError as SkuConflict,
} from './catalogue.store';
import type { ProductListQuery } from './product-query.schema';
import type { CreateProductInput, ProductPatch } from './product.schema';
import type {
  ProductVariantListQuery,
  ProductVariantLookupQuery,
} from './product-variant-query.schema';
import type {
  CreateProductVariantInput,
  ProductVariantPatch,
} from './product-variant.schema';
import type {
  SetVariantPriceInput,
  VariantPriceHistoryQuery,
} from './variant-price.schema';

const productSelect = {
  id: true,
  name: true,
  description: true,
  category: true,
  brand: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const productVariantSelect = {
  id: true,
  productId: true,
  sku: true,
  barcode: true,
  size: true,
  colour: true,
  status: true,
  sellingPrice: true,
  costPrice: true,
  priceCurrency: true,
  priceUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const priceHistorySelect = {
  id: true,
  sellingPrice: true,
  costPrice: true,
  currency: true,
  createdAt: true,
} as const;

function uniqueConstraintName(error: unknown): string | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 'P2002'
  ) {
    return null;
  }
  return 'meta' in error ? JSON.stringify(error.meta).toLowerCase() : '';
}

function mapVariantUniqueConflict(
  error: unknown,
): SkuAlreadyExistsError | BarcodeAlreadyExistsError | null {
  const constraint = uniqueConstraintName(error);
  if (constraint === null) return null;
  if (constraint.includes('barcode')) return new BarcodeConflict();
  if (constraint.includes('sku')) return new SkuConflict();
  return null;
}

@Injectable()
export class PrismaCatalogueStore implements CatalogueStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public createProduct(
    merchantId: string,
    input: CreateProductInput,
  ): Promise<ProductRecord> {
    return this.database.client.product.create({
      data: {
        merchantId,
        name: input.name,
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.category === undefined ? {} : { category: input.category }),
        ...(input.brand === undefined ? {} : { brand: input.brand }),
      },
      select: productSelect,
    });
  }

  public async listProducts(
    merchantId: string,
    query: ProductListQuery,
  ): Promise<ProductListResult> {
    const where = {
      merchantId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.category === undefined
        ? {}
        : {
            category: { equals: query.category, mode: 'insensitive' as const },
          }),
      ...(query.brand === undefined
        ? {}
        : { brand: { equals: query.brand, mode: 'insensitive' as const } }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              {
                description: {
                  contains: query.q,
                  mode: 'insensitive' as const,
                },
              },
              { category: { contains: query.q, mode: 'insensitive' as const } },
              { brand: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }),
    };
    const [total, rows] = await this.database.client.$transaction([
      this.database.client.product.count({ where }),
      this.database.client.product.findMany({
        where,
        select: productSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows, total };
  }

  public findProduct(
    merchantId: string,
    productId: string,
  ): Promise<ProductRecord | null> {
    return this.database.client.product.findFirst({
      where: { merchantId, id: productId },
      select: productSelect,
    });
  }

  public async updateProduct(
    merchantId: string,
    productId: string,
    patch: ProductPatch,
  ): Promise<ProductRecord | null> {
    const result = await this.database.client.product.updateMany({
      where: { merchantId, id: productId },
      data: {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.description === undefined
          ? {}
          : { description: patch.description }),
        ...(patch.category === undefined ? {} : { category: patch.category }),
        ...(patch.brand === undefined ? {} : { brand: patch.brand }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
      },
    });
    if (result.count === 0) return null;
    return this.findProduct(merchantId, productId);
  }

  public async createVariant(
    merchantId: string,
    productId: string,
    input: CreateProductVariantInput,
  ): Promise<ProductVariantRecord | null> {
    const product = await this.database.client.product.findUnique({
      where: { merchantId_id: { merchantId, id: productId } },
      select: { id: true },
    });
    if (product === null) return null;
    try {
      return await this.database.client.productVariant.create({
        data: {
          merchantId,
          productId,
          sku: input.sku,
          ...(input.barcode === undefined ? {} : { barcode: input.barcode }),
          ...(input.size === undefined ? {} : { size: input.size }),
          ...(input.colour === undefined ? {} : { colour: input.colour }),
        },
        select: productVariantSelect,
      });
    } catch (error: unknown) {
      const conflict = mapVariantUniqueConflict(error);
      if (conflict !== null) throw conflict;
      throw error;
    }
  }

  public async listVariants(
    merchantId: string,
    productId: string,
    query: ProductVariantListQuery,
  ): Promise<ProductVariantListResult> {
    const where = {
      merchantId,
      productId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { sku: { contains: query.q, mode: 'insensitive' as const } },
              { barcode: { contains: query.q, mode: 'insensitive' as const } },
              { size: { contains: query.q, mode: 'insensitive' as const } },
              { colour: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }),
    };
    const [total, rows] = await this.database.client.$transaction([
      this.database.client.productVariant.count({ where }),
      this.database.client.productVariant.findMany({
        where,
        select: productVariantSelect,
        orderBy: [{ sku: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows, total };
  }

  public findVariant(
    merchantId: string,
    productId: string,
    variantId: string,
  ): Promise<ProductVariantRecord | null> {
    return this.database.client.productVariant.findFirst({
      where: { merchantId, productId, id: variantId },
      select: productVariantSelect,
    });
  }

  public findVariantByIdentifier(
    merchantId: string,
    query: ProductVariantLookupQuery,
  ): Promise<ProductVariantRecord | null> {
    return this.database.client.productVariant.findFirst({
      where: {
        merchantId,
        ...(query.sku !== undefined
          ? { sku: query.sku }
          : { barcode: query.barcode! }),
      },
      select: productVariantSelect,
    });
  }

  public async updateVariant(
    merchantId: string,
    productId: string,
    variantId: string,
    patch: ProductVariantPatch,
  ): Promise<ProductVariantRecord | null> {
    try {
      const updated = await this.database.client.productVariant.updateMany({
        where: { merchantId, productId, id: variantId },
        data: {
          ...(patch.sku === undefined ? {} : { sku: patch.sku }),
          ...(patch.barcode === undefined ? {} : { barcode: patch.barcode }),
          ...(patch.size === undefined ? {} : { size: patch.size }),
          ...(patch.colour === undefined ? {} : { colour: patch.colour }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
        },
      });
      if (updated.count === 0) return null;
      return this.findVariant(merchantId, productId, variantId);
    } catch (error: unknown) {
      const conflict = mapVariantUniqueConflict(error);
      if (conflict !== null) throw conflict;
      throw error;
    }
  }

  public setVariantPrice(
    merchantId: string,
    productId: string,
    variantId: string,
    input: SetVariantPriceInput,
  ): Promise<ProductVariantRecord | null> {
    return this.database.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRawUnsafe<
        readonly { id: string }[]
      >(
        'SELECT id FROM "product_variants" WHERE "merchant_id" = $1::uuid AND "product_id" = $2::uuid AND id = $3::uuid FOR UPDATE',
        merchantId,
        productId,
        variantId,
      );
      if (locked.length === 0) return null;
      const [current, merchant] = await Promise.all([
        transaction.productVariant.findUnique({
          where: { merchantId_id: { merchantId, id: variantId } },
          select: productVariantSelect,
        }),
        transaction.merchant.findUnique({
          where: { id: merchantId },
          select: { currency: true },
        }),
      ]);
      if (current === null || merchant === null) return null;
      const sellingPrice = BigInt(input.sellingPrice);
      const costPrice =
        input.costPrice === undefined || input.costPrice === null
          ? null
          : BigInt(input.costPrice);
      if (
        current.sellingPrice === sellingPrice &&
        current.costPrice === costPrice &&
        current.priceCurrency === merchant.currency
      ) {
        return current;
      }
      const changedAt = new Date();
      const updated = await transaction.productVariant.update({
        where: { merchantId_id: { merchantId, id: variantId } },
        data: {
          sellingPrice,
          costPrice,
          priceCurrency: merchant.currency,
          priceUpdatedAt: changedAt,
        },
        select: productVariantSelect,
      });
      await transaction.variantPriceHistory.create({
        data: {
          merchantId,
          variantId,
          sellingPrice,
          costPrice,
          currency: merchant.currency,
          createdAt: changedAt,
        },
      });
      return updated;
    });
  }

  public listVariantPriceHistory(
    merchantId: string,
    productId: string,
    variantId: string,
    query: VariantPriceHistoryQuery,
  ): Promise<VariantPriceHistoryListResult | null> {
    return this.database.client.$transaction(async (transaction) => {
      const variant = await transaction.productVariant.findFirst({
        where: { merchantId, productId, id: variantId },
        select: { id: true },
      });
      if (variant === null) return null;
      const where = { merchantId, variantId };
      const [total, rows] = await Promise.all([
        transaction.variantPriceHistory.count({ where }),
        transaction.variantPriceHistory.findMany({
          where,
          select: priceHistorySelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return { rows, total };
    });
  }
}
