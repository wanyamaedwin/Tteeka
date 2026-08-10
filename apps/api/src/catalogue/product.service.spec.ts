import assert from 'node:assert/strict';
import test from 'node:test';

import { NotFoundException } from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import type { CatalogueStore, ProductRecord } from './catalogue.store';
import { ProductService } from './product.service';

const CONTEXT = {
  merchant: { id: '01910000-0000-7000-8000-000000000001' },
} as ResolvedMerchantContext;
const RECORD: ProductRecord = {
  id: '01910000-0000-7000-8000-000000000002',
  name: 'Shirt',
  description: null,
  category: 'Apparel',
  brand: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-08-10T00:00:00.000Z'),
  updatedAt: new Date('2026-08-10T01:00:00.000Z'),
};

class FakeStore implements CatalogueStore {
  public readonly calls: unknown[][] = [];
  public record: ProductRecord | null = RECORD;

  public createProduct(merchantId: string, input: { name: string }) {
    this.calls.push(['create', merchantId, input]);
    return Promise.resolve(RECORD);
  }
  public listProducts(
    merchantId: string,
    query: { page: number; pageSize: number },
  ) {
    this.calls.push(['list', merchantId, query]);
    return Promise.resolve({ rows: [RECORD], total: 21 });
  }
  public findProduct(merchantId: string, productId: string) {
    this.calls.push(['find', merchantId, productId]);
    return Promise.resolve(this.record);
  }
  public updateProduct(
    merchantId: string,
    productId: string,
    patch: { name?: string },
  ) {
    this.calls.push(['update', merchantId, productId, patch]);
    return Promise.resolve(this.record);
  }
}

void test('Product service uses only context Merchant id and maps bounded output', async () => {
  const store = new FakeStore();
  const service = new ProductService(store);
  const created = await service.create(CONTEXT, { name: 'Shirt' });
  const listed = await service.list(CONTEXT, { page: 2, pageSize: 20 });
  const detail = await service.detail(CONTEXT, RECORD.id);
  const updated = await service.update(CONTEXT, RECORD.id, { name: 'New' });
  assert.deepEqual(store.calls, [
    ['create', CONTEXT.merchant.id, { name: 'Shirt' }],
    ['list', CONTEXT.merchant.id, { page: 2, pageSize: 20 }],
    ['find', CONTEXT.merchant.id, RECORD.id],
    ['update', CONTEXT.merchant.id, RECORD.id, { name: 'New' }],
  ]);
  assert.deepEqual(created, detail);
  assert.deepEqual(updated, detail);
  assert.equal('merchantId' in created, false);
  assert.deepEqual(listed.pagination, {
    page: 2,
    pageSize: 20,
    total: 21,
    totalPages: 2,
  });
});

void test('missing and foreign Product targets share generic 404', async () => {
  const store = new FakeStore();
  store.record = null;
  const service = new ProductService(store);
  await assert.rejects(
    () => service.detail(CONTEXT, RECORD.id),
    (error) => {
      assert.ok(error instanceof NotFoundException);
      assert.equal(error.message, 'Not found.');
      return true;
    },
  );
  await assert.rejects(
    () => service.update(CONTEXT, RECORD.id, { status: 'ARCHIVED' }),
    NotFoundException,
  );
});

void test('store infrastructure errors propagate without becoming 403 or 404', async () => {
  const store = new FakeStore();
  store.findProduct = () => Promise.reject(new Error('database unavailable'));
  await assert.rejects(
    () => new ProductService(store).detail(CONTEXT, RECORD.id),
    /database unavailable/,
  );
});
