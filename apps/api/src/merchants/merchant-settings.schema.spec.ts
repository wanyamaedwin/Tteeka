import assert from 'node:assert/strict';
import test from 'node:test';

import { merchantSettingsPatchSchema } from './merchant-settings.schema';

void test('accepts uppercase currency and canonicalizes mixed case', () => {
  assert.deepEqual(merchantSettingsPatchSchema.parse({ currency: 'UGX' }), {
    currency: 'UGX',
  });
  assert.deepEqual(merchantSettingsPatchSchema.parse({ currency: ' uGx ' }), {
    currency: 'UGX',
  });
});

void test('rejects invalid currency length, numbers, and symbols', () => {
  for (const currency of ['UG', 'UGXX', 'U1X', 'U$X', '€€€']) {
    assert.equal(
      merchantSettingsPatchSchema.safeParse({ currency }).success,
      false,
    );
  }
});

void test('accepts Kampala and alternate IANA timezones', () => {
  assert.deepEqual(
    merchantSettingsPatchSchema.parse({ timezone: ' Africa/Kampala ' }),
    { timezone: 'Africa/Kampala' },
  );
  assert.equal(
    merchantSettingsPatchSchema.parse({ timezone: 'America/New_York' })
      .timezone,
    'America/New_York',
  );
});

void test('canonicalizes reliably supported timezone aliases', () => {
  assert.equal(
    merchantSettingsPatchSchema.parse({ timezone: 'Etc/UTC' }).timezone,
    new Intl.DateTimeFormat('en-US', { timeZone: 'Etc/UTC' }).resolvedOptions()
      .timeZone,
  );
});

void test('rejects malformed and oversized timezones', () => {
  for (const timezone of ['Not/A_Timezone', '', 'x'.repeat(65)]) {
    assert.equal(
      merchantSettingsPatchSchema.safeParse({ timezone }).success,
      false,
    );
  }
});

void test('rejects empty settings patches, unknown fields, and profile fields', () => {
  for (const value of [
    {},
    { displayName: 'Shop' },
    { phone: '+256772123456' },
    { status: 'ACTIVE' },
    { currency: 'UGX', unknown: true },
  ]) {
    assert.equal(merchantSettingsPatchSchema.safeParse(value).success, false);
  }
});
