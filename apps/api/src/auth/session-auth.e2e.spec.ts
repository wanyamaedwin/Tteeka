import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
} from '@tteeka/security';
import cookieParser from 'cookie-parser';

import { AppModule } from '../app.module';
import { SESSION_COOKIE_NAME } from './session-cookie';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Session authentication E2E tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const TEST_PREFIX = 'B1.6 Auth Test';
const PASSWORD = 'Synthetic B1.6 Password';
let app: INestApplication;
let baseUrl: string;

function canonicalPhone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}

async function createUser(options: {
  status?: 'ACTIVE' | 'DISABLED';
  withCredential?: boolean;
}) {
  const phoneE164 = canonicalPhone();
  const user = await client.user.create({
    data: {
      displayName: `${TEST_PREFIX} ${randomUUID()}`,
      phoneE164,
      status: options.status ?? 'ACTIVE',
      ...(options.withCredential === true
        ? {
            passwordCredential: {
              create: { passwordHash: await hashPassword(PASSWORD) },
            },
          }
        : {}),
    },
  });
  return { user, localPhone: `0${phoneE164.slice(4)}` };
}

async function createSession(options: {
  userId: string;
  expiresAt?: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
}) {
  const created = createSessionToken();
  const session = await client.session.create({
    data: {
      userId: options.userId,
      tokenHash: created.tokenHash,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      ...(options.revokedAt === undefined
        ? {}
        : { revokedAt: options.revokedAt }),
      ...(options.lastUsedAt === undefined
        ? {}
        : { lastUsedAt: options.lastUsedAt }),
    },
  });
  return { rawToken: created.token, session };
}

function me(rawToken?: string): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/auth/me`, {
    headers:
      rawToken === undefined
        ? {}
        : { cookie: `${SESSION_COOKIE_NAME}=${rawToken}` },
  });
}

async function login(phone: string): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD }),
  });
}

function rawCookieToken(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  const pair = cookie.split(';', 1)[0];
  if (pair === undefined) throw new Error('Session cookie pair is missing.');
  assert.ok(pair.startsWith(`${SESSION_COOKIE_NAME}=`));
  return pair.slice(`${SESSION_COOKIE_NAME}=`.length);
}

before(async () => {
  app = await NestFactory.create(AppModule, {
    logger: ['error'],
    abortOnError: false,
  });
  app.use(cookieParser());
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

after(async () => {
  await client.session.deleteMany({
    where: { user: { displayName: { startsWith: TEST_PREFIX } } },
  });
  await client.passwordCredential.deleteMany({
    where: { user: { displayName: { startsWith: TEST_PREFIX } } },
  });
  await client.user.deleteMany({
    where: { displayName: { startsWith: TEST_PREFIX } },
  });
  await app.close();
  await disconnectPrismaClient(client);
});

void test('missing, malformed, and unknown cookies share generic HTTP 401 behavior', async () => {
  const responses = await Promise.all([
    me(),
    me('malformed'),
    me(createSessionToken().token),
  ]);
  const bodies = await Promise.all(
    responses.map((response) => response.json()),
  );
  for (const response of responses) assert.equal(response.status, 401);
  assert.deepEqual(bodies[1], bodies[0]);
  assert.deepEqual(bodies[2], bodies[0]);
  assert.equal(JSON.stringify(bodies[0]).includes('Unauthorized.'), true);
});

void test('login cookie resolves /me for an ACTIVE User with no Memberships', async () => {
  const created = await createUser({ withCredential: true });
  const loginResponse = await login(created.localPhone);
  assert.equal(loginResponse.status, 200);
  const rawToken = rawCookieToken(loginResponse);
  const response = await me(rawToken);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('set-cookie'), null);

  const body = (await response.json()) as Record<string, unknown>;
  const text = JSON.stringify(body);
  assert.deepEqual(Object.keys(body).sort(), ['session', 'user']);
  assert.deepEqual(body.user, {
    id: created.user.id,
    displayName: created.user.displayName,
  });
  for (const forbidden of [
    'phone',
    'email',
    'token',
    'password',
    'merchant',
    'membership',
    'role',
    'permission',
  ]) {
    assert.equal(text.toLowerCase().includes(forbidden), false);
  }
  assert.equal(
    await client.merchantMembership.count({
      where: { userId: created.user.id },
    }),
    0,
  );
  const persisted = await client.session.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(rawToken) },
  });
  assert.equal(
    (body.session as { expiresAt: string }).expiresAt,
    persisted.expiresAt.toISOString(),
  );
  assert.equal(text.includes(persisted.id), false);
  assert.equal(text.includes(rawToken), false);
  assert.equal(text.includes(persisted.tokenHash), false);
});

void test('revoked, expired, exact-boundary, and DISABLED Sessions remain unauthorized', async () => {
  const active = await createUser({});
  const disabled = await createUser({ status: 'DISABLED' });
  const revoked = await createSession({
    userId: active.user.id,
    revokedAt: new Date(),
  });
  const expired = await createSession({
    userId: active.user.id,
    expiresAt: new Date(Date.now() - 1000),
  });
  const boundary = await createSession({
    userId: active.user.id,
    expiresAt: new Date(),
  });
  const disabledSession = await createSession({ userId: disabled.user.id });
  for (const rawToken of [
    revoked.rawToken,
    expired.rawToken,
    boundary.rawToken,
    disabledSession.rawToken,
  ]) {
    assert.equal((await me(rawToken)).status, 401);
  }
  assert.equal(
    await client.session.count({
      where: {
        id: {
          in: [
            revoked.session.id,
            expired.session.id,
            boundary.session.id,
            disabledSession.session.id,
          ],
        },
      },
    }),
    4,
  );
});

void test('repeated /me calls neither rotate nor renew a Session', async () => {
  const created = await createUser({});
  const stale = new Date(Date.now() - 10 * 60 * 1000);
  const issued = await createSession({
    userId: created.user.id,
    lastUsedAt: stale,
  });
  const beforeCount = await client.session.count({
    where: { userId: created.user.id },
  });
  const first = await me(issued.rawToken);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('set-cookie'), null);
  const afterFirst = await client.session.findUniqueOrThrow({
    where: { id: issued.session.id },
  });
  assert.ok(afterFirst.lastUsedAt.getTime() > stale.getTime());

  const second = await me(issued.rawToken);
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('set-cookie'), null);
  const afterSecond = await client.session.findUniqueOrThrow({
    where: { id: issued.session.id },
  });
  assert.equal(
    afterSecond.lastUsedAt.getTime(),
    afterFirst.lastUsedAt.getTime(),
  );
  assert.equal(afterSecond.tokenHash, issued.session.tokenHash);
  assert.equal(
    afterSecond.expiresAt.getTime(),
    issued.session.expiresAt.getTime(),
  );
  assert.equal(afterSecond.revokedAt, issued.session.revokedAt);
  assert.equal(
    await client.session.count({ where: { userId: created.user.id } }),
    beforeCount,
  );
});

void test('login remains public when SessionAuthGuard protects /me', async () => {
  const created = await createUser({ withCredential: true });
  assert.equal((await login(created.localPhone)).status, 200);
});
