import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigurationError, type RawEnvironment } from '@tteeka/config';
import type { PrismaClientFactory, TteekaPrismaClient } from '@tteeka/database';

import { initializeWorker } from './worker';

const VALID_ENVIRONMENT: RawEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://tteeka:test_password@127.0.0.1:5432/tteeka',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

function createFakeClient(
  onDisconnect: () => void = () => undefined,
): TteekaPrismaClient {
  return {
    $disconnect: () => {
      onDisconnect();
      return Promise.resolve();
    },
  } as TteekaPrismaClient;
}

void test('worker initializes shared database infrastructure with valid configuration', () => {
  let receivedUrl: string | undefined;
  const client = createFakeClient();
  const factory: PrismaClientFactory = (options) => {
    receivedUrl = options.databaseUrl;
    return client;
  };
  const runtime = initializeWorker(VALID_ENVIRONMENT, factory);

  assert.equal(runtime.config.nodeEnv, 'test');
  assert.equal(runtime.config.apiPort, 3000);
  assert.equal(runtime.database, client);
  assert.equal(receivedUrl, VALID_ENVIRONMENT.DATABASE_URL);
});

void test('worker fails clearly when required configuration is invalid', () => {
  let factoryCalled = false;

  assert.throws(
    () =>
      initializeWorker(
        { ...VALID_ENVIRONMENT, DATABASE_URL: undefined },
        () => {
          factoryCalled = true;
          return createFakeClient();
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.match(error.message, /DATABASE_URL/);
      assert.doesNotMatch(error.message, /test_password/);
      return true;
    },
  );

  assert.equal(factoryCalled, false);
});

void test('worker runtime disconnects cleanly', async () => {
  let disconnected = false;
  const runtime = initializeWorker(VALID_ENVIRONMENT, () =>
    createFakeClient(() => {
      disconnected = true;
    }),
  );

  await runtime.close();

  assert.equal(disconnected, true);
});
