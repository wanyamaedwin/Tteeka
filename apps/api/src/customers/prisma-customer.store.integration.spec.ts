import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { DatabaseService } from '../database/database.service';
import { createCustomerSchema } from './customer.schema';
import { CustomerPhoneAlreadyExistsError } from './customer.store';
import { PrismaCustomerStore } from './prisma-customer.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Customer store tests require DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const store = new PrismaCustomerStore({ client } as DatabaseService);
const PREFIX = 'B5 Customer Store Test';

async function merchant(label: string) {
  return client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
}

async function cleanup(): Promise<void> {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const merchantIds = merchants.map(({ id }) => id);
  await client.deliveryLocation.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.customer.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.merchant.deleteMany({ where: { id: { in: merchantIds } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('creates canonical Merchant-owned Customers and allows the same phone cross-Merchant', async () => {
  const [a, b] = await Promise.all([merchant('Cross A'), merchant('Cross B')]);
  const input = createCustomerSchema.parse({
    phone: '0712345678',
    name: ' Sarah ',
  });
  const [customerA, customerB] = await Promise.all([
    store.createCustomer(a.id, input),
    store.createCustomer(b.id, input),
  ]);
  assert.equal(customerA.phone, '+256712345678');
  assert.equal(customerB.phone, '+256712345678');
  assert.equal(customerA.name, 'Sarah');
  assert.notEqual(customerA.id, customerB.id);
});

void test('concurrent canonical duplicates create exactly one Customer and archived phone remains reserved', async () => {
  const owner = await merchant('Concurrent');
  const inputs = [
    createCustomerSchema.parse({ phone: '0712345678' }),
    createCustomerSchema.parse({ phone: '+256712345678' }),
  ];
  const results = await Promise.allSettled(
    inputs.map((input) => store.createCustomer(owner.id, input)),
  );
  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  const rejection = results.find(({ status }) => status === 'rejected');
  assert.equal(
    rejection?.status === 'rejected' &&
      rejection.reason instanceof CustomerPhoneAlreadyExistsError,
    true,
  );
  const customer = await client.customer.findFirstOrThrow({
    where: { merchantId: owner.id, phone: '+256712345678' },
  });
  assert.equal(
    await client.customer.count({
      where: { merchantId: owner.id, phone: '+256712345678' },
    }),
    1,
  );
  await store.updateCustomer(owner.id, customer.id, { status: 'ARCHIVED' });
  await assert.rejects(
    () => store.createCustomer(owner.id, inputs[0]!),
    CustomerPhoneAlreadyExistsError,
  );
});

void test('Customer update, clear, phone conflict, lifecycle, search, filters, ordering, and pagination work', async () => {
  const owner = await merchant('Customer operations');
  const alpha = await store.createCustomer(owner.id, {
    phone: '+256712345671',
    name: 'Alpha',
  });
  const unnamed = await store.createCustomer(owner.id, {
    phone: '+256712345672',
  });
  const beta = await store.createCustomer(owner.id, {
    phone: '+256712345673',
    name: 'Beta',
  });
  const renamed = await store.updateCustomer(owner.id, unnamed.id, {
    name: 'Aaron',
    phone: '+256712345674',
  });
  assert.deepEqual([renamed?.name, renamed?.phone], ['Aaron', '+256712345674']);
  assert.equal(
    (await store.updateCustomer(owner.id, renamed!.id, { name: null }))?.name,
    null,
  );
  await assert.rejects(
    () => store.updateCustomer(owner.id, beta.id, { phone: alpha.phone }),
    CustomerPhoneAlreadyExistsError,
  );
  assert.equal(
    (await store.updateCustomer(owner.id, beta.id, { status: 'ARCHIVED' }))
      ?.status,
    'ARCHIVED',
  );
  assert.equal(
    (await store.updateCustomer(owner.id, beta.id, { status: 'ACTIVE' }))
      ?.status,
    'ACTIVE',
  );
  const q = await store.listCustomers(owner.id, {
    q: 'alp',
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(
    q.rows.map(({ id }) => id),
    [alpha.id],
  );
  const phone = await store.listCustomers(owner.id, {
    phone: '+256712345674',
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(
    phone.rows.map(({ id }) => id),
    [unnamed.id],
  );
  await store.updateCustomer(owner.id, beta.id, { status: 'ARCHIVED' });
  const archived = await store.listCustomers(owner.id, {
    status: 'ARCHIVED',
    page: 1,
    pageSize: 1,
  });
  assert.equal(archived.total, 1);
  assert.equal(archived.rows[0]?.id, beta.id);
  const ordered = await store.listCustomers(owner.id, {
    page: 1,
    pageSize: 2,
  });
  assert.deepEqual(
    ordered.rows.map(({ name }) => name),
    ['Alpha', 'Beta'],
  );
});

void test('DeliveryLocations support independent contact, nullable fields, duplicates, lifecycle, and concealment', async () => {
  const [owner, foreign] = await Promise.all([
    merchant('Locations owner'),
    merchant('Locations foreign'),
  ]);
  const customer = await store.createCustomer(owner.id, {
    phone: '+256712345678',
    name: 'Owner customer',
  });
  const otherCustomer = await store.createCustomer(owner.id, {
    phone: '+256712345679',
  });
  const foreignCustomer = await store.createCustomer(foreign.id, {
    phone: '+256712345678',
  });
  const input = {
    area: 'Kira',
    landmark: 'Near Shell',
    phone: '+256772222222',
    instructions: null,
    mapPinUrl: null,
  } as const;
  const first = await store.createDeliveryLocation(
    owner.id,
    customer.id,
    input,
  );
  const duplicate = await store.createDeliveryLocation(
    owner.id,
    customer.id,
    input,
  );
  assert.notEqual(first?.id, duplicate?.id);
  assert.equal(first?.phone, '+256772222222');
  assert.equal(first?.instructions, null);
  assert.equal(first?.mapPinUrl, null);
  const list = await store.listDeliveryLocations(owner.id, customer.id, {
    page: 1,
    pageSize: 20,
  });
  assert.equal(list?.total, 2);
  assert.equal(
    (await store.findDeliveryLocation(owner.id, customer.id, first.id))?.id,
    first?.id,
  );
  assert.equal(
    await store.findDeliveryLocation(owner.id, otherCustomer.id, first.id),
    null,
  );
  assert.equal(
    await store.findDeliveryLocation(foreign.id, foreignCustomer.id, first.id),
    null,
  );
  const archived = await store.updateDeliveryLocation(
    owner.id,
    customer.id,
    first.id,
    { status: 'ARCHIVED', instructions: 'Call on arrival.' },
  );
  assert.equal(archived?.status, 'ARCHIVED');
  assert.equal(
    (await store.findCustomer(owner.id, customer.id))?.status,
    'ACTIVE',
  );
  const restored = await store.updateDeliveryLocation(
    owner.id,
    customer.id,
    first.id,
    {
      status: 'ACTIVE',
      area: 'Ntinda',
      landmark: 'Opposite Quality',
      mapPinUrl: 'https://maps.example/pin',
      instructions: null,
    },
  );
  assert.deepEqual(
    [restored?.status, restored?.area, restored?.instructions],
    ['ACTIVE', 'Ntinda', null],
  );
  await store.updateCustomer(owner.id, customer.id, { status: 'ARCHIVED' });
  assert.equal(
    (await store.findDeliveryLocation(owner.id, customer.id, first.id))?.status,
    'ACTIVE',
  );
});

void test('database constraints enforce canonical phones, nonblank fields, tenant FK, and restrictive ownership', async () => {
  const [a, b] = await Promise.all([
    merchant('Constraints A'),
    merchant('Constraints B'),
  ]);
  const customer = await store.createCustomer(a.id, {
    phone: '+256712345678',
  });
  await assert.rejects(() =>
    client.customer.create({ data: { merchantId: a.id, phone: '0712345678' } }),
  );
  await assert.rejects(() =>
    client.customer.create({
      data: { merchantId: a.id, phone: '+256712345679', name: ' ' },
    }),
  );
  await assert.rejects(() =>
    client.deliveryLocation.create({
      data: {
        merchantId: b.id,
        customerId: customer.id,
        area: 'Kira',
        landmark: 'Near Shell',
        phone: '+256772222222',
      },
    }),
  );
  const location = await client.deliveryLocation.create({
    data: {
      merchantId: a.id,
      customerId: customer.id,
      area: 'Kira',
      landmark: 'Near Shell',
      phone: '+256772222222',
    },
  });
  assert.equal(location.customerId, customer.id);
  await assert.rejects(() =>
    client.customer.delete({ where: { id: customer.id } }),
  );
});
