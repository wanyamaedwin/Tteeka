import assert from 'node:assert/strict';
import test from 'node:test';

import { customerListQuerySchema } from './customer-query.schema';
import { createCustomerSchema, customerPatchSchema } from './customer.schema';
import { deliveryLocationListQuerySchema } from './delivery-location-query.schema';
import {
  createDeliveryLocationSchema,
  deliveryLocationPatchSchema,
} from './delivery-location.schema';

for (const phone of [
  '0712345678',
  '712345678',
  '256712345678',
  '+256712345678',
]) {
  void test(`canonicalizes supported Customer phone ${phone}`, () => {
    assert.equal(createCustomerSchema.parse({ phone }).phone, '+256712345678');
  });
}

void test('Customer create supports omitted/null/trimmed name and rejects extra fields', () => {
  assert.deepEqual(createCustomerSchema.parse({ phone: '0712345678' }), {
    phone: '+256712345678',
  });
  assert.equal(
    createCustomerSchema.parse({ phone: '0712345678', name: null }).name,
    null,
  );
  assert.equal(
    createCustomerSchema.parse({ phone: '0712345678', name: ' Sarah ' }).name,
    'Sarah',
  );
  assert.equal(
    createCustomerSchema.safeParse({ phone: '0712345678', status: 'ACTIVE' })
      .success,
    false,
  );
});

for (const value of [
  { phone: '123' },
  { phone: '0712345678', name: '' },
  { phone: '0712345678', name: '   ' },
  { phone: '0712345678', name: 'x'.repeat(161) },
]) {
  void test(`rejects invalid Customer create ${JSON.stringify(value)}`, () => {
    assert.equal(createCustomerSchema.safeParse(value).success, false);
  });
}

void test('Customer PATCH is strict, nonempty, normalizing, nullable, and status-bounded', () => {
  assert.deepEqual(customerPatchSchema.parse({ phone: '712345678' }), {
    phone: '+256712345678',
  });
  assert.deepEqual(customerPatchSchema.parse({ name: null }), { name: null });
  for (const patch of [
    {},
    { status: 'INACTIVE' },
    { unknown: 'x' },
    { name: ' ' },
  ]) {
    assert.equal(customerPatchSchema.safeParse(patch).success, false);
  }
  for (const status of ['ACTIVE', 'ARCHIVED']) {
    assert.equal(customerPatchSchema.safeParse({ status }).success, true);
  }
});

void test('Customer query normalizes exact phone with bounded deterministic defaults', () => {
  assert.deepEqual(customerListQuerySchema.parse({ phone: '0712345678' }), {
    phone: '+256712345678',
    page: 1,
    pageSize: 20,
  });
  assert.equal(
    customerListQuerySchema.safeParse({
      q: ' Sarah ',
      status: 'ARCHIVED',
      page: '2',
      pageSize: '100',
    }).success,
    true,
  );
  for (const query of [
    { q: ' ' },
    { phone: 'bad' },
    { status: 'INACTIVE' },
    { page: '0' },
    { pageSize: '101' },
    { unknown: 'x' },
  ]) {
    assert.equal(customerListQuerySchema.safeParse(query).success, false);
  }
});

void test('DeliveryLocation create normalizes Uganda-specific fields and nullable blanks', () => {
  assert.deepEqual(
    createDeliveryLocationSchema.parse({
      area: ' Kira ',
      landmark: ' Near Shell Kira ',
      phone: '772222222',
      instructions: ' ',
      mapPinUrl: ' ',
    }),
    {
      area: 'Kira',
      landmark: 'Near Shell Kira',
      phone: '+256772222222',
      instructions: null,
      mapPinUrl: null,
    },
  );
});

void test('DeliveryLocation validation requires bounded area, landmark, phone, and HTTP(S) URL', () => {
  const valid = {
    area: 'Kira',
    landmark: 'Near Shell',
    phone: '0772222222',
  };
  for (const body of [
    { ...valid, area: '' },
    { ...valid, area: 'x'.repeat(121) },
    { ...valid, landmark: ' ' },
    { ...valid, landmark: 'x'.repeat(241) },
    { ...valid, phone: 'bad' },
    { ...valid, instructions: 'x'.repeat(501) },
    { ...valid, mapPinUrl: 'not-a-url' },
    { ...valid, mapPinUrl: 'ftp://example.com/pin' },
    { ...valid, unknown: 'x' },
  ]) {
    assert.equal(createDeliveryLocationSchema.safeParse(body).success, false);
  }
  assert.equal(
    createDeliveryLocationSchema.safeParse({
      ...valid,
      mapPinUrl: 'https://maps.example/pin',
    }).success,
    true,
  );
});

void test('DeliveryLocation PATCH is strict, nonempty, nullable, and lifecycle-bounded', () => {
  assert.deepEqual(
    deliveryLocationPatchSchema.parse({ instructions: '', mapPinUrl: null }),
    { instructions: null, mapPinUrl: null },
  );
  for (const patch of [
    {},
    { area: null },
    { landmark: '' },
    { phone: null },
    { status: 'INACTIVE' },
    { unknown: 'x' },
  ]) {
    assert.equal(deliveryLocationPatchSchema.safeParse(patch).success, false);
  }
});

void test('DeliveryLocation query has bounded status and pagination only', () => {
  assert.deepEqual(deliveryLocationListQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
  });
  assert.equal(
    deliveryLocationListQuerySchema.safeParse({
      status: 'ACTIVE',
      page: '2',
      pageSize: '100',
    }).success,
    true,
  );
  for (const query of [
    { status: 'INACTIVE' },
    { page: '0' },
    { pageSize: '101' },
    { q: 'Kira' },
  ]) {
    assert.equal(
      deliveryLocationListQuerySchema.safeParse(query).success,
      false,
    );
  }
});
