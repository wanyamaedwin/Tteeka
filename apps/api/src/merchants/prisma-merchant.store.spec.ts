import assert from 'node:assert/strict';
import test from 'node:test';

import type { DatabaseService } from '../database/database.service';
import { PrismaMerchantStore } from './prisma-merchant.store';

void test('uses only the Merchant delegate and supplied merchantId', async () => {
  const queries: unknown[] = [];
  const merchant = {
    findUnique: (query: unknown) => {
      queries.push(['findUnique', query]);
      return Promise.resolve(null);
    },
    update: (query: unknown) => {
      queries.push(['update', query]);
      return Promise.resolve({ currency: 'UGX', timezone: 'Africa/Kampala' });
    },
  };
  const store = new PrismaMerchantStore({
    client: { merchant },
  } as unknown as DatabaseService);

  await store.getProfile('merchant-id');
  await store.updateSettings('merchant-id', { currency: 'UGX' });
  assert.equal(queries.length, 2);
  assert.equal(JSON.stringify(queries).includes('merchant-id'), true);
  for (const forbidden of [
    'user',
    'session',
    'membership',
    'role',
    'permission',
  ]) {
    assert.equal(
      JSON.stringify(queries).toLowerCase().includes(forbidden),
      false,
    );
  }
});

void test('profile and settings operations select only their bounded fields', async () => {
  const queries: unknown[] = [];
  const merchant = {
    findUnique: (query: unknown) => {
      queries.push(query);
      return Promise.resolve(null);
    },
    update: (query: unknown) => {
      queries.push(query);
      return Promise.resolve({});
    },
  };
  const store = new PrismaMerchantStore({
    client: { merchant },
  } as unknown as DatabaseService);
  await store.getProfile('merchant-id');
  await store.updateProfile('merchant-id', { displayName: 'Shop' });
  await store.getSettings('merchant-id');
  await store.updateSettings('merchant-id', { timezone: 'Africa/Kampala' });
  const serialized = JSON.stringify(queries);
  for (const forbidden of ['status', 'createdAt', 'updatedAt']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
