import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';
import {
  hashPassword,
  hashSessionToken,
  passwordNeedsRehash,
  verifyPassword,
} from '@tteeka/security';
import { argon2id, hash } from 'argon2';

import { ConfigurationModule } from '../configuration/configuration.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from './auth.module';

@Module({ imports: [ConfigurationModule, DatabaseModule, AuthModule] })
class AuthE2eModule {}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Auth E2E tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const TEST_PREFIX = 'B1.5 Login Test';
const PASSWORD = 'Synthetic Login Password';
let app: INestApplication;
let baseUrl: string;

function canonicalPhone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}

async function createUser(options: {
  status?: 'ACTIVE' | 'DISABLED';
  withCredential?: boolean;
  passwordHash?: string;
  passwordChangedAt?: Date;
}) {
  const phoneE164 = canonicalPhone();
  const user = await client.user.create({
    data: {
      displayName: `${TEST_PREFIX} ${randomUUID()}`,
      phoneE164,
      status: options.status ?? 'ACTIVE',
      ...(options.withCredential === false
        ? {}
        : {
            passwordCredential: {
              create: {
                passwordHash:
                  options.passwordHash ?? (await hashPassword(PASSWORD)),
                ...(options.passwordChangedAt === undefined
                  ? {}
                  : { passwordChangedAt: options.passwordChangedAt }),
              },
            },
          }),
    },
  });
  return { user, phoneE164, localPhone: `0${phoneE164.slice(4)}` };
}

async function login(
  phone: unknown,
  password: unknown,
  userAgent = 'B1.5 E2E Agent',
) {
  return fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify({ phone, password }),
  });
}

function rawCookieToken(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  const pair = cookie.split(';', 1)[0];
  assert.ok(pair);
  assert.ok(pair.startsWith('tteeka_session='));
  return pair.slice('tteeka_session='.length);
}

before(async () => {
  app = await NestFactory.create(AuthE2eModule, {
    logger: ['error'],
    abortOnError: false,
  });
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

void test('rejects malformed login requests with HTTP 400', async () => {
  for (const [phone, password] of [
    ['', PASSWORD],
    ['not-a-phone', PASSWORD],
    ['0772123456', ''],
    ['0772123456', 'x'.repeat(1025)],
  ]) {
    const response = await login(phone, password);
    assert.equal(response.status, 400);
  }
});

void test('uses one generic HTTP 401 response and creates no failed Sessions', async () => {
  const wrongPassword = await createUser({});
  const missingCredential = await createUser({ withCredential: false });
  const disabled = await createUser({ status: 'DISABLED' });
  const wrongCredentialBefore =
    await client.passwordCredential.findUniqueOrThrow({
      where: { userId: wrongPassword.user.id },
    });
  const attempts = [
    await login(canonicalPhone(), PASSWORD),
    await login(wrongPassword.localPhone, 'Synthetic Wrong Password'),
    await login(missingCredential.localPhone, PASSWORD),
    await login(disabled.localPhone, PASSWORD),
  ];
  const bodies = await Promise.all(attempts.map((response) => response.json()));

  for (const response of attempts) {
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  for (const body of bodies.slice(1)) assert.deepEqual(body, bodies[0]);
  assert.equal(
    await client.session.count({
      where: {
        userId: {
          in: [
            wrongPassword.user.id,
            missingCredential.user.id,
            disabled.user.id,
          ],
        },
      },
    }),
    0,
  );
  const wrongCredentialAfter =
    await client.passwordCredential.findUniqueOrThrow({
      where: { userId: wrongPassword.user.id },
    });
  assert.equal(
    wrongCredentialAfter.passwordHash,
    wrongCredentialBefore.passwordHash,
  );
});

void test('issues fresh hash-only Sessions for an ACTIVE User without Memberships', async () => {
  const created = await createUser({});
  const overlongAgent = 'A'.repeat(600);
  const beforeLogin = Date.now();
  const first = await login(created.localPhone, PASSWORD, overlongAgent);
  const second = await login(created.phoneE164, PASSWORD);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const firstBody = (await first.json()) as Record<string, unknown>;
  const firstBodyText = JSON.stringify(firstBody);
  const firstToken = rawCookieToken(first);
  const secondToken = rawCookieToken(second);
  assert.notEqual(firstToken, secondToken);
  assert.deepEqual(Object.keys(firstBody).sort(), ['session', 'user']);
  assert.equal(firstBodyText.includes(firstToken), false);
  for (const forbidden of [
    'tokenHash',
    'password',
    'phone',
    'merchant',
    'role',
  ]) {
    assert.equal(firstBodyText.includes(forbidden), false);
  }

  const cookie = first.headers.get('set-cookie');
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\/api\/v1/i);
  assert.doesNotMatch(cookie, /;\s*Secure/i);
  assert.match(cookie, /Expires=/i);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal(first.headers.get('pragma'), 'no-cache');

  const sessions = await client.session.findMany({
    where: { userId: created.user.id },
    orderBy: { createdAt: 'asc' },
  });
  assert.equal(sessions.length, 2);
  const firstSession = sessions[0];
  const secondSession = sessions[1];
  assert.ok(firstSession);
  assert.ok(secondSession);
  assert.notEqual(firstSession.tokenHash, secondSession.tokenHash);
  assert.equal(firstSession.tokenHash, hashSessionToken(firstToken));
  assert.notEqual(firstSession.tokenHash, firstToken);
  assert.equal(Object.values(firstSession).includes(firstToken), false);
  assert.equal(firstSession.revokedAt, null);
  assert.equal(secondSession.revokedAt, null);
  assert.equal(firstSession.userAgent, overlongAgent.slice(0, 512));
  assert.ok(firstSession.ipAddress);
  assert.ok(firstSession.ipAddress.length <= 45);
  const ttl = firstSession.expiresAt.getTime() - beforeLogin;
  assert.ok(ttl >= 43_195_000 && ttl <= 43_205_000);
  const responseSession = firstBody.session as { expiresAt: string };
  assert.equal(
    new Date(responseSession.expiresAt).getTime(),
    firstSession.expiresAt.getTime(),
  );
  const cookieExpiry = /Expires=([^;]+)/i.exec(cookie)?.[1];
  assert.ok(cookieExpiry);
  assert.ok(
    Math.abs(
      new Date(cookieExpiry).getTime() - firstSession.expiresAt.getTime(),
    ) < 1000,
  );
  assert.equal(
    await client.merchantMembership.count({
      where: { userId: created.user.id },
    }),
    0,
  );
});

void test('upgrades a weaker password hash without changing passwordChangedAt', async () => {
  const weakerHash = await hash(PASSWORD, {
    type: argon2id,
    memoryCost: 4096,
    timeCost: 1,
    parallelism: 1,
    hashLength: 32,
  });
  const passwordChangedAt = new Date('2025-01-02T03:04:05.678Z');
  const created = await createUser({
    passwordHash: weakerHash,
    passwordChangedAt,
  });
  const response = await login(created.localPhone, PASSWORD);
  assert.equal(response.status, 200);

  const credential = await client.passwordCredential.findUniqueOrThrow({
    where: { userId: created.user.id },
  });
  assert.notEqual(credential.passwordHash, weakerHash);
  assert.equal(await verifyPassword(PASSWORD, credential.passwordHash), true);
  assert.equal(passwordNeedsRehash(credential.passwordHash), false);
  assert.equal(
    credential.passwordChangedAt.getTime(),
    passwordChangedAt.getTime(),
  );
});
