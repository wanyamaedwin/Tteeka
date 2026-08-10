import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import {
  BarcodeAlreadyExistsError,
  CATALOGUE_STORE,
  type CatalogueStore,
  type ProductVariantRecord,
  SkuAlreadyExistsError,
} from './catalogue.store';
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

type VariantCatalogueStore = Pick<
  CatalogueStore,
  | 'findProduct'
  | 'createVariant'
  | 'listVariants'
  | 'findVariant'
  | 'findVariantByIdentifier'
  | 'updateVariant'
  | 'setVariantPrice'
  | 'listVariantPriceHistory'
>;

export interface ProductVariantResponse {
  readonly id: string;
  readonly productId: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly size: string | null;
  readonly colour: string | null;
  readonly status: ProductVariantRecord['status'];
  readonly price: {
    readonly sellingPrice: string;
    readonly currency: string;
    readonly updatedAt: string;
  } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VariantPriceResponse {
  readonly sellingPrice: string;
  readonly costPrice: string | null;
  readonly currency: string;
  readonly updatedAt: string;
}

@Injectable()
export class ProductVariantService {
  public constructor(
    @Inject(CATALOGUE_STORE) private readonly store: VariantCatalogueStore,
  ) {}

  public async create(
    context: ResolvedMerchantContext,
    productId: string,
    input: CreateProductVariantInput,
  ): Promise<ProductVariantResponse> {
    return this.mapVariant(
      await this.withConflictMapping(() =>
        this.store.createVariant(context.merchant.id, productId, input),
      ),
    );
  }

  public async list(
    context: ResolvedMerchantContext,
    productId: string,
    query: ProductVariantListQuery,
  ) {
    await this.requireProduct(context.merchant.id, productId);
    const result = await this.store.listVariants(
      context.merchant.id,
      productId,
      query,
    );
    return {
      variants: result.rows.map((row) => this.mapVariant(row)),
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
    variantId: string,
  ): Promise<ProductVariantResponse> {
    return this.mapVariant(
      await this.requireVariant(context.merchant.id, productId, variantId),
    );
  }

  public async lookup(
    context: ResolvedMerchantContext,
    query: ProductVariantLookupQuery,
  ): Promise<ProductVariantResponse> {
    const record = await this.store.findVariantByIdentifier(
      context.merchant.id,
      query,
    );
    if (record === null) throw new NotFoundException('Not found.');
    return this.mapVariant(record);
  }

  public async update(
    context: ResolvedMerchantContext,
    productId: string,
    variantId: string,
    patch: ProductVariantPatch,
  ): Promise<ProductVariantResponse> {
    if (patch.status === 'ACTIVE') {
      const current = await this.requireVariant(
        context.merchant.id,
        productId,
        variantId,
      );
      if (current.sellingPrice === null || current.priceCurrency === null) {
        throw new UnprocessableEntityException(
          'Variant requires a price before activation.',
        );
      }
    }
    return this.mapVariant(
      await this.withConflictMapping(() =>
        this.store.updateVariant(
          context.merchant.id,
          productId,
          variantId,
          patch,
        ),
      ),
    );
  }

  public async setPrice(
    context: ResolvedMerchantContext,
    productId: string,
    variantId: string,
    input: SetVariantPriceInput,
  ): Promise<VariantPriceResponse> {
    const record = await this.store.setVariantPrice(
      context.merchant.id,
      productId,
      variantId,
      input,
    );
    if (record === null) throw new NotFoundException('Not found.');
    return this.mapPrice(record);
  }

  public async priceHistory(
    context: ResolvedMerchantContext,
    productId: string,
    variantId: string,
    query: VariantPriceHistoryQuery,
  ) {
    const result = await this.store.listVariantPriceHistory(
      context.merchant.id,
      productId,
      variantId,
      query,
    );
    if (result === null) throw new NotFoundException('Not found.');
    return {
      prices: result.rows.map((row) => ({
        id: row.id,
        sellingPrice: row.sellingPrice.toString(),
        costPrice: row.costPrice?.toString() ?? null,
        currency: row.currency,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
  }

  private async requireProduct(
    merchantId: string,
    productId: string,
  ): Promise<void> {
    if ((await this.store.findProduct(merchantId, productId)) === null) {
      throw new NotFoundException('Not found.');
    }
  }

  private async requireVariant(
    merchantId: string,
    productId: string,
    variantId: string,
  ): Promise<ProductVariantRecord> {
    const record = await this.store.findVariant(
      merchantId,
      productId,
      variantId,
    );
    if (record === null) throw new NotFoundException('Not found.');
    return record;
  }

  private async withConflictMapping(
    operation: () => Promise<ProductVariantRecord | null>,
  ): Promise<ProductVariantRecord> {
    try {
      const result = await operation();
      if (result === null) throw new NotFoundException('Not found.');
      return result;
    } catch (error: unknown) {
      if (error instanceof SkuAlreadyExistsError) {
        throw new ConflictException('SKU already exists.');
      }
      if (error instanceof BarcodeAlreadyExistsError) {
        throw new ConflictException('Barcode already exists.');
      }
      throw error;
    }
  }

  private mapVariant(record: ProductVariantRecord): ProductVariantResponse {
    const price =
      record.sellingPrice === null ||
      record.priceCurrency === null ||
      record.priceUpdatedAt === null
        ? null
        : {
            sellingPrice: record.sellingPrice.toString(),
            currency: record.priceCurrency,
            updatedAt: record.priceUpdatedAt.toISOString(),
          };
    return {
      id: record.id,
      productId: record.productId,
      sku: record.sku,
      barcode: record.barcode,
      size: record.size,
      colour: record.colour,
      status: record.status,
      price,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private mapPrice(record: ProductVariantRecord): VariantPriceResponse {
    if (
      record.sellingPrice === null ||
      record.priceCurrency === null ||
      record.priceUpdatedAt === null
    ) {
      throw new NotFoundException('Not found.');
    }
    return {
      sellingPrice: record.sellingPrice.toString(),
      costPrice: record.costPrice?.toString() ?? null,
      currency: record.priceCurrency,
      updatedAt: record.priceUpdatedAt.toISOString(),
    };
  }
}
