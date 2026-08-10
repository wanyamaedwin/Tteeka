import assert from 'node:assert/strict';
import test from 'node:test';

import type { DatabaseService } from '../database/database.service';
import { PrismaAuthStore } from './prisma-auth.store';

const REVOKED_AT = new Date('2030-01-02T03:04:05.000Z');

function storeRecorder() {
  const updates: unknown[] = [];
  const database = {
    client: {
      session: {
        updateMany: (input: unknown) => {
          updates.push(input);
          return Promise.resolve({ count: 0 });
        },
      },
    },
  } as unknown as DatabaseService;
  return { store: new PrismaAuthStore(database), updates };
}

void test('current logout conditionally revokes by token hash without loading a Session', async () => {
  const recorder = storeRecorder();
  const tokenHash = 'a'.repeat(64);
  await recorder.store.revokeSessionByTokenHash(tokenHash, REVOKED_AT);
  assert.deepEqual(recorder.updates, [
    {
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: REVOKED_AT },
    },
  ]);
});

void test('logout-all conditionally revokes every unrevoked Session by User id', async () => {
  const recorder = storeRecorder();
  const userId = '018f0000-0000-7000-8000-000000000001';
  await recorder.store.revokeAllSessionsForUser(userId, REVOKED_AT);
  assert.deepEqual(recorder.updates, [
    {
      where: { userId, revokedAt: null },
      data: { revokedAt: REVOKED_AT },
    },
  ]);
});
