import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigurationError, type RawEnvironment } from '@tteeka/config';

import { initializeWorker } from './worker';

const VALID_ENVIRONMENT: RawEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://tteeka:test_password@127.0.0.1:5432/tteeka',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

void test('worker initializes with valid shared configuration', () => {
  const config = initializeWorker(VALID_ENVIRONMENT);

  assert.equal(config.nodeEnv, 'test');
  assert.equal(config.apiPort, 3000);
});

void test('worker fails clearly when required configuration is invalid', () => {
  assert.throws(
    () => initializeWorker({ ...VALID_ENVIRONMENT, DATABASE_URL: undefined }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.match(error.message, /DATABASE_URL/);
      assert.doesNotMatch(error.message, /test_password/);
      return true;
    },
  );
});
