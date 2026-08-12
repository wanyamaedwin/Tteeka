import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppConfig } from '@tteeka/config';
import { createSessionToken, hashSessionToken } from '@tteeka/security';

import { AuthService, UNAUTHORIZED_MESSAGE } from './auth.service';
import type { AuthenticationSession, AuthStore } from './auth.store';

const NOW = new Date('2030-01-02T03:04:05.000Z');
const RAW_TOKEN = createSessionToken().token;
const CONFIG: AppConfig = {
  nodeEnv: 'test',
  apiPort: 3000,
  databaseUrl: 'postgresql://synthetic.invalid/tteeka',
  redisUrl: 'redis://synthetic.invalid',
  infraHealthTimeoutMs: 2000,
  sessionTtlSeconds: 43_200,
  sessionTouchIntervalSeconds: 300,
  mtnMomoCollections: { enabled: false },
};

function session(
  overrides: Partial<AuthenticationSession> = {},
): AuthenticationSession {
  return {
    id: '018f0000-0000-7000-8000-000000000010',
    userId: '018f0000-0000-7000-8000-000000000011',
    expiresAt: new Date(NOW.getTime() + 1000),
    revokedAt: null,
    lastUsedAt: new Date(NOW.getTime() - 1000),
    user: {
      id: '018f0000-0000-7000-8000-000000000011',
      displayName: 'Synthetic Principal',
      status: 'ACTIVE',
    },
    ...overrides,
  };
}

function storeFor(found: AuthenticationSession | null): {
  store: AuthStore;
  lookups: string[];
  touches: unknown[][];
  revocations: unknown[][];
  bulkRevocations: unknown[][];
} {
  const lookups: string[] = [];
  const touches: unknown[][] = [];
  const revocations: unknown[][] = [];
  const bulkRevocations: unknown[][] = [];
  return {
    lookups,
    touches,
    revocations,
    bulkRevocations,
    store: {
      findUserForPasswordLogin: () => Promise.resolve(null),
      updateCredentialHash: () => Promise.resolve(),
      createSession: () => Promise.resolve(),
      findSessionForAuthentication: (tokenHash) => {
        lookups.push(tokenHash);
        return Promise.resolve(found);
      },
      touchSessionLastUsedAt: (...args) => {
        touches.push(args);
        return Promise.resolve();
      },
      revokeSessionByTokenHash: (...args) => {
        revocations.push(args);
        return Promise.resolve();
      },
      revokeAllSessionsForUser: (...args) => {
        bulkRevocations.push(args);
        return Promise.resolve();
      },
    },
  };
}

function service(store: AuthStore): AuthService {
  return new AuthService(CONFIG, store, 'synthetic-dummy-hash');
}

for (const [description, found] of [
  ['unknown Session', null],
  ['revoked Session', session({ revokedAt: new Date() })],
  ['expired Session', session({ expiresAt: new Date(NOW.getTime() - 1) })],
  ['Session expiring exactly now', session({ expiresAt: NOW })],
  [
    'Session for a DISABLED User',
    session({ user: { ...session().user, status: 'DISABLED' } }),
  ],
] as const) {
  void test(`${description} receives the generic unauthorized result`, async () => {
    const fake = storeFor(found);
    await assert.rejects(
      service(fake.store).authenticateSessionToken(RAW_TOKEN, NOW),
      {
        status: 401,
        message: UNAUTHORIZED_MESSAGE,
      },
    );
    assert.equal(fake.touches.length, 0);
  });
}

void test('an unexpired ACTIVE Session resolves to a safe principal after hash lookup', async () => {
  const found = session();
  const fake = storeFor(found);
  const principal = await service(fake.store).authenticateSessionToken(
    RAW_TOKEN,
    NOW,
  );
  assert.deepEqual(fake.lookups, [hashSessionToken(RAW_TOKEN)]);
  assert.equal(fake.lookups.includes(RAW_TOKEN), false);
  assert.deepEqual(principal, {
    user: { id: found.user.id, displayName: found.user.displayName },
    session: { id: found.id, expiresAt: found.expiresAt },
  });
  assert.deepEqual(Object.keys(principal), ['user', 'session']);
});

void test('a stale lastUsedAt triggers one id-based conditional touch', async () => {
  const found = session({ lastUsedAt: new Date(NOW.getTime() - 300_000) });
  const fake = storeFor(found);
  await service(fake.store).authenticateSessionToken(RAW_TOKEN, NOW);
  assert.deepEqual(fake.touches, [
    [found.id, new Date(NOW.getTime() - 300_000), NOW],
  ]);
  assert.equal(fake.touches.flat().includes(RAW_TOKEN), false);
  assert.equal(
    fake.touches.flat().includes(hashSessionToken(RAW_TOKEN)),
    false,
  );
  assert.equal(found.expiresAt.getTime(), NOW.getTime() + 1000);
});

void test('a recent lastUsedAt does not trigger a touch', async () => {
  const fake = storeFor(
    session({ lastUsedAt: new Date(NOW.getTime() - 299_999) }),
  );
  await service(fake.store).authenticateSessionToken(RAW_TOKEN, NOW);
  assert.equal(fake.touches.length, 0);
});

void test('best-effort touch failure preserves successful authentication', async () => {
  const found = session({ lastUsedAt: new Date(NOW.getTime() - 300_000) });
  const fake = storeFor(found);
  fake.store.touchSessionLastUsedAt = () =>
    Promise.reject(new Error('Synthetic touch failure'));
  const principal = await service(fake.store).authenticateSessionToken(
    RAW_TOKEN,
    NOW,
  );
  assert.equal(principal.user.id, found.user.id);
});

void test('lookup infrastructure failures are not converted to HTTP 401', async () => {
  const fake = storeFor(null);
  fake.store.findSessionForAuthentication = () =>
    Promise.reject(new Error('Synthetic database failure'));
  await assert.rejects(
    service(fake.store).authenticateSessionToken(RAW_TOKEN, NOW),
    { message: 'Synthetic database failure' },
  );
});

for (const [description, token] of [
  ['missing', undefined],
  ['empty', ''],
  ['malformed', 'malformed'],
  ['oversized', 'A'.repeat(2000)],
] as const) {
  void test(`${description} logout token succeeds without persistence access`, async () => {
    const fake = storeFor(null);
    await service(fake.store).logout(token, NOW);
    assert.equal(fake.revocations.length, 0);
    assert.equal(fake.lookups.length, 0);
    assert.equal(fake.touches.length, 0);
  });
}

void test('current logout hashes a valid token and passes one revocation timestamp', async () => {
  const fake = storeFor(null);
  await service(fake.store).logout(RAW_TOKEN, NOW);
  assert.deepEqual(fake.revocations, [[hashSessionToken(RAW_TOKEN), NOW]]);
  assert.equal(fake.revocations.flat().includes(RAW_TOKEN), false);
  assert.equal(fake.lookups.length, 0);
  assert.equal(fake.touches.length, 0);
});

void test('current logout propagates persistence failure', async () => {
  const fake = storeFor(null);
  fake.store.revokeSessionByTokenHash = () =>
    Promise.reject(new Error('Synthetic revocation failure'));
  await assert.rejects(service(fake.store).logout(RAW_TOKEN, NOW), {
    message: 'Synthetic revocation failure',
  });
});

void test('logout-all uses only the trusted principal User id and one timestamp', async () => {
  const fake = storeFor(null);
  const principal = {
    user: session().user,
    session: { id: session().id, expiresAt: session().expiresAt },
  };
  await service(fake.store).logoutAll(principal, NOW);
  assert.deepEqual(fake.bulkRevocations, [[principal.user.id, NOW]]);
  assert.equal(fake.lookups.length, 0);
  assert.equal(fake.touches.length, 0);
  assert.equal(fake.revocations.length, 0);
});

void test('logout-all propagates persistence failure', async () => {
  const fake = storeFor(null);
  fake.store.revokeAllSessionsForUser = () =>
    Promise.reject(new Error('Synthetic bulk revocation failure'));
  const found = session();
  await assert.rejects(
    service(fake.store).logoutAll(
      {
        user: { id: found.user.id, displayName: found.user.displayName },
        session: { id: found.id, expiresAt: found.expiresAt },
      },
      NOW,
    ),
    { message: 'Synthetic bulk revocation failure' },
  );
});
