import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AuthorizationContextRecord,
  AuthorizationStore,
} from './authorization.store';
import {
  FORBIDDEN_MESSAGE,
  MerchantContextService,
} from './merchant-context.service';

const USER_ID = '018f0000-0000-7000-8000-000000000001';
const MERCHANT_ID = '018f0000-0000-7000-8000-000000000002';

function role(options: {
  id: string;
  name: string;
  status?: 'ACTIVE' | 'DISABLED';
  permissions?: readonly {
    key: string;
    status?: 'ACTIVE' | 'DEPRECATED';
  }[];
}): AuthorizationContextRecord['membershipRoles'][number] {
  return {
    role: {
      id: options.id,
      name: options.name,
      status: options.status ?? 'ACTIVE',
      rolePermissions: (options.permissions ?? []).map((permission) => ({
        permission: {
          key: permission.key,
          status: permission.status ?? 'ACTIVE',
        },
      })),
    },
  };
}

function record(
  overrides: Partial<AuthorizationContextRecord> = {},
): AuthorizationContextRecord {
  return {
    id: '018f0000-0000-7000-8000-000000000003',
    status: 'ACTIVE',
    merchant: {
      id: MERCHANT_ID,
      displayName: 'Synthetic Merchant',
      status: 'ACTIVE',
    },
    membershipRoles: [],
    ...overrides,
  };
}

function serviceFor(found: AuthorizationContextRecord | null) {
  const calls: unknown[][] = [];
  const store: AuthorizationStore = {
    findMerchantContextForUser: (...args) => {
      calls.push(args);
      return Promise.resolve(found);
    },
  };
  return { service: new MerchantContextService(store), calls };
}

void test('active Merchant and Membership resolve empty Role and Permission sets', async () => {
  const fake = serviceFor(record());
  const context = await fake.service.resolve(USER_ID, MERCHANT_ID);
  assert.deepEqual(fake.calls, [[USER_ID, MERCHANT_ID]]);
  assert.deepEqual(context.merchant, {
    id: MERCHANT_ID,
    displayName: 'Synthetic Merchant',
  });
  assert.deepEqual(context.membership, {
    id: '018f0000-0000-7000-8000-000000000003',
  });
  assert.deepEqual(context.roles, []);
  assert.deepEqual([...context.permissions], []);
});

for (const [description, found] of [
  ['missing context', null],
  ['disabled Membership', record({ status: 'DISABLED' })],
  [
    'suspended Merchant',
    record({ merchant: { ...record().merchant, status: 'SUSPENDED' } }),
  ],
  [
    'archived Merchant',
    record({ merchant: { ...record().merchant, status: 'ARCHIVED' } }),
  ],
] as const) {
  void test(`${description} receives the generic forbidden result`, async () => {
    await assert.rejects(
      serviceFor(found).service.resolve(USER_ID, MERCHANT_ID),
      { status: 403, message: FORBIDDEN_MESSAGE },
    );
  });
}

void test('filters lifecycle state, deduplicates permissions, and sorts output', async () => {
  const fake = serviceFor(
    record({
      membershipRoles: [
        role({
          id: '018f0000-0000-7000-8000-000000000020',
          name: 'Zulu',
          permissions: [
            { key: 'payment.read' },
            { key: 'order.read' },
            { key: 'legacy.read', status: 'DEPRECATED' },
          ],
        }),
        role({
          id: '018f0000-0000-7000-8000-000000000010',
          name: 'Alpha',
          permissions: [{ key: 'order.create' }, { key: 'order.read' }],
        }),
        role({
          id: '018f0000-0000-7000-8000-000000000030',
          name: 'Disabled',
          status: 'DISABLED',
          permissions: [{ key: 'admin.bypass' }],
        }),
      ],
    }),
  );
  const context = await fake.service.resolve(USER_ID, MERCHANT_ID);
  assert.deepEqual(context.roles, [
    {
      id: '018f0000-0000-7000-8000-000000000010',
      name: 'Alpha',
    },
    { id: '018f0000-0000-7000-8000-000000000020', name: 'Zulu' },
  ]);
  assert.deepEqual(
    [...context.permissions],
    ['order.create', 'order.read', 'payment.read'],
  );
});

void test('authorization lookup failures propagate instead of becoming forbidden', async () => {
  const store: AuthorizationStore = {
    findMerchantContextForUser: () =>
      Promise.reject(new Error('Synthetic database failure')),
  };
  await assert.rejects(
    new MerchantContextService(store).resolve(USER_ID, MERCHANT_ID),
    { message: 'Synthetic database failure' },
  );
});
