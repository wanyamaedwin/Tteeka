import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResolvedMerchantContext } from './merchant-context';
import { PermissionEvaluator } from './permission-evaluator';

function context(...permissionKeys: string[]): ResolvedMerchantContext {
  return {
    merchant: { id: 'merchant', displayName: 'Merchant' },
    membership: { id: 'membership' },
    roles: [],
    permissions: new Set(permissionKeys),
  };
}

const evaluator = new PermissionEvaluator();

void test('hasPermission uses exact granted keys', () => {
  const resolved = context('order.read');
  assert.equal(evaluator.hasPermission(resolved, 'order.read'), true);
  assert.equal(evaluator.hasPermission(resolved, 'payment.verify'), false);
  assert.equal(evaluator.hasPermission(resolved, 'Order.Read'), false);
});

void test('duplicate input grants behave as one set membership', () => {
  const resolved = context('order.read', 'order.read');
  assert.equal(resolved.permissions.size, 1);
  assert.equal(evaluator.hasPermission(resolved, 'order.read'), true);
});

void test('wildcard-looking keys remain literal', () => {
  const resolved = context('order.*');
  assert.equal(evaluator.hasPermission(resolved, 'order.*'), true);
  assert.equal(evaluator.hasPermission(resolved, 'order.read'), false);
});

void test('hasAllPermissions follows exact set semantics', () => {
  const resolved = context('order.read', 'order.create');
  assert.equal(
    evaluator.hasAllPermissions(resolved, ['order.read', 'order.create']),
    true,
  );
  assert.equal(
    evaluator.hasAllPermissions(resolved, ['order.read', 'payment.read']),
    false,
  );
  assert.equal(evaluator.hasAllPermissions(resolved, []), true);
});

void test('hasAnyPermission follows exact set semantics', () => {
  const resolved = context('order.read');
  assert.equal(
    evaluator.hasAnyPermission(resolved, ['payment.read', 'order.read']),
    true,
  );
  assert.equal(
    evaluator.hasAnyPermission(resolved, ['payment.read', 'order.create']),
    false,
  );
  assert.equal(evaluator.hasAnyPermission(resolved, []), false);
});
