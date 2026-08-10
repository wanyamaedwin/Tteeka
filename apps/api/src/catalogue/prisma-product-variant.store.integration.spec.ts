import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import { uuidV7Schema } from '../common/uuid-v7';
import type { DatabaseService } from '../database/database.service';
import {
  BarcodeAlreadyExistsError,
  SkuAlreadyExistsError,
} from './catalogue.store';
import { PrismaCatalogueStore } from './prisma-catalogue.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Product Variant store tests require DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const store = new PrismaCatalogueStore({ client } as DatabaseService);
const PREFIX = 'B3.2 Variant Store Test';

async function merchant(label: string, currency = 'UGX') {
  return client.merchant.create({
    data: {
      displayName: `${PREFIX} ${label} ${randomUUID()}`,
      currency,
    },
  });
}

async function product(merchantId: string, label: string) {
  return store.createProduct(merchantId, { name: `${label} ${randomUUID()}` });
}

async function cleanup(): Promise<void> {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const merchantIds = merchants.map(({ id }) => id);
  await client.variantPriceHistory.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.productVariant.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.product.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.merchant.deleteMany({ where: { id: { in: merchantIds } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('Variant persists with tenant-safe UUIDv7 identity, INACTIVE default, and null price', async () => {
  const owner = await merchant('Identity');
  const parent = await product(owner.id, 'Shirt');
  const variant = await store.createVariant(owner.id, parent.id, {
    sku: 'SHIRT-BLK-M',
    barcode: null,
    size: null,
    colour: null,
  });
  assert.ok(variant !== null);
  assert.equal(uuidV7Schema().safeParse(variant.id).success, true);
  assert.equal(variant.productId, parent.id);
  assert.equal(variant.status, 'INACTIVE');
  assert.deepEqual(
    [
      variant.barcode,
      variant.size,
      variant.colour,
      variant.sellingPrice,
      variant.costPrice,
      variant.priceCurrency,
      variant.priceUpdatedAt,
    ],
    [null, null, null, null, null, null, null],
  );
  assert.equal(
    await client.variantPriceHistory.count({
      where: { merchantId: owner.id, variantId: variant.id },
    }),
    0,
  );
});

void test('database composite keys reject cross-Merchant Product and history references', async () => {
  const a = await merchant('Tenant A');
  const b = await merchant('Tenant B');
  const parentA = await product(a.id, 'A');
  const variantA = await store.createVariant(a.id, parentA.id, { sku: 'A-1' });
  assert.ok(variantA !== null);
  await assert.rejects(() =>
    client.productVariant.create({
      data: { merchantId: b.id, productId: parentA.id, sku: 'INVALID-TENANT' },
    }),
  );
  await assert.rejects(() =>
    client.variantPriceHistory.create({
      data: {
        merchantId: b.id,
        variantId: variantA.id,
        sellingPrice: 1n,
        currency: 'UGX',
      },
    }),
  );
});

void test('SKU and barcode are Merchant-unique but reusable across Merchants with nullable barcode', async () => {
  const a = await merchant('Keys A');
  const b = await merchant('Keys B');
  const [productA, productB] = await Promise.all([
    product(a.id, 'A'),
    product(b.id, 'B'),
  ]);
  await store.createVariant(a.id, productA.id, {
    sku: 'SAME-SKU',
    barcode: 'SameBarcode',
  });
  await assert.rejects(
    () =>
      store.createVariant(a.id, productA.id, {
        sku: 'SAME-SKU',
        barcode: 'Different',
      }),
    SkuAlreadyExistsError,
  );
  await assert.rejects(
    () =>
      store.createVariant(a.id, productA.id, {
        sku: 'OTHER-SKU',
        barcode: 'SameBarcode',
      }),
    BarcodeAlreadyExistsError,
  );
  await store.createVariant(b.id, productB.id, {
    sku: 'SAME-SKU',
    barcode: 'SameBarcode',
  });
  await Promise.all([
    store.createVariant(a.id, productA.id, { sku: 'NULL-1' }),
    store.createVariant(a.id, productA.id, { sku: 'NULL-2', barcode: null }),
  ]);
  assert.equal(
    await client.productVariant.count({
      where: { barcode: null, merchantId: a.id },
    }),
    2,
  );
});

void test('Variant list is Product/Merchant scoped, searchable, filterable, ordered, and paginated', async () => {
  const a = await merchant('List A');
  const b = await merchant('List B');
  const [parentA, otherA, parentB] = await Promise.all([
    product(a.id, 'Parent'),
    product(a.id, 'Other'),
    product(b.id, 'Foreign'),
  ]);
  const alpha = await store.createVariant(a.id, parentA.id, {
    sku: 'ALPHA',
    barcode: 'SCAN-ALPHA',
    size: 'Medium',
    colour: 'Crimson',
  });
  const beta = await store.createVariant(a.id, parentA.id, {
    sku: 'BETA',
    barcode: 'SCAN-BETA',
    size: 'Large',
    colour: 'Black',
  });
  assert.ok(alpha !== null && beta !== null);
  await store.updateVariant(a.id, parentA.id, beta.id, { status: 'ARCHIVED' });
  await store.createVariant(a.id, otherA.id, { sku: 'OTHER' });
  await store.createVariant(b.id, parentB.id, { sku: 'FOREIGN' });
  const page = await store.listVariants(a.id, parentA.id, {
    page: 1,
    pageSize: 1,
  });
  assert.equal(page.total, 2);
  assert.deepEqual(
    page.rows.map(({ sku }) => sku),
    ['ALPHA'],
  );
  assert.deepEqual(
    (
      await store.listVariants(a.id, parentA.id, { page: 2, pageSize: 1 })
    ).rows.map(({ sku }) => sku),
    ['BETA'],
  );
  for (const q of ['alpha', 'scan-alpha', 'medium', 'crimson']) {
    assert.deepEqual(
      (
        await store.listVariants(a.id, parentA.id, { q, page: 1, pageSize: 50 })
      ).rows.map(({ sku }) => sku),
      ['ALPHA'],
    );
  }
  assert.deepEqual(
    (
      await store.listVariants(a.id, parentA.id, {
        status: 'ARCHIVED',
        page: 1,
        pageSize: 50,
      })
    ).rows.map(({ sku }) => sku),
    ['BETA'],
  );
  assert.deepEqual(
    (await store.listVariants(a.id, parentA.id, { page: 9, pageSize: 50 }))
      .rows,
    [],
  );
  assert.equal(await store.findVariant(b.id, parentA.id, alpha.id), null);
});

void test('Variant update and exact lookup preserve tenant scope and nullable clearing', async () => {
  const owner = await merchant('Update');
  const parent = await product(owner.id, 'Parent');
  const variant = await store.createVariant(owner.id, parent.id, {
    sku: 'ORIGINAL',
    barcode: 'OriginalCase',
    size: 'M',
    colour: 'Blue',
  });
  assert.ok(variant !== null);
  const updated = await store.updateVariant(owner.id, parent.id, variant.id, {
    sku: 'CORRECTED',
    barcode: null,
    size: null,
    colour: null,
    status: 'ARCHIVED',
  });
  assert.deepEqual(
    [
      updated?.sku,
      updated?.barcode,
      updated?.size,
      updated?.colour,
      updated?.status,
    ],
    ['CORRECTED', null, null, null, 'ARCHIVED'],
  );
  assert.equal(
    (await store.findVariantByIdentifier(owner.id, { sku: 'CORRECTED' }))?.id,
    variant.id,
  );
  assert.equal(
    await store.findVariantByIdentifier(owner.id, { barcode: 'OriginalCase' }),
    null,
  );
});

void test('price PUT is transactional, bigint-safe, idempotent, append-only, and snapshots currency', async () => {
  const owner = await merchant('Price', 'UGX');
  const parent = await product(owner.id, 'Parent');
  const variant = await store.createVariant(owner.id, parent.id, {
    sku: 'PRICE-1',
  });
  assert.ok(variant !== null);
  const first = await store.setVariantPrice(owner.id, parent.id, variant.id, {
    sellingPrice: '9007199254740993',
    costPrice: '30000',
  });
  assert.equal(first?.sellingPrice, 9_007_199_254_740_993n);
  assert.equal(first?.priceCurrency, 'UGX');
  const firstUpdatedAt = first?.priceUpdatedAt?.getTime();
  const identical = await store.setVariantPrice(
    owner.id,
    parent.id,
    variant.id,
    {
      sellingPrice: '9007199254740993',
      costPrice: '30000',
    },
  );
  assert.equal(identical?.priceUpdatedAt?.getTime(), firstUpdatedAt);
  assert.equal(
    await client.variantPriceHistory.count({
      where: { variantId: variant.id },
    }),
    1,
  );
  await store.setVariantPrice(owner.id, parent.id, variant.id, {
    sellingPrice: '9007199254740994',
    costPrice: '31000',
  });
  await store.setVariantPrice(owner.id, parent.id, variant.id, {
    sellingPrice: '9007199254740994',
    costPrice: null,
  });
  await client.merchant.update({
    where: { id: owner.id },
    data: { currency: 'KES' },
  });
  await store.setVariantPrice(owner.id, parent.id, variant.id, {
    sellingPrice: '9007199254740994',
    costPrice: null,
  });
  const history = await store.listVariantPriceHistory(
    owner.id,
    parent.id,
    variant.id,
    { page: 1, pageSize: 2 },
  );
  assert.ok(history !== null);
  assert.equal(history.total, 4);
  assert.deepEqual(
    history.rows.map(({ currency }) => currency),
    ['KES', 'UGX'],
  );
  assert.equal(history.rows[0]?.costPrice, null);
  const older = await store.listVariantPriceHistory(
    owner.id,
    parent.id,
    variant.id,
    { page: 2, pageSize: 2 },
  );
  assert.ok(older !== null);
  assert.equal(
    older.rows.every(({ currency }) => currency === 'UGX'),
    true,
  );
});

void test('concurrent duplicate identifiers are safe and concurrent prices stay consistent', async () => {
  const owner = await merchant('Concurrency');
  const parent = await product(owner.id, 'Parent');
  const skuResults = await Promise.allSettled([
    store.createVariant(owner.id, parent.id, { sku: 'CONCURRENT-SKU' }),
    store.createVariant(owner.id, parent.id, { sku: 'CONCURRENT-SKU' }),
  ]);
  assert.equal(
    skuResults.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(
    skuResults.filter(({ status }) => status === 'rejected').length,
    1,
  );
  const barcodeResults = await Promise.allSettled([
    store.createVariant(owner.id, parent.id, {
      sku: 'BARCODE-A',
      barcode: 'CONCURRENT-BARCODE',
    }),
    store.createVariant(owner.id, parent.id, {
      sku: 'BARCODE-B',
      barcode: 'CONCURRENT-BARCODE',
    }),
  ]);
  assert.equal(
    barcodeResults.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(
    barcodeResults.filter(({ status }) => status === 'rejected').length,
    1,
  );
  const variant = await store.createVariant(owner.id, parent.id, {
    sku: 'PRICE-RACE',
  });
  assert.ok(variant !== null);
  await Promise.all([
    store.setVariantPrice(owner.id, parent.id, variant.id, {
      sellingPrice: '100',
    }),
    store.setVariantPrice(owner.id, parent.id, variant.id, {
      sellingPrice: '200',
    }),
  ]);
  const current = await store.findVariant(owner.id, parent.id, variant.id);
  const history = await client.variantPriceHistory.findMany({
    where: { merchantId: owner.id, variantId: variant.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  assert.equal(history.length, 2);
  assert.equal(
    history.some(({ sellingPrice }) => sellingPrice === current?.sellingPrice),
    true,
  );
  assert.deepEqual(
    new Set(history.map(({ sellingPrice }) => sellingPrice.toString())),
    new Set(['100', '200']),
  );
});
