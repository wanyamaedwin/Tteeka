import assert from 'node:assert/strict';
import test from 'node:test';

import { BadRequestException } from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import { MerchantController } from './merchant.controller';
import type { MerchantService } from './merchant.service';

const CONTEXT: ResolvedMerchantContext = {
  merchant: { id: 'merchant-id', displayName: 'Merchant' },
  membership: { id: 'membership-id' },
  roles: [],
  permissions: new Set(),
};

function responseHeaders(): {
  headers: Map<string, string>;
  response: { setHeader(name: string, value: string): void };
} {
  const headers = new Map<string, string>();
  return {
    headers,
    response: { setHeader: (name, value) => headers.set(name, value) },
  };
}

void test('returns bounded profile and settings with private cache headers', async () => {
  const service = {
    getProfile: () =>
      Promise.resolve({
        id: 'merchant-id',
        displayName: 'Merchant',
        legalName: null,
        phone: null,
        email: null,
      }),
    getSettings: () =>
      Promise.resolve({ currency: 'UGX', timezone: 'Africa/Kampala' }),
  } as unknown as MerchantService;
  const controller = new MerchantController(service);
  const profileResponse = responseHeaders();
  const settingsResponse = responseHeaders();
  assert.deepEqual(
    await controller.getProfile(CONTEXT, profileResponse.response),
    {
      id: 'merchant-id',
      displayName: 'Merchant',
      legalName: null,
      phone: null,
      email: null,
    },
  );
  assert.deepEqual(
    await controller.getSettings(CONTEXT, settingsResponse.response),
    { currency: 'UGX', timezone: 'Africa/Kampala' },
  );
  for (const headers of [profileResponse.headers, settingsResponse.headers]) {
    assert.equal(headers.get('Cache-Control'), 'no-store');
    assert.equal(headers.get('Pragma'), 'no-cache');
  }
});

void test('valid PATCH bodies reach service only after normalization', async () => {
  const calls: unknown[] = [];
  const service = {
    updateProfile: (context: unknown, patch: unknown) => {
      calls.push(['profile', context, patch]);
      return Promise.resolve({});
    },
    updateSettings: (context: unknown, patch: unknown) => {
      calls.push(['settings', context, patch]);
      return Promise.resolve({});
    },
  } as unknown as MerchantService;
  const controller = new MerchantController(service);
  await controller.updateProfile(
    CONTEXT,
    { phone: '0772 123 456', email: ' SHOP@EXAMPLE.COM ' },
    responseHeaders().response,
  );
  await controller.updateSettings(
    CONTEXT,
    { currency: ' ugx ', timezone: ' Africa/Kampala ' },
    responseHeaders().response,
  );
  assert.deepEqual(calls, [
    ['profile', CONTEXT, { phone: '+256772123456', email: 'shop@example.com' }],
    ['settings', CONTEXT, { currency: 'UGX', timezone: 'Africa/Kampala' }],
  ]);
});

void test('invalid or empty PATCH bodies fail before service execution', async () => {
  let calls = 0;
  const service = {
    updateProfile: () => {
      calls += 1;
      return Promise.resolve({});
    },
    updateSettings: () => {
      calls += 1;
      return Promise.resolve({});
    },
  } as unknown as MerchantService;
  const controller = new MerchantController(service);
  await assert.rejects(
    () => controller.updateProfile(CONTEXT, {}, responseHeaders().response),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      controller.updateSettings(
        CONTEXT,
        { timezone: 'Not/A_Timezone' },
        responseHeaders().response,
      ),
    BadRequestException,
  );
  assert.equal(calls, 0);
});
