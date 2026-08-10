import assert from 'node:assert/strict';
import test from 'node:test';

import { merchantProfilePatchSchema } from './merchant-profile.schema';

void test('accepts and trims a valid displayName', () => {
  assert.deepEqual(
    merchantProfilePatchSchema.parse({ displayName: ' Shop ' }),
    {
      displayName: 'Shop',
    },
  );
});

for (const displayName of ['', '   ', 'x'.repeat(161)]) {
  void test(`rejects invalid displayName length ${displayName.length}`, () => {
    assert.equal(
      merchantProfilePatchSchema.safeParse({ displayName }).success,
      false,
    );
  });
}

void test('accepts, trims, and clears legalName explicitly', () => {
  assert.deepEqual(merchantProfilePatchSchema.parse({ legalName: ' Legal ' }), {
    legalName: 'Legal',
  });
  assert.deepEqual(merchantProfilePatchSchema.parse({ legalName: null }), {
    legalName: null,
  });
});

void test('rejects blank and oversized legalName strings', () => {
  for (const legalName of ['', '   ', 'x'.repeat(201)]) {
    assert.equal(
      merchantProfilePatchSchema.safeParse({ legalName }).success,
      false,
    );
  }
});

void test('normalizes supported Uganda phone forms and accepts null', () => {
  for (const phone of [
    '+256772123456',
    '256772123456',
    '0772123456',
    '0772 123 456',
    '0772-123-456',
  ]) {
    assert.deepEqual(merchantProfilePatchSchema.parse({ phone }), {
      phone: '+256772123456',
    });
  }
  assert.deepEqual(merchantProfilePatchSchema.parse({ phone: null }), {
    phone: null,
  });
});

void test('rejects malformed merchant phone input', () => {
  for (const phone of ['', '772123456', '+255772123456', '+256abc123456']) {
    assert.equal(
      merchantProfilePatchSchema.safeParse({ phone }).success,
      false,
    );
  }
});

void test('trims and lowercases a valid email and accepts null', () => {
  assert.deepEqual(
    merchantProfilePatchSchema.parse({ email: ' Shop@Example.COM ' }),
    { email: 'shop@example.com' },
  );
  assert.deepEqual(merchantProfilePatchSchema.parse({ email: null }), {
    email: null,
  });
});

void test('rejects invalid, blank, and oversized email strings', () => {
  for (const email of ['', '   ', 'not-an-email', `${'a'.repeat(315)}@x.com`]) {
    assert.equal(
      merchantProfilePatchSchema.safeParse({ email }).success,
      false,
    );
  }
});

void test('rejects empty profile patches and unknown or cross-domain fields', () => {
  for (const value of [
    {},
    { status: 'SUSPENDED' },
    { currency: 'UGX' },
    { merchantId: 'merchant' },
    { displayName: 'Valid', unknown: true },
  ]) {
    assert.equal(merchantProfilePatchSchema.safeParse(value).success, false);
  }
});
