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
    sessionTouchIntervalSeconds: 300,
    mtnMomoCollections: { enabled: false },
  };
}

function responseRecorder() {
  const cookies: unknown[][] = [];
  const clearedCookies: unknown[][] = [];
  const headers = new Map<string, string>();
  return {
    cookies,
    clearedCookies,
    headers,
    response: {
      cookie: (...args: unknown[]) => cookies.push(args),
      clearCookie: (...args: unknown[]) => clearedCookies.push(args),
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

void test('/me returns only the safe principal and sets private cache headers', () => {
  const recorder = responseRecorder();
  const controller = new AuthController(service(), config('test'));
  const body = controller.me(
    {
      user: ISSUED_LOGIN.user,
      session: {
        id: '018f0000-0000-7000-8000-000000000099',
        expiresAt: EXPIRES_AT,
      },
    },
    recorder.response,
  );
  assert.deepEqual(body, {
    user: ISSUED_LOGIN.user,
    session: { expiresAt: EXPIRES_AT.toISOString() },
  });
  assert.equal(JSON.stringify(body).includes('000000000099'), false);
  assert.equal(recorder.headers.get('Cache-Control'), 'no-store');
  assert.equal(recorder.headers.get('Pragma'), 'no-cache');
  assert.equal(recorder.cookies.length, 0);
});

for (const [nodeEnv, secure] of [
  ['development', false],
  ['test', false],
  ['staging', true],
  ['production', true],
] as const) {
  void test(`logout clears the Session cookie with secure=${secure} in ${nodeEnv}`, async () => {
    const calls: unknown[] = [];
    const authService = {
      logout: (token: unknown) => {
        calls.push(token);
        return Promise.resolve();
      },
    } as unknown as AuthService;
    const recorder = responseRecorder();
    const controller = new AuthController(authService, config(nodeEnv));

    await controller.logout(
      { cookies: { [SESSION_COOKIE_NAME]: 'synthetic-cookie' } } as never,
      recorder.response,
    );

    assert.deepEqual(calls, ['synthetic-cookie']);
    assert.deepEqual(recorder.clearedCookies, [
      [
        SESSION_COOKIE_NAME,
        {
          httpOnly: true,
          sameSite: 'lax',
          secure,
          path: SESSION_COOKIE_PATH,
        },
      ],
    ]);
    assert.equal(recorder.headers.get('Cache-Control'), 'no-store');
    assert.equal(recorder.headers.get('Pragma'), 'no-cache');
    assert.equal(recorder.cookies.length, 0);
  });
}

void test('logout does not clear the cookie when revocation fails', async () => {
  const authService = {
    logout: () => Promise.reject(new Error('Synthetic store failure')),
  } as unknown as AuthService;
  const recorder = responseRecorder();
  const controller = new AuthController(authService, config('test'));

  await assert.rejects(
    controller.logout({ cookies: {} } as never, recorder.response),
    { message: 'Synthetic store failure' },
  );
  assert.equal(recorder.clearedCookies.length, 0);
  assert.equal(recorder.headers.size, 0);
});

void test('logout-all uses the authenticated principal and clears only after success', async () => {
  const calls: unknown[] = [];
  const authService = {
    logoutAll: (auth: unknown) => {
      calls.push(auth);
      return Promise.resolve();
    },
  } as unknown as AuthService;
  const recorder = responseRecorder();
  const controller = new AuthController(authService, config('test'));
  const principal = {
    user: ISSUED_LOGIN.user,
    session: {
      id: '018f0000-0000-7000-8000-000000000099',
      expiresAt: EXPIRES_AT,
    },
  };

  await controller.logoutAll(principal, recorder.response);

  assert.deepEqual(calls, [principal]);
  assert.equal(recorder.clearedCookies.length, 1);
  assert.equal(recorder.cookies.length, 0);
  assert.equal(recorder.headers.get('Cache-Control'), 'no-store');
  assert.equal(recorder.headers.get('Pragma'), 'no-cache');
});
