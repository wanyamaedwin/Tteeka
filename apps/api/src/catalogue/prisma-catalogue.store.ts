import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type {
  CatalogueStore,
  ProductListResult,
  ProductRecord,
} from './catalogue.store';
import type { ProductListQuery } from './product-query.schema';
import type { CreateProductInput, ProductPatch } from './product.schema';

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
}
