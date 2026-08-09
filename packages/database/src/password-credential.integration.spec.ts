import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { hashPassword, verifyPassword } from '@tteeka/security';

import { createPrismaClient, disconnectPrismaClient } from './client';

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error(
    'Password credential integration tests require DATABASE_URL.',
  );
}

const client = createPrismaClient({ databaseUrl });
const SYNTHETIC_STORED_HASH = '$argon2id$synthetic-database-test-value';
const TEST_DISPLAY_NAME_PREFIX = 'B1.2 Credential Test';

after(async () => {
  await disconnectPrismaClient(client);
});

interface TestRecords {
  readonly merchantIds: string[];
  readonly userIds: string[];
  readonly membershipIds: string[];
  readonly credentialIds: string[];
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
    credentialIds: [],
  };

  try {
    return await exercise(records);
  } finally {
    await client.merchantMembership.deleteMany({
      where: {
        OR: [
          { id: { in: records.membershipIds } },
          { merchantId: { in: records.merchantIds } },
          { userId: { in: records.userIds } },
        ],
      },
    });
    await client.passwordCredential.deleteMany({
      where: {
        OR: [
          { id: { in: records.credentialIds } },
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
      displayName: `${TEST_DISPLAY_NAME_PREFIX} ${randomUUID()}`,
      phoneE164: uniquePhone(),
    },
  });
  records.userIds.push(user.id);
  return user;
}

async function createCredential(
  records: TestRecords,
  userId: string,
  passwordHash = SYNTHETIC_STORED_HASH,
) {
  const credential = await client.passwordCredential.create({
    data: { userId, passwordHash },
  });
  records.credentialIds.push(credential.id);
  return credential;
}

async function uuidVersion(id: string): Promise<number> {
  const rows = await client.$queryRaw<{ version: number }[]>`
    SELECT uuid_extract_version(${id}::uuid)::integer AS version
  `;

  assert.equal(rows.length, 1);
  return rows[0]!.version;
}

void test('a User can exist without a PasswordCredential', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const persisted = await client.user.findUnique({
      where: { id: user.id },
      include: { passwordCredential: true },
    });

    assert.equal(persisted?.passwordCredential, null);
  });
});

void test('creates a PasswordCredential for a User', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const credential = await createCredential(records, user.id);

    assert.equal(credential.userId, user.id);
  });
});

void test('generates PasswordCredential IDs as UUIDv7 in PostgreSQL', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const credential = await createCredential(records, user.id);

    assert.equal(await uuidVersion(credential.id), 7);
  });
});

void test('populates passwordChangedAt by default', async () => {
  await withTestRecords(async (records) => {
    const beforeCreate = new Date();
    const user = await createUser(records);
    const credential = await createCredential(records, user.id);

    assert.ok(credential.passwordChangedAt instanceof Date);
    assert.ok(credential.passwordChangedAt >= beforeCreate);
  });
});

void test('populates createdAt by default', async () => {
  await withTestRecords(async (records) => {
    const beforeCreate = new Date();
    const user = await createUser(records);
    const credential = await createCredential(records, user.id);

    assert.ok(credential.createdAt instanceof Date);
    assert.ok(credential.createdAt >= beforeCreate);
  });
});

void test('allows exactly one PasswordCredential per User', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    await createCredential(records, user.id);

    assert.equal(
      await client.passwordCredential.count({ where: { userId: user.id } }),
      1,
    );
  });
});

void test('rejects a duplicate PasswordCredential for the same User', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    await createCredential(records, user.id);

    await assert.rejects(
      client.passwordCredential.create({
        data: { userId: user.id, passwordHash: SYNTHETIC_STORED_HASH },
      }),
    );
  });
});

void test('rejects a PasswordCredential with a nonexistent User', async () => {
  await withTestRecords(async () => {
    await assert.rejects(
      client.passwordCredential.create({
        data: {
          userId: randomUUID(),
          passwordHash: SYNTHETIC_STORED_HASH,
        },
      }),
    );
  });
});

void test('persists passwordHash exactly as supplied', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const credential = await createCredential(records, user.id);
    const persisted = await client.passwordCredential.findUniqueOrThrow({
      where: { id: credential.id },
    });

    assert.equal(persisted.passwordHash, SYNTHETIC_STORED_HASH);
  });
});

void test('updates a stored passwordHash', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const credential = await createCredential(records, user.id);
    const replacementHash = '$argon2id$synthetic-replacement-value';
    const updated = await client.passwordCredential.update({
      where: { id: credential.id },
      data: { passwordHash: replacementHash },
    });

    assert.equal(updated.passwordHash, replacementHash);
  });
});

void test('updates passwordChangedAt with a credential change', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const credential = await createCredential(records, user.id);
    const changedAt = new Date(credential.passwordChangedAt.getTime() + 1000);
    const updated = await client.passwordCredential.update({
      where: { id: credential.id },
      data: {
        passwordHash: '$argon2id$synthetic-changed-value',
        passwordChangedAt: changedAt,
      },
    });

    assert.equal(updated.passwordChangedAt.getTime(), changedAt.getTime());
  });
});

void test('deleting a PasswordCredential does not delete its User', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const credential = await createCredential(records, user.id);

    await client.passwordCredential.delete({ where: { id: credential.id } });

    assert.equal(await client.user.count({ where: { id: user.id } }), 1);
  });
});

void test('deleting an unreferenced User cascades to PasswordCredential', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    const credential = await createCredential(records, user.id);

    await client.user.delete({ where: { id: user.id } });

    assert.equal(
      await client.passwordCredential.count({ where: { id: credential.id } }),
      0,
    );
  });
});

void test('MerchantMembership still restricts deletion of a credentialed User', async () => {
  await withTestRecords(async (records) => {
    const merchant = await client.merchant.create({
      data: { displayName: `${TEST_DISPLAY_NAME_PREFIX} Merchant` },
    });
    records.merchantIds.push(merchant.id);
    const user = await createUser(records);
    const credential = await createCredential(records, user.id);
    const membership = await client.merchantMembership.create({
      data: { merchantId: merchant.id, userId: user.id },
    });
    records.membershipIds.push(membership.id);

    await assert.rejects(client.user.delete({ where: { id: user.id } }));
    assert.equal(
      await client.passwordCredential.count({ where: { id: credential.id } }),
      1,
    );
  });
});

void test('creates the unique user_id database index', async () => {
  const rows = await client.$queryRaw<{ indexDefinition: string }[]>`
    SELECT indexdef AS "indexDefinition"
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'password_credentials'
      AND indexname = 'password_credentials_user_id_key'
  `;

  assert.equal(rows.length, 1);
  assert.match(rows[0]!.indexDefinition, /CREATE UNIQUE INDEX/);
  assert.match(rows[0]!.indexDefinition, /\(user_id\)/);
});

void test('creates the expected PasswordCredential User foreign key', async () => {
  const rows = await client.$queryRaw<
    { constraintName: string; referencedTable: string }[]
  >`
    SELECT tc.constraint_name AS "constraintName",
           ccu.table_name AS "referencedTable"
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_schema = tc.constraint_schema
     AND ccu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'password_credentials'
      AND tc.constraint_type = 'FOREIGN KEY'
  `;

  assert.deepEqual(rows, [
    {
      constraintName: 'password_credentials_user_id_fkey',
      referencedTable: 'users',
    },
  ]);
});

void test('PasswordCredential User foreign key uses ON DELETE CASCADE', async () => {
  const rows = await client.$queryRaw<{ deleteAction: string }[]>`
    SELECT delete_rule AS "deleteAction"
    FROM information_schema.referential_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'password_credentials_user_id_fkey'
  `;

  assert.deepEqual(rows, [{ deleteAction: 'CASCADE' }]);
});

void test('password_hash uses varchar(512)', async () => {
  const rows = await client.$queryRaw<
    { dataType: string; maximumLength: number }[]
  >`
    SELECT data_type AS "dataType",
           character_maximum_length AS "maximumLength"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'password_credentials'
      AND column_name = 'password_hash'
  `;

  assert.deepEqual(rows, [
    { dataType: 'character varying', maximumLength: 512 },
  ]);
});

void test('PasswordCredential timestamps use timestamptz', async () => {
  const rows = await client.$queryRaw<{ dataType: string; count: bigint }[]>`
    SELECT data_type AS "dataType", count(*) AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'password_credentials'
      AND column_name IN ('password_changed_at', 'created_at', 'updated_at')
    GROUP BY data_type
  `;

  assert.deepEqual(rows, [
    { dataType: 'timestamp with time zone', count: BigInt(3) },
  ]);
});

void test('credential integration cleanup leaves no B1.2 test data', async () => {
  assert.equal(
    await client.user.count({
      where: { displayName: { startsWith: TEST_DISPLAY_NAME_PREFIX } },
    }),
    0,
  );
});

void test('only an encoded hash crosses the security/database boundary', async () => {
  await withTestRecords(async (records) => {
    const plaintext = 'Synthetic-Boundary-Password';
    const encodedHash = await hashPassword(plaintext);
    const user = await createUser(records);
    const credential = await createCredential(records, user.id, encodedHash);
    const persisted = await client.passwordCredential.findUniqueOrThrow({
      where: { id: credential.id },
    });

    assert.equal(persisted.passwordHash, encodedHash);
    assert.notEqual(persisted.passwordHash, plaintext);
    assert.equal(await verifyPassword(plaintext, persisted.passwordHash), true);
  });
});
