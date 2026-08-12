import assert from 'node:assert/strict';
import test from 'node:test';

import { MERCHANT_PERMISSIONS } from '../merchants/merchant-permissions';
import { CATALOGUE_PERMISSIONS } from '../catalogue/catalogue-permissions';
import { INVENTORY_PERMISSIONS } from '../inventory/inventory-permissions';
import { CUSTOMER_PERMISSIONS } from '../customers/customer-permissions';
import { DELIVERY_PERMISSIONS } from '../deliveries/delivery-permissions';
import { ORDER_PERMISSIONS } from '../orders/order-permissions';
import { PAYMENT_PERMISSIONS } from '../payments/payment-permissions';
import { ACCESS_MANAGEMENT_PERMISSIONS } from './access-management-permissions';
import {
  APPLICATION_PERMISSION_CATALOG,
  APPLICATION_PERMISSION_KEYS,
} from './application-permission-catalog';

void test('defines the exact B2.2 Permission constants', () => {
  assert.deepEqual(ACCESS_MANAGEMENT_PERMISSIONS, {
    STAFF_READ: 'merchant.staff.read',
    STAFF_MANAGE: 'merchant.staff.manage',
    ROLES_READ: 'merchant.roles.read',
    ROLES_MANAGE: 'merchant.roles.manage',
  });
});

void test('catalog composes exactly the twenty-one implemented production keys', () => {
  assert.deepEqual(
    new Set(APPLICATION_PERMISSION_KEYS),
    new Set([
      ...Object.values(MERCHANT_PERMISSIONS),
      ...Object.values(ACCESS_MANAGEMENT_PERMISSIONS),
      ...Object.values(CATALOGUE_PERMISSIONS),
      ...Object.values(INVENTORY_PERMISSIONS),
      ...Object.values(CUSTOMER_PERMISSIONS),
      ...Object.values(DELIVERY_PERMISSIONS),
      ...Object.values(ORDER_PERMISSIONS),
      ...Object.values(PAYMENT_PERMISSIONS),
    ]),
  );
  assert.equal(APPLICATION_PERMISSION_KEYS.length, 21);
  assert.equal(new Set(APPLICATION_PERMISSION_KEYS).size, 21);
});

void test('catalog is deterministic, described, and excludes test keys', () => {
  assert.deepEqual(
    APPLICATION_PERMISSION_KEYS,
    [...APPLICATION_PERMISSION_KEYS].sort(),
  );
  assert.equal(
    APPLICATION_PERMISSION_CATALOG.every(
      ({ description }) => description.length > 0,
    ),
    true,
  );
  assert.equal(
    APPLICATION_PERMISSION_KEYS.some((key) => key.startsWith('test.')),
    false,
  );
  assert.equal(
    APPLICATION_PERMISSION_KEYS.some((key) =>
      ['inventory.hold', 'payment.manage'].includes(key),
    ),
    false,
  );
  assert.equal(
    APPLICATION_PERMISSION_KEYS.includes('catalogue.price.manage'),
    true,
  );
});
