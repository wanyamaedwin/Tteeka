import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from './client';

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Identity integration tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });

after(async () => {
  await disconnectPrismaClient(client);
});

function uniquePhone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}

function uniqueEmail(): string {
  return `${randomUUID()}@identity.test`;
}

interface TestRecords {
  readonly merchantIds: string[];
  readonly userIds: string[];
  readonly membershipIds: string[];
}

async function withTestRecords<T>(
  exercise: (records: TestRecords) => Promise<T>,
): Promise<T> {
  const records: TestRecords = {
    merchantIds: [],
    userIds: [],
    membershipIds: [],
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
    await client.merchant.deleteMany({
      where: { id: { in: records.merchantIds } },
    });
    await client.user.deleteMany({ where: { id: { in: records.userIds } } });
  }
}

async function createMerchant(records: TestRecords) {
  const merchant = await client.merchant.create({
    data: { displayName: `Integration Merchant ${randomUUID()}` },
  });
  records.merchantIds.push(merchant.id);
  return merchant;
}

async function createUser(records: TestRecords, email?: string | null) {
  const user = await client.user.create({
    data: {
      displayName: `Integration User ${randomUUID()}`,
      phoneE164: uniquePhone(),
      ...(email === undefined ? {} : { email }),
    },
  });
  records.userIds.push(user.id);
  return user;
}

async function createMembership(
  records: TestRecords,
  merchantId: string,
  userId: string,
) {
  const membership = await client.merchantMembership.create({
    data: { merchantId, userId },
  });
  records.membershipIds.push(membership.id);
  return membership;
}

async function uuidVersion(id: string): Promise<number> {
  const rows = await client.$queryRaw<{ version: number }[]>`
    SELECT uuid_extract_version(${id}::uuid)::integer AS version
  `;

  assert.equal(rows.length, 1);
  return rows[0]!.version;
}

void test('creates a Merchant', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    assert.equal(merchant.displayName.startsWith('Integration Merchant'), true);
  });
});

void test('applies Merchant defaults', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    assert.equal(merchant.status, 'ACTIVE');
    assert.equal(merchant.currency, 'UGX');
    assert.equal(merchant.timezone, 'Africa/Kampala');
  });
});

void test('generates Merchant IDs as UUIDv7 in PostgreSQL', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    assert.equal(await uuidVersion(merchant.id), 7);
  });
});

void test('creates a globally identifiable User without a merchantId', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    assert.equal(user.displayName.startsWith('Integration User'), true);
    assert.equal('merchantId' in user, false);
  });
});

void test('defaults User status to ACTIVE', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    assert.equal(user.status, 'ACTIVE');
  });
});

void test('generates User IDs as UUIDv7 in PostgreSQL', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    assert.equal(await uuidVersion(user.id), 7);
  });
});

void test('rejects duplicate User phoneE164 values', async () => {
  await withTestRecords(async (records) => {
    const first = await createUser(records);

    await assert.rejects(
      client.user.create({
        data: {
          displayName: 'Duplicate phone user',
          phoneE164: first.phoneE164,
        },
      }),
    );
  });
});

void test('rejects duplicate non-null User email values', async () => {
  await withTestRecords(async (records) => {
    const email = uniqueEmail();
    await createUser(records, email);

    await assert.rejects(
      client.user.create({
        data: {
          displayName: 'Duplicate email user',
          phoneE164: uniquePhone(),
          email,
        },
      }),
    );
  });
});

void test('allows multiple Users to belong to one Merchant', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const firstUser = await createUser(records);
    const secondUser = await createUser(records);
    await createMembership(records, merchant.id, firstUser.id);
    await createMembership(records, merchant.id, secondUser.id);

    assert.equal(
      await client.merchantMembership.count({
        where: { merchantId: merchant.id },
      }),
      2,
    );
  });
});

void test('allows one User to belong to multiple Merchants', async () => {
  await withTestRecords(async (records) => {
    const firstMerchant = await createMerchant(records);
    const secondMerchant = await createMerchant(records);
    const user = await createUser(records);
    await createMembership(records, firstMerchant.id, user.id);
    await createMembership(records, secondMerchant.id, user.id);

    assert.equal(
      await client.merchantMembership.count({ where: { userId: user.id } }),
      2,
    );
  });
});

void test('rejects duplicate MerchantMembership pairs', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    await createMembership(records, merchant.id, user.id);

    await assert.rejects(
      client.merchantMembership.create({
        data: { merchantId: merchant.id, userId: user.id },
      }),
    );
  });
});

void test('defaults MerchantMembership status to ACTIVE', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);
    assert.equal(membership.status, 'ACTIVE');
  });
});

void test('generates MerchantMembership IDs as UUIDv7 in PostgreSQL', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);
    assert.equal(await uuidVersion(membership.id), 7);
  });
});

void test('rejects a membership with a nonexistent Merchant', async () => {
  await withTestRecords(async (records) => {
    const user = await createUser(records);
    await assert.rejects(
      client.merchantMembership.create({
        data: { merchantId: randomUUID(), userId: user.id },
      }),
    );
  });
});

void test('rejects a membership with a nonexistent User', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    await assert.rejects(
      client.merchantMembership.create({
        data: { merchantId: merchant.id, userId: randomUUID() },
      }),
    );
  });
});

void test('restricts hard deletion of a referenced Merchant', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    await createMembership(records, merchant.id, user.id);
    await assert.rejects(
      client.merchant.delete({ where: { id: merchant.id } }),
    );
  });
});

void test('restricts hard deletion of a referenced User', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    await createMembership(records, merchant.id, user.id);
    await assert.rejects(client.user.delete({ where: { id: user.id } }));
  });
});

void test('disabling a Membership preserves its Merchant and User', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);

    const updated = await client.merchantMembership.update({
      where: { id: membership.id },
      data: { status: 'DISABLED' },
    });

    assert.equal(updated.status, 'DISABLED');
    assert.equal(
      await client.merchant.count({ where: { id: merchant.id } }),
      1,
    );
    assert.equal(await client.user.count({ where: { id: user.id } }), 1);
  });
});

void test('disabling a User preserves its Memberships', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);

    const updated = await client.user.update({
      where: { id: user.id },
      data: { status: 'DISABLED' },
    });

    assert.equal(updated.status, 'DISABLED');
    assert.equal(
      await client.merchantMembership.count({ where: { id: membership.id } }),
      1,
    );
  });
});

void test('archiving a Merchant preserves its Memberships', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);

    const updated = await client.merchant.update({
      where: { id: merchant.id },
      data: { status: 'ARCHIVED' },
    });

    assert.equal(updated.status, 'ARCHIVED');
    assert.equal(
      await client.merchantMembership.count({ where: { id: membership.id } }),
      1,
    );
  });
});

void test('uses UUID columns with database-generated uuidv7 defaults', async () => {
  const rows = await client.$queryRaw<
    {
      columnName: string;
      dataType: string;
      columnDefault: string | null;
    }[]
  >`
    SELECT column_name AS "columnName",
           data_type AS "dataType",
           column_default AS "columnDefault"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('merchants', 'users', 'merchant_memberships')
      AND column_name = 'id'
    ORDER BY table_name
  `;

  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.dataType, 'uuid');
    assert.equal(row.columnDefault, 'uuidv7()');
  }
});

void test('uses timestamptz for all identity timestamps', async () => {
  const rows = await client.$queryRaw<{ dataType: string; count: bigint }[]>`
    SELECT data_type AS "dataType", count(*) AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('merchants', 'users', 'merchant_memberships')
      AND column_name IN ('created_at', 'updated_at')
    GROUP BY data_type
  `;

  assert.deepEqual(rows, [
    { dataType: 'timestamp with time zone', count: BigInt(6) },
  ]);
});

void test('creates the explicitly named identity indexes', async () => {
  const expected = [
    'merchant_memberships_merchant_id_status_idx',
    'merchant_memberships_merchant_id_user_id_key',
    'merchant_memberships_user_id_status_idx',
    'merchants_status_idx',
    'users_email_key',
    'users_phone_e164_key',
    'users_status_idx',
  ];
  const rows = await client.$queryRaw<{ indexName: string }[]>`
    SELECT indexname AS "indexName"
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY(${expected}::text[])
    ORDER BY indexname
  `;

  assert.deepEqual(
    rows.map((row) => row.indexName),
    [...expected].sort(),
  );
});

void test('creates restrictive identity foreign keys', async () => {
  const rows = await client.$queryRaw<
    { constraintName: string; deleteAction: string }[]
  >`
    SELECT tc.constraint_name AS "constraintName",
           rc.delete_rule AS "deleteAction"
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_schema = tc.constraint_schema
     AND rc.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'merchant_memberships'
      AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.constraint_name
  `;

  assert.deepEqual(rows, [
    {
      constraintName: 'merchant_memberships_merchant_id_fkey',
      deleteAction: 'RESTRICT',
    },
    {
      constraintName: 'merchant_memberships_user_id_fkey',
      deleteAction: 'RESTRICT',
    },
  ]);
});
