import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import {
  CATALOGUE_STORE,
  type CatalogueStore,
  type ProductRecord,
} from './catalogue.store';
import type { ProductListQuery } from './product-query.schema';
import type { CreateProductInput, ProductPatch } from './product.schema';

type ProductStore = Pick<
  CatalogueStore,
  'createProduct' | 'listProducts' | 'findProduct' | 'updateProduct'
>;

export interface ProductResponse {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly brand: string | null;
  readonly status: ProductRecord['status'];
  readonly createdAt: string;
  readonly updatedAt: string;
}

@Injectable()
export class ProductService {
  public constructor(
    @Inject(CATALOGUE_STORE) private readonly store: ProductStore,
  ) {}

  public async create(
    context: ResolvedMerchantContext,
    input: CreateProductInput,
  ): Promise<ProductResponse> {
    return this.map(await this.store.createProduct(context.merchant.id, input));
  }

  public async list(context: ResolvedMerchantContext, query: ProductListQuery) {
    const result = await this.store.listProducts(context.merchant.id, query);
    return {
      products: result.rows.map((row) => this.map(row)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
  }

  public async detail(
    context: ResolvedMerchantContext,
    productId: string,
  ): Promise<ProductResponse> {
    const record = await this.store.findProduct(context.merchant.id, productId);
    if (record === null) throw new NotFoundException('Not found.');
    return this.map(record);
  }

  public async update(
    context: ResolvedMerchantContext,
    productId: string,
    patch: ProductPatch,
  ): Promise<ProductResponse> {
    const record = await this.store.updateProduct(
      context.merchant.id,
      productId,
      patch,
    );
    if (record === null) throw new NotFoundException('Not found.');
    return this.map(record);
  }

  private map(record: ProductRecord): ProductResponse {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      category: record.category,
      brand: record.brand,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
