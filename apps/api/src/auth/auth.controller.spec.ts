import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppConfig } from '@tteeka/config';

import {
  AuthController,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
} from './auth.controller';
import type { AuthService, IssuedLogin } from './auth.service';

const EXPIRES_AT = new Date('2030-01-02T03:04:05.678Z');
const ISSUED_LOGIN: IssuedLogin = {
  user: {
    id: '018f0000-0000-7000-8000-000000000001',
    displayName: 'Test User',
  },
  session: { expiresAt: EXPIRES_AT },
  token: 'synthetic-controller-token',
};

function config(nodeEnv: AppConfig['nodeEnv']): AppConfig {
  return {
    nodeEnv,
    apiPort: 3000,
    databaseUrl: 'postgresql://synthetic.invalid/tteeka',
    redisUrl: 'redis://synthetic.invalid',
    infraHealthTimeoutMs: 2000,
    sessionTtlSeconds: 43_200,
  };
}

function responseRecorder() {
  const cookies: unknown[][] = [];
  const headers = new Map<string, string>();
  return {
    cookies,
    headers,
    response: {
      cookie: (...args: unknown[]) => cookies.push(args),
      setHeader: (name: string, value: string) => headers.set(name, value),
    },
  };
}

function service(): AuthService {
  return {
    login: () => Promise.resolve(ISSUED_LOGIN),
  } as unknown as AuthService;
}

for (const [nodeEnv, secure] of [
  ['development', false],
  ['test', false],
  ['staging', true],
  ['production', true],
] as const) {
  void test(`uses secure=${secure} Session cookie in ${nodeEnv}`, async () => {
    const recorder = responseRecorder();
    const controller = new AuthController(service(), config(nodeEnv));
    const body = await controller.login(
      { phone: '0772123456', password: ' password with spaces ' },
      'Synthetic Agent',
      '127.0.0.1',
      recorder.response,
    );

    assert.deepEqual(recorder.cookies, [
      [
        SESSION_COOKIE_NAME,
        ISSUED_LOGIN.token,
        {
          httpOnly: true,
          sameSite: 'lax',
          secure,
          path: SESSION_COOKIE_PATH,
          expires: EXPIRES_AT,
        },
      ],
    ]);
    assert.equal(recorder.headers.get('Cache-Control'), 'no-store');
    assert.equal(recorder.headers.get('Pragma'), 'no-cache');
    assert.deepEqual(body, {
      user: ISSUED_LOGIN.user,
      session: { expiresAt: EXPIRES_AT.toISOString() },
    });
  });
}

void test('rejects malformed bodies without invoking login', async () => {
  let called = false;
  const authService = {
    login: () => {
      called = true;
      return Promise.resolve(ISSUED_LOGIN);
    },
  } as unknown as AuthService;
  const controller = new AuthController(authService, config('test'));

  await assert.rejects(
    controller.login(
      { phone: '0772123456', password: '' },
      undefined,
      undefined,
      responseRecorder().response,
    ),
    { status: 400 },
  );
  assert.equal(called, false);
});
