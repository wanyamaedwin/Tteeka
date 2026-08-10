import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { createSessionToken, hashSessionToken } from '@tteeka/security';

import { createPrismaClient, disconnectPrismaClient } from './client';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Session integration tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const TEST_PREFIX = 'B1.4 Session Test';
const SYNTHETIC_HASH = 'a'.repeat(64);

after(async () => disconnectPrismaClient(client));

interface TestRecords {
  readonly merchantIds: string[];
  readonly userIds: string[];
  readonly membershipIds: string[];
  readonly sessionIds: string[];
}

function uniquePhone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}

async function withTestRecords<T>(
  exercise: (records: TestRecords) => Promise<T>,
): Promise<T> {
  const records: TestRecords = {
    merchantIds: [],
    userIds: [],
    membershipIds: [],
    sessionIds: [],
  };
  try {
    return await exercise(records);
  } finally {
    await client.session.deleteMany({
      where: {
        OR: [
          { id: { in: records.sessionIds } },
          { userId: { in: records.userIds } },
        ],
      },
    });
    await client.merchantMembership.deleteMany({
      where: {
        OR: [
          { id: { in: records.membershipIds } },
          { userId: { in: records.userIds } },
        ],
      },
    });
    await client.merchant.deleteMany({
      where: { id: { in: records.merchantIds } },
    });
    await client.user.deleteMany({ where: { id: { in: records.userIds } } });
  }
}

async function createUser(records: TestRecords) {
  const user = await client.user.create({
    data: {
      displayName: `${TEST_PREFIX} ${randomUUID()}`,
      phoneE164: uniquePhone(),
    },
  });
  records.userIds.push(user.id);
  return user;
}

async function createSession(
  records: TestRecords,
  userId: string,
  overrides: Partial<{
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }> = {},
) {
  const session = await client.session.create({
    data: {
      userId,
      tokenHash: overrides.tokenHash ?? hashSessionToken(randomUUID()),
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3_600_000),
      ...(overrides.userAgent === undefined
        ? {}
        : { userAgent: overrides.userAgent }),
      ...(overrides.ipAddress === undefined
        ? {}
        : { ipAddress: overrides.ipAddress }),
    },
  });
  records.sessionIds.push(session.id);
  return session;
}

void test('a User can exist with zero Sessions', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const found = await client.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { sessions: true },
    });
    assert.deepEqual(found.sessions, []);
  });
});

void test('creates a Session for a User', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    assert.equal((await createSession(records, user.id)).userId, user.id);
  });
});

void test('generates Session IDs as UUIDv7', async () => {
  await withTestRecords(async (records) => {
    const session = await createSession(
      records,
      (await createUser(records)).id,
    );
    const rows = await client.$queryRaw<
      { version: number }[]
    >`SELECT uuid_extract_version(${session.id}::uuid)::integer AS version`;
    assert.deepEqual(rows, [{ version: 7 }]);
  });
});

void test('persists tokenHash exactly and never persists the raw token', async () => {
  await withTestRecords(async (records) => {
    const created = createSessionToken();
    const session = await createSession(
      records,
      (await createUser(records)).id,
      { tokenHash: created.tokenHash },
    );
    const stored = await client.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    assert.equal(stored.tokenHash, created.tokenHash);
    assert.notEqual(stored.tokenHash, created.token);
    assert.equal(Object.values(stored).includes(created.token), false);
    assert.equal(hashSessionToken(created.token), stored.tokenHash);
  });
});

void test('rejects duplicate tokenHash values', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    await createSession(records, user.id, { tokenHash: SYNTHETIC_HASH });
    await assert.rejects(
      client.session.create({
        data: {
          userId: user.id,
          tokenHash: SYNTHETIC_HASH,
          expiresAt: new Date(Date.now() + 1000),
        },
      }),
    );
  });
});

void test('allows different Sessions for the same User', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    await createSession(records, user.id);
    await createSession(records, user.id);
    assert.equal(await client.session.count({ where: { userId: user.id } }), 2);
  });
});

void test('allows Sessions for different Users', async () => {
  await withTestRecords(async (records) => {
    await createSession(records, (await createUser(records)).id);
    await createSession(records, (await createUser(records)).id);
    assert.equal(records.sessionIds.length, 2);
  });
});

void test('rejects a nonexistent userId', async () => {
  await withTestRecords(async () => {
    await assert.rejects(
      client.session.create({
        data: {
          userId: randomUUID(),
          tokenHash: hashSessionToken(randomUUID()),
          expiresAt: new Date(),
        },
      }),
    );
  });
});

void test('createdAt is populated', async () => {
  await withTestRecords(async (records) => {
    const before = new Date();
    const session = await createSession(
      records,
      (await createUser(records)).id,
    );
    assert.ok(session.createdAt >= before);
  });
});

void test('lastUsedAt defaults on creation', async () => {
  await withTestRecords(async (records) => {
    const before = new Date();
    const session = await createSession(
      records,
      (await createUser(records)).id,
    );
    assert.ok(session.lastUsedAt >= before);
  });
});

void test('expiresAt persists the deliberately supplied value', async () => {
  await withTestRecords(async (records) => {
    const expiresAt = new Date('2030-01-02T03:04:05.678Z');
    const session = await createSession(
      records,
      (await createUser(records)).id,
      { expiresAt },
    );
    assert.equal(session.expiresAt.getTime(), expiresAt.getTime());
  });
});

void test('revokedAt defaults to null', async () => {
  await withTestRecords(async (records) => {
    assert.equal(
      (await createSession(records, (await createUser(records)).id)).revokedAt,
      null,
    );
  });
});

void test('a Session can be revoked without deletion', async () => {
  await withTestRecords(async (records) => {
    const session = await createSession(
      records,
      (await createUser(records)).id,
    );
    const revokedAt = new Date();
    const updated = await client.session.update({
      where: { id: session.id },
      data: { revokedAt },
    });
    assert.equal(updated.revokedAt?.getTime(), revokedAt.getTime());
    assert.equal(await client.session.count({ where: { id: session.id } }), 1);
  });
});

void test('lastUsedAt can be advanced explicitly', async () => {
  await withTestRecords(async (records) => {
    const session = await createSession(
      records,
      (await createUser(records)).id,
    );
    const advanced = new Date(session.lastUsedAt.getTime() + 60_000);
    const updated = await client.session.update({
      where: { id: session.id },
      data: { lastUsedAt: advanced },
    });
    assert.equal(updated.lastUsedAt.getTime(), advanced.getTime());
  });
});

void test('an expired Session remains as historical metadata', async () => {
  await withTestRecords(async (records) => {
    const session = await createSession(
      records,
      (await createUser(records)).id,
      { expiresAt: new Date(Date.now() - 1000) },
    );
    assert.equal(await client.session.count({ where: { id: session.id } }), 1);
  });
});

void test('deleting a Session does not delete its User', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const session = await createSession(records, user.id);
    await client.session.delete({ where: { id: session.id } });
    assert.equal(await client.user.count({ where: { id: user.id } }), 1);
  });
});

void test('deleting an otherwise-unreferenced User cascades Sessions', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const session = await createSession(records, user.id);
    await client.user.delete({ where: { id: user.id } });
    assert.equal(await client.session.count({ where: { id: session.id } }), 0);
  });
});

void test('MerchantMembership restricts User deletion and preserves Sessions', async () => {
  await withTestRecords(async (records) => {
    const merchant = await client.merchant.create({
      data: { displayName: `${TEST_PREFIX} Merchant` },
    });
    records.merchantIds.push(merchant.id);
    const user = await createUser(records);
    const session = await createSession(records, user.id);
    const membership = await client.merchantMembership.create({
      data: { merchantId: merchant.id, userId: user.id },
    });
    records.membershipIds.push(membership.id);
    await assert.rejects(client.user.delete({ where: { id: user.id } }));
    assert.equal(await client.session.count({ where: { id: session.id } }), 1);
  });
});

void test('userAgent persists when supplied', async () => {
  await withTestRecords(async (records) => {
    const value = 'Synthetic Browser/1.0';
    assert.equal(
      (
        await createSession(records, (await createUser(records)).id, {
          userAgent: value,
        })
      ).userAgent,
      value,
    );
  });
});

void test('userAgent may be null', async () => {
  await withTestRecords(async (records) => {
    assert.equal(
      (await createSession(records, (await createUser(records)).id)).userAgent,
      null,
    );
  });
});

void test('ipAddress supports IPv4 text', async () => {
  await withTestRecords(async (records) => {
    assert.equal(
      (
        await createSession(records, (await createUser(records)).id, {
          ipAddress: '192.0.2.10',
        })
      ).ipAddress,
      '192.0.2.10',
    );
  });
});

void test('ipAddress supports IPv6 text', async () => {
  await withTestRecords(async (records) => {
    assert.equal(
      (
        await createSession(records, (await createUser(records)).id, {
          ipAddress: '2001:db8::10',
        })
      ).ipAddress,
      '2001:db8::10',
    );
  });
});

void test('ipAddress may be null', async () => {
  await withTestRecords(async (records) => {
    assert.equal(
      (await createSession(records, (await createUser(records)).id)).ipAddress,
      null,
    );
  });
});

void test('token_hash uses char(64)', async () => {
  const rows = await client.$queryRaw<
    { dataType: string; maximumLength: number }[]
  >`
    SELECT data_type AS "dataType", character_maximum_length AS "maximumLength"
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'token_hash'`;
  assert.deepEqual(rows, [{ dataType: 'character', maximumLength: 64 }]);
});

void test('Session lifecycle timestamps use timestamptz', async () => {
  const rows = await client.$queryRaw<{ dataType: string; count: bigint }[]>`
    SELECT data_type AS "dataType", count(*) AS count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions'
      AND column_name IN ('created_at', 'last_used_at', 'expires_at', 'revoked_at') GROUP BY data_type`;
  assert.deepEqual(rows, [
    { dataType: 'timestamp with time zone', count: BigInt(4) },
  ]);
});

void test('creates the expected Session User foreign key', async () => {
  const rows = await client.$queryRaw<
    { constraintName: string; referencedTable: string }[]
  >`
    SELECT tc.constraint_name AS "constraintName", ccu.table_name AS "referencedTable"
    FROM information_schema.table_constraints tc JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema = tc.constraint_schema AND ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'sessions' AND tc.constraint_type = 'FOREIGN KEY'`;
  assert.deepEqual(rows, [
    { constraintName: 'sessions_user_id_fkey', referencedTable: 'users' },
  ]);
});

void test('Session User foreign key cascades deletes and updates', async () => {
  const rows = await client.$queryRaw<
    { deleteAction: string; updateAction: string }[]
  >`
    SELECT delete_rule AS "deleteAction", update_rule AS "updateAction"
    FROM information_schema.referential_constraints
    WHERE constraint_schema = 'public' AND constraint_name = 'sessions_user_id_fkey'`;
  assert.deepEqual(rows, [
    { deleteAction: 'CASCADE', updateAction: 'CASCADE' },
  ]);
});

void test('creates the unique token hash index', async () => {
  const rows = await client.$queryRaw<{ indexDefinition: string }[]>`
    SELECT indexdef AS "indexDefinition" FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'sessions' AND indexname = 'sessions_token_hash_key'`;
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.indexDefinition, /CREATE UNIQUE INDEX/);
  assert.match(rows[0]!.indexDefinition, /\(token_hash\)/);
});

void test('creates the User revocation expiry lookup index', async () => {
  const rows = await client.$queryRaw<{ indexDefinition: string }[]>`
    SELECT indexdef AS "indexDefinition" FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'sessions'
      AND indexname = 'sessions_user_id_revoked_at_expires_at_idx'`;
  assert.equal(rows.length, 1);
  assert.ok(
    rows[0]!.indexDefinition
      .replaceAll('"', '')
      .includes('(user_id, revoked_at, expires_at)'),
  );
});

void test('expires_at has no database default', async () => {
  const rows = await client.$queryRaw<{ columnDefault: string | null }[]>`
    SELECT column_default AS "columnDefault" FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'expires_at'`;
  assert.deepEqual(rows, [{ columnDefault: null }]);
});

void test('session integration cleanup leaves no B1.4 synthetic data', async () => {
  assert.equal(
    await client.session.count({
      where: { user: { displayName: { startsWith: TEST_PREFIX } } },
    }),
    0,
  );
  assert.equal(
    await client.user.count({
      where: { displayName: { startsWith: TEST_PREFIX } },
    }),
    0,
  );
});
