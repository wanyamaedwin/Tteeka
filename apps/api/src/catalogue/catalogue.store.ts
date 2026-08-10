import type { ProductListQuery } from './product-query.schema';
import type { CreateProductInput, ProductPatch } from './product.schema';

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
}
