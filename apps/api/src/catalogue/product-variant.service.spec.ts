import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import {
  BarcodeAlreadyExistsError,
  type CatalogueStore,
  type ProductRecord,
  type ProductVariantRecord,
  SkuAlreadyExistsError,
} from './catalogue.store';
import { ProductVariantService } from './product-variant.service';

const MERCHANT_ID = '01910000-0000-7000-8000-000000000001';
const PRODUCT_ID = '01910000-0000-7000-8000-000000000002';
const VARIANT_ID = '01910000-0000-7000-8000-000000000003';
const CONTEXT = {
  merchant: { id: MERCHANT_ID },
} as ResolvedMerchantContext;
const NOW = new Date('2026-08-10T12:00:00.000Z');
const PRODUCT: ProductRecord = {
  id: PRODUCT_ID,
  name: 'Shirt',
  description: null,
  category: null,
  brand: null,
  status: 'ACTIVE',
  createdAt: NOW,
  updatedAt: NOW,
};
const UNPRICED: ProductVariantRecord = {
  id: VARIANT_ID,
  productId: PRODUCT_ID,
  sku: 'SHIRT-BLK-M',
  barcode: 'SCAN-1',
  size: 'M',
  colour: 'Black',
  status: 'INACTIVE',
  sellingPrice: null,
  costPrice: null,
  priceCurrency: null,
  priceUpdatedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};
const PRICED: ProductVariantRecord = {
  ...UNPRICED,
  sellingPrice: 9_007_199_254_740_993n,
  costPrice: 30_000n,
  priceCurrency: 'UGX',
  priceUpdatedAt: NOW,
};

class FakeVariantStore implements CatalogueStore {
  public readonly calls: unknown[][] = [];
  public product: ProductRecord | null = PRODUCT;
  public variant: ProductVariantRecord | null = UNPRICED;
  public error: Error | null = null;

  public createProduct(): Promise<ProductRecord> {
    return Promise.reject(new Error('not used'));
  }
  public listProducts() {
    return Promise.resolve({ rows: [], total: 0 });
  }
  public updateProduct(): Promise<ProductRecord | null> {
    return Promise.reject(new Error('not used'));
  }

  public findProduct(merchantId: string, productId: string) {
    this.calls.push(['findProduct', merchantId, productId]);
    return Promise.resolve(this.product);
  }
  public createVariant(merchantId: string, productId: string, input: unknown) {
    this.calls.push(['create', merchantId, productId, input]);
    if (this.error !== null) return Promise.reject(this.error);
    return Promise.resolve(this.variant);
  }
  public listVariants(merchantId: string, productId: string, query: unknown) {
    this.calls.push(['list', merchantId, productId, query]);
    return Promise.resolve({
      rows: this.variant === null ? [] : [this.variant],
      total: 1,
    });
  }
  public findVariant(merchantId: string, productId: string, variantId: string) {
    this.calls.push(['find', merchantId, productId, variantId]);
    return Promise.resolve(this.variant);
  }
  public findVariantByIdentifier(merchantId: string, query: unknown) {
    this.calls.push(['lookup', merchantId, query]);
    return Promise.resolve(this.variant);
  }
  public updateVariant(
    merchantId: string,
    productId: string,
    variantId: string,
    patch: unknown,
  ) {
    this.calls.push(['update', merchantId, productId, variantId, patch]);
    if (this.error !== null) return Promise.reject(this.error);
    return Promise.resolve(this.variant);
  }
  public setVariantPrice(
    merchantId: string,
    productId: string,
    variantId: string,
    input: unknown,
  ) {
    this.calls.push(['price', merchantId, productId, variantId, input]);
    return Promise.resolve(this.variant);
  }
  public listVariantPriceHistory(
    merchantId: string,
    productId: string,
    variantId: string,
    query: unknown,
  ) {
    this.calls.push(['history', merchantId, productId, variantId, query]);
    return Promise.resolve(
      this.variant === null
        ? null
        : {
            rows: [
              {
                id: '01910000-0000-7000-8000-000000000004',
                sellingPrice: 9_007_199_254_740_993n,
                costPrice: 30_000n,
                currency: 'UGX',
                createdAt: NOW,
              },
            ],
            total: 1,
          },
    );
  }
}

void test('Variant service uses context Merchant id for every operation', async () => {
  const store = new FakeVariantStore();
  const service = new ProductVariantService(store);
  await service.create(CONTEXT, PRODUCT_ID, { sku: 'SHIRT-BLK-M' });
  await service.list(CONTEXT, PRODUCT_ID, { page: 1, pageSize: 50 });
  await service.detail(CONTEXT, PRODUCT_ID, VARIANT_ID);
  await service.lookup(CONTEXT, { sku: 'SHIRT-BLK-M' });
  await service.update(CONTEXT, PRODUCT_ID, VARIANT_ID, { size: 'L' });
  store.variant = PRICED;
  await service.setPrice(CONTEXT, PRODUCT_ID, VARIANT_ID, {
    sellingPrice: '9007199254740993',
  });
  await service.priceHistory(CONTEXT, PRODUCT_ID, VARIANT_ID, {
    page: 1,
    pageSize: 50,
  });
  for (const call of store.calls) assert.equal(call[1], MERCHANT_ID);
});

void test('normal Variant output is bounded, bigint-safe, and omits cost', async () => {
  const store = new FakeVariantStore();
  store.variant = PRICED;
  const result = await new ProductVariantService(store).detail(
    CONTEXT,
    PRODUCT_ID,
    VARIANT_ID,
  );
  assert.equal(result.price?.sellingPrice, '9007199254740993');
  assert.equal(result.price?.currency, 'UGX');
  assert.equal('costPrice' in result, false);
  assert.equal('costPrice' in (result.price ?? {}), false);
  assert.equal('merchantId' in result, false);
});

void test('price management output includes exact cost string', async () => {
  const store = new FakeVariantStore();
  store.variant = PRICED;
  const result = await new ProductVariantService(store).setPrice(
    CONTEXT,
    PRODUCT_ID,
    VARIANT_ID,
    {
      sellingPrice: '9007199254740993',
      costPrice: '30000',
    },
  );
  assert.deepEqual(result, {
    sellingPrice: '9007199254740993',
    costPrice: '30000',
    currency: 'UGX',
    updatedAt: NOW.toISOString(),
  });
});

void test('unpriced ACTIVE transition is rejected with 422', async () => {
  const store = new FakeVariantStore();
  await assert.rejects(
    () =>
      new ProductVariantService(store).update(CONTEXT, PRODUCT_ID, VARIANT_ID, {
        status: 'ACTIVE',
      }),
    UnprocessableEntityException,
  );
  assert.equal(
    store.calls.some(([name]) => name === 'update'),
    false,
  );
});

void test('priced ACTIVE transition succeeds and retains price', async () => {
  const store = new FakeVariantStore();
  store.variant = { ...PRICED, status: 'ACTIVE' };
  const result = await new ProductVariantService(store).update(
    CONTEXT,
    PRODUCT_ID,
    VARIANT_ID,
    { status: 'ACTIVE' },
  );
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.price?.sellingPrice, '9007199254740993');
});

for (const [error, message] of [
  [new SkuAlreadyExistsError(), 'SKU already exists.'],
  [new BarcodeAlreadyExistsError(), 'Barcode already exists.'],
] as const) {
  void test(`${message} maps to safe 409`, async () => {
    const store = new FakeVariantStore();
    store.error = error;
    await assert.rejects(
      () =>
        new ProductVariantService(store).create(CONTEXT, PRODUCT_ID, {
          sku: 'DUPLICATE',
        }),
      (caught) => {
        assert.ok(caught instanceof ConflictException);
        assert.equal(caught.message, message);
        return true;
      },
    );
  });
}

void test('foreign Product and Variant targets share generic 404', async () => {
  const store = new FakeVariantStore();
  store.product = null;
  const service = new ProductVariantService(store);
  await assert.rejects(
    () => service.list(CONTEXT, PRODUCT_ID, { page: 1, pageSize: 50 }),
    (error) =>
      error instanceof NotFoundException && error.message === 'Not found.',
  );
  store.variant = null;
  await assert.rejects(
    () => service.detail(CONTEXT, PRODUCT_ID, VARIANT_ID),
    (error) =>
      error instanceof NotFoundException && error.message === 'Not found.',
  );
  await assert.rejects(
    () => service.lookup(CONTEXT, { sku: 'UNKNOWN' }),
    NotFoundException,
  );
});

void test('price history maps newest data and pagination with cost visibility', async () => {
  const store = new FakeVariantStore();
  store.variant = PRICED;
  const result = await new ProductVariantService(store).priceHistory(
    CONTEXT,
    PRODUCT_ID,
    VARIANT_ID,
    {
      page: 1,
      pageSize: 50,
    },
  );
  assert.equal(result.prices[0]?.sellingPrice, '9007199254740993');
  assert.equal(result.prices[0]?.costPrice, '30000');
  assert.deepEqual(result.pagination, {
    page: 1,
    pageSize: 50,
    total: 1,
    totalPages: 1,
  });
});

void test('unexpected infrastructure errors remain 500-class candidates', async () => {
  const store = new FakeVariantStore();
  store.error = new Error('database unavailable');
  await assert.rejects(
    () =>
      new ProductVariantService(store).create(CONTEXT, PRODUCT_ID, {
        sku: 'SKU-1',
      }),
    /database unavailable/,
  );
});
