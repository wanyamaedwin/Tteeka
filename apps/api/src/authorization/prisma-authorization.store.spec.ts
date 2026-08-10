import assert from 'node:assert/strict';
import test from 'node:test';

import type { DatabaseService } from '../database/database.service';
import { PrismaAuthorizationStore } from './prisma-authorization.store';

void test('uses one minimal User-and-Merchant membership query', async () => {
  const queries: unknown[] = [];
  const database = {
    client: {
      merchantMembership: {
        findUnique: (query: unknown) => {
          queries.push(query);
          return Promise.resolve(null);
        },
      },
    },
  } as unknown as DatabaseService;
  const store = new PrismaAuthorizationStore(database);
  const userId = '018f0000-0000-7000-8000-000000000001';
  const merchantId = '018f0000-0000-7000-8000-000000000002';

  assert.equal(
    await store.findMerchantContextForUser(userId, merchantId),
    null,
  );
  assert.deepEqual(queries, [
    {
      where: { merchantId_userId: { merchantId, userId } },
      select: {
        id: true,
        status: true,
        merchant: {
          select: { id: true, displayName: true, status: true },
        },
        membershipRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                status: true,
                rolePermissions: {
                  select: {
                    permission: { select: { key: true, status: true } },
                  },
                },
              },
            },
          },
        },
      },
    },
  ]);
  const serialized = JSON.stringify(queries);
  for (const forbidden of [
    'password',
    'phone',
    'email',
    'session',
    'tokenHash',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
