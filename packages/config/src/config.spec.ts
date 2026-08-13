import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ConfigurationError,
  loadConfig,
  loadMtnMomoCollectionsConfig,
  type RawEnvironment,
} from './config';

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
  assert.equal(config.frontendOrigin, undefined);
  assert.equal(config.infraHealthTimeoutMs, 2000);
  assert.equal(config.sessionTtlSeconds, 43_200);
  assert.equal(config.sessionTouchIntervalSeconds, 300);
  assert.deepEqual(config.mtnMomoCollections, { enabled: false });
});

void test('accepts one exact frontend origin', () => {
  assert.equal(
    loadConfig({
      ...VALID_ENVIRONMENT,
      FRONTEND_ORIGIN: 'http://localhost:3001',
    }).frontendOrigin,
    'http://localhost:3001',
  );
});

for (const origin of [
  'http://localhost:3001/app',
  'http://localhost:3001/',
  '*',
  'file:///tmp/tteeka',
] as const) {
  void test(`rejects non-origin frontend value ${origin}`, () => {
    expectConfigurationError(
      { ...VALID_ENVIRONMENT, FRONTEND_ORIGIN: origin },
      'FRONTEND_ORIGIN',
    );
  });
}

void test('MTN Collections is disabled by default without credentials', () => {
  assert.deepEqual(loadMtnMomoCollectionsConfig({}), { enabled: false });
});

void test('enabled MTN Collections requires every credential without exposing values', () => {
  const secret = 'never-print-this-api-key';
  assert.throws(
    () =>
      loadMtnMomoCollectionsConfig({
        MTN_MOMO_COLLECTIONS_ENABLED: 'true',
        MTN_MOMO_COLLECTIONS_API_KEY: secret,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.match(error.message, /MTN_MOMO_COLLECTIONS_API_USER/);
      assert.match(error.message, /MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});

void test('enabled MTN Collections accepts only sandbox-safe validated configuration', () => {
  assert.deepEqual(
    loadMtnMomoCollectionsConfig({
      MTN_MOMO_COLLECTIONS_ENABLED: 'true',
      MTN_MOMO_COLLECTIONS_API_USER: '2f209631-07d4-4254-8d6a-bd0f1ef78538',
      MTN_MOMO_COLLECTIONS_API_KEY: 'synthetic-api-key',
      MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY: 'synthetic-subscription-key',
      MTN_MOMO_COLLECTIONS_CALLBACK_URL: 'https://sandbox.example.test/mtn',
      MTN_MOMO_COLLECTIONS_TIMEOUT_MS: '5000',
    }),
    {
      enabled: true,
      apiUser: '2f209631-07d4-4254-8d6a-bd0f1ef78538',
      apiKey: 'synthetic-api-key',
      subscriptionKey: 'synthetic-subscription-key',
      callbackUrl: 'https://sandbox.example.test/mtn',
      timeoutMs: 5000,
    },
  );
});

for (const [field, value] of [
  ['MTN_MOMO_COLLECTIONS_API_USER', 'not-a-uuid'],
  ['MTN_MOMO_COLLECTIONS_CALLBACK_URL', 'http://example.test/mtn'],
  ['MTN_MOMO_COLLECTIONS_TIMEOUT_MS', '30001'],
] as const) {
  void test(`rejects unsafe MTN Collections ${field}`, () => {
    expectConfigurationError(
      {
        ...VALID_ENVIRONMENT,
        MTN_MOMO_COLLECTIONS_ENABLED: 'true',
        MTN_MOMO_COLLECTIONS_API_USER: '2f209631-07d4-4254-8d6a-bd0f1ef78538',
        MTN_MOMO_COLLECTIONS_API_KEY: 'synthetic-api-key',
        MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY: 'synthetic-subscription-key',
        [field]: value,
      },
      field,
    );
  });
}

void test('accepts a custom Session TTL', () => {
  assert.equal(
    loadConfig({ ...VALID_ENVIRONMENT, SESSION_TTL_SECONDS: '3600' })
      .sessionTtlSeconds,
    3600,
  );
});

for (const [description, value] of [
  ['zero', '0'],
  ['negative', '-1'],
  ['below minimum', '299'],
  ['above maximum', '2592001'],
  ['non-integer', '300.5'],
] as const) {
  void test(`rejects ${description} Session TTL`, () => {
    expectConfigurationError(
      { ...VALID_ENVIRONMENT, SESSION_TTL_SECONDS: value },
      'SESSION_TTL_SECONDS',
    );
  });
}

for (const [description, value, accepted] of [
  ['custom', '600', true],
  ['below minimum', '59', false],
  ['minimum', '60', true],
  ['maximum', '3600', true],
  ['above maximum', '3601', false],
  ['zero', '0', false],
  ['negative', '-1', false],
  ['non-integer', '60.5', false],
] as const) {
  void test(`${accepted ? 'accepts' : 'rejects'} ${description} Session touch interval`, () => {
    const environment = {
      ...VALID_ENVIRONMENT,
      SESSION_TOUCH_INTERVAL_SECONDS: value,
    };
    if (accepted) {
      assert.equal(
        loadConfig(environment).sessionTouchIntervalSeconds,
        Number(value),
      );
    } else {
      expectConfigurationError(environment, 'SESSION_TOUCH_INTERVAL_SECONDS');
    }
  });
}

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
