import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigurationError, loadConfig, type RawEnvironment } from './config';

const VALID_ENVIRONMENT: RawEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://tteeka:test_password@127.0.0.1:5432/tteeka',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

function without(key: string): RawEnvironment {
  const environment = { ...VALID_ENVIRONMENT };
  delete environment[key];
  return environment;
}

function expectConfigurationError(
  environment: RawEnvironment,
  expectedField: string,
): void {
  assert.throws(
    () => loadConfig(environment),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.match(error.message, new RegExp(expectedField));
      assert.doesNotMatch(error.message, /test_password/);
      return true;
    },
  );
}

void test('valid development configuration succeeds with defaults', () => {
  const config = loadConfig(VALID_ENVIRONMENT);

  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.apiPort, 3000);
  assert.equal(config.infraHealthTimeoutMs, 2000);
});

void test('missing DATABASE_URL fails', () => {
  expectConfigurationError(without('DATABASE_URL'), 'DATABASE_URL');
});

void test('malformed DATABASE_URL fails', () => {
  expectConfigurationError(
    { ...VALID_ENVIRONMENT, DATABASE_URL: 'not-a-url' },
    'DATABASE_URL',
  );
});

void test('non-PostgreSQL DATABASE_URL fails', () => {
  expectConfigurationError(
    { ...VALID_ENVIRONMENT, DATABASE_URL: 'mysql://127.0.0.1/tteeka' },
    'DATABASE_URL',
  );
});

void test('missing REDIS_URL fails', () => {
  expectConfigurationError(without('REDIS_URL'), 'REDIS_URL');
});

void test('malformed REDIS_URL fails', () => {
  expectConfigurationError(
    { ...VALID_ENVIRONMENT, REDIS_URL: 'not-a-url' },
    'REDIS_URL',
  );
});

void test('invalid NODE_ENV fails', () => {
  expectConfigurationError(
    { ...VALID_ENVIRONMENT, NODE_ENV: 'local' },
    'NODE_ENV',
  );
});

void test('invalid API_PORT fails', () => {
  expectConfigurationError(
    { ...VALID_ENVIRONMENT, API_PORT: '65536' },
    'API_PORT',
  );
});

void test('invalid INFRA_HEALTH_TIMEOUT_MS fails', () => {
  expectConfigurationError(
    { ...VALID_ENVIRONMENT, INFRA_HEALTH_TIMEOUT_MS: '0' },
    'INFRA_HEALTH_TIMEOUT_MS',
  );
});
