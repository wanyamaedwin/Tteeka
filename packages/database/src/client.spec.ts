import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPrismaClient,
  DatabaseClientConfigurationError,
  disconnectPrismaClient,
} from './client';

const DATABASE_URL =
  'postgresql://tteeka:private_test_password@127.0.0.1:5432/tteeka';

void test('factory constructs a Prisma client from explicit validated configuration', async () => {
  const client = createPrismaClient({ databaseUrl: DATABASE_URL });

  assert.equal(typeof client.$connect, 'function');
  assert.equal(typeof client.$disconnect, 'function');

  await disconnectPrismaClient(client);
});

void test('factory does not read DATABASE_URL directly from the environment', () => {
  assert.throws(
    () => createPrismaClient({ databaseUrl: '' }),
    DatabaseClientConfigurationError,
  );
});

void test('wrapper configuration errors do not expose credentials', () => {
  let error: unknown;

  try {
    createPrismaClient({ databaseUrl: '' });
  } catch (caught: unknown) {
    error = caught;
  }

  assert.ok(error instanceof DatabaseClientConfigurationError);
  assert.doesNotMatch(error.message, /private_test_password/);
});
