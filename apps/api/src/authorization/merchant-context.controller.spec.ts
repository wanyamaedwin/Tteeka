import assert from 'node:assert/strict';
import test from 'node:test';

import { MerchantContextController } from './merchant-context.controller';

void test('context endpoint maps safe sorted output and private cache headers', () => {
  const headers = new Map<string, string>();
  const body = new MerchantContextController().context(
    {
      merchant: { id: 'merchant', displayName: 'Merchant' },
      membership: { id: 'membership' },
      roles: [{ id: 'role', name: 'Role' }],
      permissions: new Set(['payment.read', 'order.read']),
    },
    { setHeader: (name, value) => headers.set(name, value) },
  );
  assert.deepEqual(body, {
    merchant: { id: 'merchant', displayName: 'Merchant' },
    membership: { id: 'membership' },
    roles: [{ id: 'role', name: 'Role' }],
    permissions: ['order.read', 'payment.read'],
  });
  assert.equal(headers.get('Cache-Control'), 'no-store');
  assert.equal(headers.get('Pragma'), 'no-cache');
  assert.equal(JSON.stringify(body).includes('status'), false);
});
