import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { DatabaseService } from '../database/database.service';
import { uuidV7Schema } from '../common/uuid-v7';
import { PrismaCatalogueStore } from './prisma-catalogue.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Catalogue store tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const store = new PrismaCatalogueStore({ client } as DatabaseService);
const PREFIX = 'B3.1 Catalogue Store Test';

async function merchant(label: string) {
  return client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
}

async function cleanup(): Promise<void> {
  await client.product.deleteMany({
    where: { merchant: { displayName: { startsWith: PREFIX } } },
  });
  await client.merchant.deleteMany({
    where: { displayName: { startsWith: PREFIX } },
  });
}

before(cleanup);
after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('Product persistence uses UUIDv7, ACTIVE default, nullable metadata, and permits duplicate names', async () => {
  const a = await merchant('A');
  const b = await merchant('B');
  const first = await store.createProduct(a.id, {
    name: 'Classic Shirt',
    description: null,
    category: null,
    brand: null,
  });
  const [second, foreign] = await Promise.all([
    store.createProduct(a.id, { name: 'Classic Shirt' }),
    store.createProduct(b.id, { name: 'Classic Shirt' }),
  ]);
  assert.equal(first.status, 'ACTIVE');
  assert.equal(uuidV7Schema().safeParse(first.id).success, true);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.id, foreign.id);
  assert.deepEqual(
    [first.description, first.category, first.brand],
    [null, null, null],
  );
  assert.equal(await store.findProduct(a.id, foreign.id), null);
  assert.equal((await store.findProduct(a.id, first.id))?.id, first.id);
});

void test('Product updates are tenant-scoped, nullable, lifecycle-preserving, and reversible', async () => {
  const a = await merchant('Update A');
  const b = await merchant('Update B');
  const product = await store.createProduct(a.id, {
    name: 'Original',
    description: 'Description',
    category: 'Category',
    brand: 'Brand',
  });
  assert.equal(
    await store.updateProduct(b.id, product.id, { name: 'Foreign mutation' }),
    null,
  );
  const inactive = await store.updateProduct(a.id, product.id, {
    name: 'Updated',
    description: null,
    category: null,
    brand: null,
    status: 'INACTIVE',
  });
  assert.equal(inactive?.name, 'Updated');
  assert.deepEqual(
    [inactive?.description, inactive?.category, inactive?.brand],
    [null, null, null],
  );
  assert.equal(inactive?.status, 'INACTIVE');
  assert.equal(
    (await store.updateProduct(a.id, product.id, { status: 'ARCHIVED' }))
      ?.status,
    'ARCHIVED',
  );
  assert.equal(
    (await store.updateProduct(a.id, product.id, { status: 'ACTIVE' }))?.status,
    'ACTIVE',
  );
  assert.equal(
    (await client.product.findUnique({ where: { id: product.id } }))?.id,
    product.id,
  );
});

void test('Product list is isolated, searchable, filterable, deterministic, and paginated consistently', async () => {
  const a = await merchant('List A');
  const b = await merchant('List B');
  await Promise.all([
    store.createProduct(a.id, {
      name: 'Zulu Bag',
      description: 'Hand woven travel item',
      category: 'Accessories',
      brand: 'Acme',
    }),
    store.createProduct(a.id, {
      name: 'Alpha Shirt',
      description: 'Cotton',
      category: 'Apparel',
      brand: 'Tteeka',
    }),
    store.createProduct(a.id, {
      name: 'Beta Shirt',
      category: 'Apparel',
      brand: 'Acme',
    }),
    store.createProduct(b.id, { name: 'Foreign Shirt', brand: 'Acme' }),
  ]);
  const all = await store.listProducts(a.id, { page: 1, pageSize: 2 });
  assert.equal(all.total, 3);
  assert.deepEqual(
    all.rows.map(({ name }) => name),
    ['Alpha Shirt', 'Beta Shirt'],
  );
  const page2 = await store.listProducts(a.id, { page: 2, pageSize: 2 });
  assert.deepEqual(
    page2.rows.map(({ name }) => name),
    ['Zulu Bag'],
  );
  const empty = await store.listProducts(a.id, { page: 9, pageSize: 2 });
  assert.equal(empty.total, 3);
  assert.deepEqual(empty.rows, []);
  const search = await store.listProducts(a.id, {
    q: 'woven',
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(
    search.rows.map(({ name }) => name),
    ['Zulu Bag'],
  );
  const combined = await store.listProducts(a.id, {
    q: 'shirt',
    status: 'ACTIVE',
    category: 'apparel',
    brand: 'ACME',
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(
    combined.rows.map(({ name }) => name),
    ['Beta Shirt'],
  );
});

void test('concurrent duplicate Product names create two distinct rows', async () => {
  const owner = await merchant('Concurrent');
  const [a, b] = await Promise.all([
    store.createProduct(owner.id, { name: 'Same name' }),
    store.createProduct(owner.id, { name: 'Same name' }),
  ]);
  assert.notEqual(a.id, b.id);
  assert.equal(
    await client.product.count({
      where: { merchantId: owner.id, name: 'Same name' },
    }),
    2,
  );
});
