import assert from 'node:assert/strict';
import test from 'node:test';

import { InternalServerErrorException } from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import { MerchantService } from './merchant.service';
import type {
  MerchantProfileRecord,
  MerchantProfileStorePatch,
  MerchantSettingsRecord,
  MerchantSettingsStorePatch,
  MerchantStore,
} from './merchant.store';

const CONTEXT: ResolvedMerchantContext = {
  merchant: { id: 'merchant-context-id', displayName: 'Context Merchant' },
  membership: { id: 'membership-id' },
  roles: [],
  permissions: new Set(),
};

class RecordingStore implements MerchantStore {
  public readonly calls: unknown[][] = [];
  public profile: MerchantProfileRecord | null = {
    id: CONTEXT.merchant.id,
    displayName: 'Shop',
    legalName: 'Shop Limited',
    phoneE164: '+256772123456',
    email: 'shop@example.com',
  };
  public settings: MerchantSettingsRecord | null = {
    currency: 'UGX',
    timezone: 'Africa/Kampala',
  };

  public getProfile(merchantId: string): Promise<MerchantProfileRecord | null> {
    this.calls.push(['getProfile', merchantId]);
    return Promise.resolve(this.profile);
  }

  public updateProfile(
    merchantId: string,
    patch: MerchantProfileStorePatch,
  ): Promise<MerchantProfileRecord> {
    this.calls.push(['updateProfile', merchantId, patch]);
    if (this.profile === null) return Promise.reject(new Error('missing'));
    this.profile = { ...this.profile, ...patch };
    return Promise.resolve(this.profile);
  }

  public getSettings(
    merchantId: string,
  ): Promise<MerchantSettingsRecord | null> {
    this.calls.push(['getSettings', merchantId]);
    return Promise.resolve(this.settings);
  }

  public updateSettings(
    merchantId: string,
    patch: MerchantSettingsStorePatch,
  ): Promise<MerchantSettingsRecord> {
    this.calls.push(['updateSettings', merchantId, patch]);
    if (this.settings === null) return Promise.reject(new Error('missing'));
    this.settings = { ...this.settings, ...patch };
    return Promise.resolve(this.settings);
  }
}

void test('reads profile and settings only by resolved context Merchant id', async () => {
  const store = new RecordingStore();
  const service = new MerchantService(store);
  assert.deepEqual(await service.getProfile(CONTEXT), {
    id: CONTEXT.merchant.id,
    displayName: 'Shop',
    legalName: 'Shop Limited',
    phone: '+256772123456',
    email: 'shop@example.com',
  });
  assert.deepEqual(await service.getSettings(CONTEXT), store.settings);
  assert.deepEqual(store.calls, [
    ['getProfile', CONTEXT.merchant.id],
    ['getSettings', CONTEXT.merchant.id],
  ]);
});

void test('profile update maps normalized public fields to the narrow store patch', async () => {
  const store = new RecordingStore();
  const service = new MerchantService(store);
  const result = await service.updateProfile(CONTEXT, {
    displayName: 'New Shop',
    legalName: null,
    phone: '+256700000001',
    email: 'new@example.com',
  });
  assert.deepEqual(store.calls, [
    [
      'updateProfile',
      CONTEXT.merchant.id,
      {
        displayName: 'New Shop',
        legalName: null,
        phoneE164: '+256700000001',
        email: 'new@example.com',
      },
    ],
  ]);
  assert.deepEqual(result, {
    id: CONTEXT.merchant.id,
    displayName: 'New Shop',
    legalName: null,
    phone: '+256700000001',
    email: 'new@example.com',
  });
  assert.equal(JSON.stringify(result).includes('phoneE164'), false);
});

void test('settings update sends only canonical values under context Merchant id', async () => {
  const store = new RecordingStore();
  const service = new MerchantService(store);
  assert.deepEqual(
    await service.updateSettings(CONTEXT, {
      currency: 'USD',
      timezone: 'Africa/Nairobi',
    }),
    { currency: 'USD', timezone: 'Africa/Nairobi' },
  );
  assert.deepEqual(store.calls, [
    [
      'updateSettings',
      CONTEXT.merchant.id,
      { currency: 'USD', timezone: 'Africa/Nairobi' },
    ],
  ]);
});

void test('never substitutes User or raw route ids for context Merchant id', async () => {
  const store = new RecordingStore();
  const service = new MerchantService(store);
  await service.updateProfile(CONTEXT, { displayName: 'Safe' });
  assert.equal(JSON.stringify(store.calls).includes('user-id'), false);
  assert.equal(JSON.stringify(store.calls).includes('route-id'), false);
  assert.equal(JSON.stringify(store.calls).includes(CONTEXT.merchant.id), true);
});

void test('missing records and store failures become generic internal errors', async () => {
  const store = new RecordingStore();
  store.profile = null;
  const service = new MerchantService(store);
  await assert.rejects(() => service.getProfile(CONTEXT), {
    name: InternalServerErrorException.name,
    status: 500,
    message: 'Internal Server Error',
  });
  await assert.rejects(
    () => service.updateProfile(CONTEXT, { displayName: 'Missing' }),
    { status: 500, message: 'Internal Server Error' },
  );
});
