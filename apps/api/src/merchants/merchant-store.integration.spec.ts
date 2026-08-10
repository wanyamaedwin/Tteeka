import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { DatabaseService } from '../database/database.service';
import { PrismaMerchantStore } from './prisma-merchant.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Merchant-store integration tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const store = new PrismaMerchantStore({ client } as DatabaseService);
const TEST_PREFIX = 'B2.1 Merchant Store Test';

async function cleanup(): Promise<void> {
  await client.merchant.deleteMany({
    where: { displayName: { startsWith: TEST_PREFIX } },
  });
}

before(cleanup);

after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('reads and updates bounded profile fields without changing settings or status', async () => {
  const merchant = await client.merchant.create({
    data: {
      displayName: `${TEST_PREFIX} ${randomUUID()}`,
      legalName: 'Original Limited',
      phoneE164: '+256772123456',
      email: 'original@example.com',
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    },
  });
  assert.deepEqual(await store.getProfile(merchant.id), {
    id: merchant.id,
    displayName: merchant.displayName,
    legalName: 'Original Limited',
    phoneE164: '+256772123456',
    email: 'original@example.com',
  });

  const updated = await store.updateProfile(merchant.id, {
    displayName: `${TEST_PREFIX} Updated`,
    legalName: 'Updated Limited',
    phoneE164: '+256700000001',
    email: 'updated@example.com',
  });
  assert.equal(updated.displayName, `${TEST_PREFIX} Updated`);
  assert.equal(updated.legalName, 'Updated Limited');
  assert.equal(updated.phoneE164, '+256700000001');
  assert.equal(updated.email, 'updated@example.com');
  const persisted = await client.merchant.findUniqueOrThrow({
    where: { id: merchant.id },
  });
  assert.equal(persisted.currency, 'UGX');
  assert.equal(persisted.timezone, 'Africa/Kampala');
  assert.equal(persisted.status, 'ACTIVE');
});

void test('nullable profile fields clear explicitly', async () => {
  const merchant = await client.merchant.create({
    data: {
      displayName: `${TEST_PREFIX} Clear ${randomUUID()}`,
      legalName: 'Clear Limited',
      phoneE164: '+256772123456',
      email: 'clear@example.com',
    },
  });
  assert.deepEqual(
    await store.updateProfile(merchant.id, {
      legalName: null,
      phoneE164: null,
      email: null,
    }),
    {
      id: merchant.id,
      displayName: merchant.displayName,
      legalName: null,
      phoneE164: null,
      email: null,
    },
  );
});

void test('settings updates preserve profile, status, and another Merchant', async () => {
  const merchantA = await client.merchant.create({
    data: {
      displayName: `${TEST_PREFIX} A ${randomUUID()}`,
      legalName: 'Merchant A Limited',
      phoneE164: '+256772123456',
      email: 'shared@example.com',
    },
  });
  const merchantB = await client.merchant.create({
    data: {
      displayName: `${TEST_PREFIX} B ${randomUUID()}`,
      legalName: 'Merchant B Limited',
      phoneE164: '+256700000002',
      email: 'shared@example.com',
      currency: 'EUR',
      timezone: 'Europe/Paris',
    },
  });
  assert.deepEqual(await store.getSettings(merchantA.id), {
    currency: 'UGX',
    timezone: 'Africa/Kampala',
  });
  assert.deepEqual(
    await store.updateSettings(merchantA.id, {
      currency: 'USD',
      timezone: 'America/New_York',
    }),
    { currency: 'USD', timezone: 'America/New_York' },
  );
  const [persistedA, persistedB] = await Promise.all([
    client.merchant.findUniqueOrThrow({ where: { id: merchantA.id } }),
    client.merchant.findUniqueOrThrow({ where: { id: merchantB.id } }),
  ]);
  assert.equal(persistedA.displayName, merchantA.displayName);
  assert.equal(persistedA.legalName, 'Merchant A Limited');
  assert.equal(persistedA.phoneE164, '+256772123456');
  assert.equal(persistedA.email, 'shared@example.com');
  assert.equal(persistedA.status, 'ACTIVE');
  assert.equal(persistedB.currency, 'EUR');
  assert.equal(persistedB.timezone, 'Europe/Paris');
  assert.equal(persistedB.displayName, merchantB.displayName);
});
