import assert from 'node:assert/strict';
import test from 'node:test';

import { productListQuerySchema } from './product-query.schema';
import { createProductSchema, productPatchSchema } from './product.schema';

void test('Product create trims and accepts bounded nullable metadata', () => {
  assert.deepEqual(
    createProductSchema.parse({
      name: ' Classic Shirt ',
      description: ' Cotton ',
      category: " Men's Shirts ",
      brand: ' Tteeka ',
    }),
    {
      name: 'Classic Shirt',
      description: 'Cotton',
      category: "Men's Shirts",
      brand: 'Tteeka',
    },
  );
  assert.deepEqual(
    createProductSchema.parse({
      name: 'Shirt',
      description: null,
      category: null,
      brand: null,
    }),
    { name: 'Shirt', description: null, category: null, brand: null },
  );
});

for (const input of [
  { name: '' },
  { name: '   ' },
  { name: 'x'.repeat(161) },
  { name: 'Shirt', description: '' },
  { name: 'Shirt', description: 'x'.repeat(2001) },
  { name: 'Shirt', category: ' ' },
  { name: 'Shirt', category: 'x'.repeat(121) },
  { name: 'Shirt', brand: '' },
  { name: 'Shirt', brand: 'x'.repeat(121) },
  { name: 'Shirt', status: 'ACTIVE' },
  { name: 'Shirt', id: 'x' },
  { name: 'Shirt', merchantId: 'x' },
  { name: 'Shirt', sku: 'x' },
  { name: 'Shirt', price: 100 },
]) {
  void test(`rejects invalid Product creation ${JSON.stringify(input).slice(0, 100)}`, () => {
    assert.equal(createProductSchema.safeParse(input).success, false);
  });
}

void test('Product patch accepts nullable clearing and every lifecycle status', () => {
  assert.deepEqual(productPatchSchema.parse({ name: ' New name ' }), {
    name: 'New name',
  });
  assert.deepEqual(
    productPatchSchema.parse({
      description: null,
      category: null,
      brand: null,
      status: 'ARCHIVED',
    }),
    { description: null, category: null, brand: null, status: 'ARCHIVED' },
  );
  for (const status of ['ACTIVE', 'INACTIVE', 'ARCHIVED']) {
    assert.equal(productPatchSchema.safeParse({ status }).success, true);
  }
});

for (const input of [
  {},
  { name: '' },
  { status: 'DELETED' },
  { id: 'x' },
  { merchantId: 'x' },
  { sku: 'x' },
  { price: 100 },
]) {
  void test(`rejects invalid Product patch ${JSON.stringify(input)}`, () => {
    assert.equal(productPatchSchema.safeParse(input).success, false);
  });
}

void test('Product list query applies defaults, coercion, and combined filters', () => {
  assert.deepEqual(productListQuerySchema.parse({}), { page: 1, pageSize: 20 });
  assert.deepEqual(
    productListQuerySchema.parse({
      q: ' shirt ',
      status: 'ACTIVE',
      category: ' Apparel ',
      brand: ' Acme ',
      page: '2',
      pageSize: '50',
    }),
    {
      q: 'shirt',
      status: 'ACTIVE',
      category: 'Apparel',
      brand: 'Acme',
      page: 2,
      pageSize: 50,
    },
  );
});

for (const query of [
  { page: '0' },
  { page: '-1' },
  { page: '1.5' },
  { pageSize: '0' },
  { pageSize: '101' },
  { q: ' ' },
  { q: 'x'.repeat(101) },
  { status: 'DISABLED' },
  { category: '' },
  { brand: ' ' },
  { unknown: 'x' },
]) {
  void test(`rejects invalid Product query ${JSON.stringify(query).slice(0, 100)}`, () => {
    assert.equal(productListQuerySchema.safeParse(query).success, false);
  });
}
