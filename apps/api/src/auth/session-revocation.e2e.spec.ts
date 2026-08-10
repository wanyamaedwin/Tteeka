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
import { SESSION_COOKIE_NAME, SESSION_COOKIE_PATH } from './session-cookie';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Session revocation E2E tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const TEST_PREFIX = 'B1.7 Revocation Test';
const PASSWORD = 'Synthetic B1.7 Password';
let app: INestApplication;
let baseUrl: string;

function canonicalPhone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}

async function createUser() {
  const phoneE164 = canonicalPhone();
  const user = await client.user.create({
    data: {
      displayName: `${TEST_PREFIX} ${randomUUID()}`,
      phoneE164,
      passwordCredential: {
        create: { passwordHash: await hashPassword(PASSWORD) },
      },
    },
  });
  return { user, localPhone: `0${phoneE164.slice(4)}` };
}

async function login(phone: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD }),
  });
  assert.equal(response.status, 200);
  return rawCookieToken(response);
}

function rawCookieToken(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  const pair = cookie.split(';', 1)[0];
  if (pair === undefined) throw new Error('Session cookie pair is missing.');
  assert.ok(pair.startsWith(`${SESSION_COOKIE_NAME}=`));
  return pair.slice(`${SESSION_COOKIE_NAME}=`.length);
}

function request(
  path: 'logout' | 'logout-all' | 'me',
  rawToken?: string,
): Promise<Response> {
  return fetch(`${baseUrl}/api/v1/auth/${path}`, {
    method: path === 'me' ? 'GET' : 'POST',
    headers:
      rawToken === undefined
        ? {}
        : { cookie: `${SESSION_COOKIE_NAME}=${rawToken}` },
  });
}

function assertClearedCookie(response: Response): void {
  const header = response.headers.get('set-cookie');
  assert.ok(header);
  const parts = header.split(';').map((part) => part.trim());
  assert.equal(parts[0], `${SESSION_COOKIE_NAME}=`);
  assert.ok(parts.includes(`Path=${SESSION_COOKIE_PATH}`));
  assert.ok(parts.some((part) => part.toLowerCase() === 'httponly'));
  assert.ok(parts.some((part) => part.toLowerCase() === 'samesite=lax'));
  assert.equal(
    parts.some((part) => /^domain=/i.test(part)),
    false,
  );
  assert.equal(
    parts.some((part) => part.toLowerCase() === 'secure'),
    false,
  );
  const expires = parts.find((part) => /^expires=/i.test(part));
  assert.ok(expires);
  assert.ok(new Date(expires.slice('expires='.length)).getTime() < Date.now());
}

async function createDirectSession(options: {
  userId: string;
  expiresAt?: Date;
  revokedAt?: Date;
}) {
  const created = createSessionToken();
  const session = await client.session.create({
    data: {
      userId: options.userId,
      tokenHash: created.tokenHash,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 3_600_000),
      ...(options.revokedAt === undefined
        ? {}
        : { revokedAt: options.revokedAt }),
    },
  });
  return { token: created.token, session };
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

void test('current logout revokes only its Session, retains rows, and is idempotent', async () => {
  const created = await createUser();
  const tokenA = await login(created.localPhone);
  const tokenB = await login(created.localPhone);

  const response = await request('logout', tokenA);
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assertClearedCookie(response);

  const sessionA = await client.session.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(tokenA) },
  });
  const sessionB = await client.session.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(tokenB) },
  });
  assert.ok(sessionA.revokedAt);
  assert.equal(sessionB.revokedAt, null);
  assert.equal(
    await client.session.count({ where: { userId: created.user.id } }),
    2,
  );
  assert.equal((await request('me', tokenA)).status, 401);
  assert.equal((await request('me', tokenB)).status, 200);

  const firstRevokedAt = sessionA.revokedAt;
  const repeated = await request('logout', tokenA);
  assert.equal(repeated.status, 204);
  assertClearedCookie(repeated);
  const afterRepeated = await client.session.findUniqueOrThrow({
    where: { id: sessionA.id },
  });
  assert.equal(afterRepeated.revokedAt?.getTime(), firstRevokedAt.getTime());
});

void test('missing, malformed, and unknown valid logout cookies all clear safely', async () => {
  const unknownToken = createSessionToken().token;
  for (const token of [undefined, 'malformed', unknownToken]) {
    const response = await request('logout', token);
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assertClearedCookie(response);
  }
  assert.equal(
    await client.session.count({
      where: { tokenHash: hashSessionToken(unknownToken) },
    }),
    0,
  );
});

void test('ordinary logout revokes expired and DISABLED-User Sessions without authentication', async () => {
  const created = await createUser();
  const expired = await createDirectSession({
    userId: created.user.id,
    expiresAt: new Date(Date.now() - 60_000),
  });
  assert.equal((await request('logout', expired.token)).status, 204);
  assert.ok(
    (
      await client.session.findUniqueOrThrow({
        where: { id: expired.session.id },
      })
    ).revokedAt,
  );

  const disabled = await createDirectSession({ userId: created.user.id });
  await client.user.update({
    where: { id: created.user.id },
    data: { status: 'DISABLED' },
  });
  assert.equal((await request('logout', disabled.token)).status, 204);
  assert.ok(
    (
      await client.session.findUniqueOrThrow({
        where: { id: disabled.session.id },
      })
    ).revokedAt,
  );
});

void test('logout-all revokes all unrevoked User Sessions and isolates other Users', async () => {
  const userA = await createUser();
  const userB = await createUser();
  const tokenA1 = await login(userA.localPhone);
  const tokenA2 = await login(userA.localPhone);
  const tokenA3 = await login(userA.localPhone);
  const tokenB = await login(userB.localPhone);
  const priorRevocation = new Date(Date.now() - 3_600_000);
  const alreadyRevoked = await createDirectSession({
    userId: userA.user.id,
    revokedAt: priorRevocation,
  });
  const expired = await createDirectSession({
    userId: userA.user.id,
    expiresAt: new Date(Date.now() - 60_000),
  });
  assert.equal(
    await client.merchantMembership.count({ where: { userId: userA.user.id } }),
    0,
  );

  const response = await request('logout-all', tokenA1);
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assertClearedCookie(response);

  const sessionsA = await client.session.findMany({
    where: { userId: userA.user.id },
  });
  assert.equal(sessionsA.length, 5);
  const preserved = sessionsA.find(
    (session) => session.id === alreadyRevoked.session.id,
  );
  assert.equal(preserved?.revokedAt?.getTime(), priorRevocation.getTime());
  const newlyRevoked = sessionsA.filter(
    (session) => session.id !== alreadyRevoked.session.id,
  );
  assert.ok(newlyRevoked.every((session) => session.revokedAt !== null));
  assert.equal(
    new Set(newlyRevoked.map((session) => session.revokedAt?.getTime())).size,
    1,
  );
  assert.ok(newlyRevoked.some((session) => session.id === expired.session.id));
  for (const token of [tokenA1, tokenA2, tokenA3, expired.token]) {
    assert.equal((await request('me', token)).status, 401);
  }

  const sessionB = await client.session.findUniqueOrThrow({
    where: { tokenHash: hashSessionToken(tokenB) },
  });
  assert.equal(sessionB.revokedAt, null);
  assert.equal((await request('me', tokenB)).status, 200);
});

void test('logout-all requires a valid authenticated Session and does not clear on 401', async () => {
  for (const token of [undefined, 'malformed', createSessionToken().token]) {
    const response = await request('logout-all', token);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});
