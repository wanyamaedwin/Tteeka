import assert from 'node:assert/strict';
import test from 'node:test';

import {
  productVariantListQuerySchema,
  productVariantLookupQuerySchema,
} from './product-variant-query.schema';
import {
  createProductVariantSchema,
  productVariantPatchSchema,
} from './product-variant.schema';
import {
  setVariantPriceSchema,
  variantPriceHistoryQuerySchema,
} from './variant-price.schema';

void test('Variant create canonicalizes SKU and trims bounded metadata', () => {
  assert.deepEqual(
    createProductVariantSchema.parse({
      sku: ' tshirt-blk-m ',
      barcode: ' Scan-Label_1 ',
      size: ' 500 ml ',
      colour: ' Black ',
    }),
    {
      sku: 'TSHIRT-BLK-M',
      barcode: 'Scan-Label_1',
      size: '500 ml',
      colour: 'Black',
    },
  );
  assert.deepEqual(
    createProductVariantSchema.parse({
      sku: 'SKU_1001',
      barcode: null,
      size: null,
      colour: null,
    }),
    { sku: 'SKU_1001', barcode: null, size: null, colour: null },
  );
});

for (const input of [
  {},
  { sku: '' },
  { sku: '   ' },
  { sku: '-BAD' },
  { sku: '_BAD' },
  { sku: 'BAD SKU' },
  { sku: 'BAD/SLASH' },
  { sku: 'A'.repeat(65) },
  { sku: 'VALID', barcode: '' },
  { sku: 'VALID', barcode: 'BAD CODE' },
  { sku: 'VALID', barcode: 'x'.repeat(65) },
  { sku: 'VALID', size: '' },
  { sku: 'VALID', size: 'x'.repeat(81) },
  { sku: 'VALID', colour: ' ' },
  { sku: 'VALID', colour: 'x'.repeat(81) },
  { sku: 'VALID', status: 'INACTIVE' },
  { sku: 'VALID', sellingPrice: '1' },
  { sku: 'VALID', costPrice: '0' },
  { sku: 'VALID', productId: 'x' },
  { sku: 'VALID', merchantId: 'x' },
  { sku: 'VALID', inventory: 1 },
]) {
  void test(`Variant create rejects ${JSON.stringify(input).slice(0, 90)}`, () => {
    assert.equal(createProductVariantSchema.safeParse(input).success, false);
  });
}

void test('Variant patch canonicalizes SKU and permits nullable clearing', () => {
  assert.deepEqual(
    productVariantPatchSchema.parse({
      sku: ' corrected.1 ',
      barcode: null,
      size: null,
      colour: null,
      status: 'ARCHIVED',
    }),
    {
      sku: 'CORRECTED.1',
      barcode: null,
      size: null,
      colour: null,
      status: 'ARCHIVED',
    },
  );
  for (const status of ['ACTIVE', 'INACTIVE', 'ARCHIVED']) {
    assert.equal(productVariantPatchSchema.safeParse({ status }).success, true);
  }
});

for (const input of [
  {},
  { sku: null },
  { barcode: 'bad code' },
  { status: null },
  { status: 'DELETED' },
  { sellingPrice: '1' },
  { costPrice: '0' },
  { currency: 'UGX' },
  { productId: 'x' },
  { merchantId: 'x' },
  { unknown: true },
]) {
  void test(`Variant patch rejects ${JSON.stringify(input)}`, () => {
    assert.equal(productVariantPatchSchema.safeParse(input).success, false);
  });
}

void test('Variant list query applies required defaults and coercion', () => {
  assert.deepEqual(productVariantListQuerySchema.parse({}), {
    page: 1,
    pageSize: 50,
  });
  assert.deepEqual(
    productVariantListQuerySchema.parse({
      q: ' black ',
      status: 'ACTIVE',
      page: '2',
      pageSize: '100',
    }),
    { q: 'black', status: 'ACTIVE', page: 2, pageSize: 100 },
  );
});

for (const query of [
  { q: ' ' },
  { q: 'x'.repeat(101) },
  { status: 'DELETED' },
  { page: '0' },
  { page: '1.5' },
  { pageSize: '0' },
  { pageSize: '101' },
  { unknown: 'x' },
]) {
  void test(`Variant list rejects ${JSON.stringify(query).slice(0, 90)}`, () => {
    assert.equal(productVariantListQuerySchema.safeParse(query).success, false);
  });
}

void test('Variant lookup accepts exactly one normalized identifier', () => {
  assert.deepEqual(productVariantLookupQuerySchema.parse({ sku: ' abc-1 ' }), {
    sku: 'ABC-1',
  });
  assert.deepEqual(
    productVariantLookupQuerySchema.parse({ barcode: ' Scan-A ' }),
    { barcode: 'Scan-A' },
  );
});

for (const query of [
  {},
  { sku: 'ABC', barcode: '123' },
  { sku: 'bad sku' },
  { barcode: 'bad code' },
  { barcode: '' },
  { sku: 'ABC', unknown: 'x' },
]) {
  void test(`Variant lookup rejects ${JSON.stringify(query)}`, () => {
    assert.equal(
      productVariantLookupQuerySchema.safeParse(query).success,
      false,
    );
  });
}

void test('price input preserves exact canonical BIGINT strings', () => {
  assert.deepEqual(
    setVariantPriceSchema.parse({ sellingPrice: ' 45000 ', costPrice: '0' }),
    { sellingPrice: '45000', costPrice: '0' },
  );
  assert.deepEqual(
    setVariantPriceSchema.parse({ sellingPrice: '9007199254740993' }),
    { sellingPrice: '9007199254740993' },
  );
  assert.deepEqual(
    setVariantPriceSchema.parse({ sellingPrice: '1', costPrice: null }),
    { sellingPrice: '1', costPrice: null },
  );
});

for (const input of [
  { sellingPrice: '' },
  { sellingPrice: '0' },
  { sellingPrice: '-1' },
  { sellingPrice: '+100' },
  { sellingPrice: '10.5' },
  { sellingPrice: '1,000' },
  { sellingPrice: 'UGX 1000' },
  { sellingPrice: '1e6' },
  { sellingPrice: '9223372036854775808' },
  { sellingPrice: '1', costPrice: '-1' },
  { sellingPrice: '1', costPrice: '1.5' },
  { sellingPrice: '1', costPrice: '9223372036854775808' },
  { sellingPrice: '1', currency: 'UGX' },
  { sellingPrice: '1', unknown: true },
]) {
  void test(`price input rejects ${JSON.stringify(input)}`, () => {
    assert.equal(setVariantPriceSchema.safeParse(input).success, false);
  });
}

void test('price history query applies bounded pagination', () => {
  assert.deepEqual(variantPriceHistoryQuerySchema.parse({}), {
    page: 1,
    pageSize: 50,
  });
  assert.deepEqual(
    variantPriceHistoryQuerySchema.parse({ page: '2', pageSize: '100' }),
    { page: 2, pageSize: 100 },
  );
});

for (const query of [
  { page: '0' },
  { page: '1.1' },
  { pageSize: '0' },
  { pageSize: '101' },
  { unknown: 'x' },
]) {
  void test(`price history query rejects ${JSON.stringify(query)}`, () => {
    assert.equal(
      variantPriceHistoryQuerySchema.safeParse(query).success,
      false,
    );
  });
}
