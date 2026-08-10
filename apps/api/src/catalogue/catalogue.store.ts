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

export const CATALOGUE_STORE = Symbol('CATALOGUE_STORE');

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface ProductRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly brand: string | null;
  readonly status: ProductStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProductListResult {
  readonly rows: readonly ProductRecord[];
  readonly total: number;
}

export type ProductVariantStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface ProductVariantRecord {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly size: string | null;
  readonly colour: string | null;
  readonly status: ProductVariantStatus;
  readonly sellingPrice: bigint | null;
  readonly costPrice: bigint | null;
  readonly priceCurrency: string | null;
  readonly priceUpdatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProductVariantListResult {
  readonly rows: readonly ProductVariantRecord[];
  readonly total: number;
}

export interface VariantPriceHistoryRecord {
  readonly id: string;
  readonly sellingPrice: bigint;
  readonly costPrice: bigint | null;
  readonly currency: string;
  readonly createdAt: Date;
}

export interface VariantPriceHistoryListResult {
  readonly rows: readonly VariantPriceHistoryRecord[];
  readonly total: number;
}

export class SkuAlreadyExistsError extends Error {
  public constructor() {
    super('SKU already exists.');
    this.name = 'SkuAlreadyExistsError';
  }
}

export class BarcodeAlreadyExistsError extends Error {
  public constructor() {
    super('Barcode already exists.');
    this.name = 'BarcodeAlreadyExistsError';
  }
}

export interface CatalogueStore {
  createProduct(
    merchantId: string,
    input: CreateProductInput,
  ): Promise<ProductRecord>;
  listProducts(
    merchantId: string,
    query: ProductListQuery,
  ): Promise<ProductListResult>;
  findProduct(
    merchantId: string,
    productId: string,
  ): Promise<ProductRecord | null>;
  updateProduct(
    merchantId: string,
    productId: string,
    patch: ProductPatch,
  ): Promise<ProductRecord | null>;
  createVariant(
    merchantId: string,
    productId: string,
    input: CreateProductVariantInput,
  ): Promise<ProductVariantRecord | null>;
  listVariants(
    merchantId: string,
    productId: string,
    query: ProductVariantListQuery,
  ): Promise<ProductVariantListResult>;
  findVariant(
    merchantId: string,
    productId: string,
    variantId: string,
  ): Promise<ProductVariantRecord | null>;
  findVariantByIdentifier(
    merchantId: string,
    query: ProductVariantLookupQuery,
  ): Promise<ProductVariantRecord | null>;
  updateVariant(
    merchantId: string,
    productId: string,
    variantId: string,
    patch: ProductVariantPatch,
  ): Promise<ProductVariantRecord | null>;
  setVariantPrice(
    merchantId: string,
    productId: string,
    variantId: string,
    input: SetVariantPriceInput,
  ): Promise<ProductVariantRecord | null>;
  listVariantPriceHistory(
    merchantId: string,
    productId: string,
    variantId: string,
    query: VariantPriceHistoryQuery,
  ): Promise<VariantPriceHistoryListResult | null>;
}
