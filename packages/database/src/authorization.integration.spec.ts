import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from './client';

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Authorization integration tests require DATABASE_URL.');
}

const client = createPrismaClient({ databaseUrl });
const TEST_PREFIX = 'B1.3 Authorization Test';

after(async () => {
  await disconnectPrismaClient(client);
});

interface TestRecords {
  readonly merchantIds: string[];
  readonly userIds: string[];
  readonly membershipIds: string[];
  readonly permissionIds: string[];
  readonly roleIds: string[];
  readonly membershipRoleIds: string[];
  readonly rolePermissionIds: string[];
}

function uniquePhone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}

function uniquePermissionKey(): string {
  return `test.${randomUUID()}`;
}

async function withTestRecords<T>(
  exercise: (records: TestRecords) => Promise<T>,
): Promise<T> {
  const records: TestRecords = {
    merchantIds: [],
    userIds: [],
    membershipIds: [],
    permissionIds: [],
    roleIds: [],
    membershipRoleIds: [],
    rolePermissionIds: [],
  };

  try {
    return await exercise(records);
  } finally {
    await client.rolePermission.deleteMany({
      where: {
        OR: [
          { id: { in: records.rolePermissionIds } },
          { merchantId: { in: records.merchantIds } },
          { roleId: { in: records.roleIds } },
          { permissionId: { in: records.permissionIds } },
        ],
      },
    });
    await client.membershipRole.deleteMany({
      where: {
        OR: [
          { id: { in: records.membershipRoleIds } },
          { merchantId: { in: records.merchantIds } },
          { membershipId: { in: records.membershipIds } },
          { roleId: { in: records.roleIds } },
        ],
      },
    });
    await client.role.deleteMany({ where: { id: { in: records.roleIds } } });
    await client.merchantMembership.deleteMany({
      where: { id: { in: records.membershipIds } },
    });
    await client.permission.deleteMany({
      where: { id: { in: records.permissionIds } },
    });
    await client.merchant.deleteMany({
      where: { id: { in: records.merchantIds } },
    });
    await client.user.deleteMany({ where: { id: { in: records.userIds } } });
  }
}

async function createMerchant(records: TestRecords) {
  const merchant = await client.merchant.create({
    data: { displayName: `${TEST_PREFIX} Merchant ${randomUUID()}` },
  });
  records.merchantIds.push(merchant.id);
  return merchant;
}

async function createUser(records: TestRecords) {
  const user = await client.user.create({
    data: {
      displayName: `${TEST_PREFIX} User ${randomUUID()}`,
      phoneE164: uniquePhone(),
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

async function createPermission(
  records: TestRecords,
  key = uniquePermissionKey(),
) {
  const permission = await client.permission.create({
    data: { key, description: `${TEST_PREFIX} permission` },
  });
  records.permissionIds.push(permission.id);
  return permission;
}

async function createRole(
  records: TestRecords,
  merchantId: string,
  name = `${TEST_PREFIX} Role ${randomUUID()}`,
) {
  const role = await client.role.create({
    data: { merchantId, name, description: `${TEST_PREFIX} role` },
  });
  records.roleIds.push(role.id);
  return role;
}

async function createMembershipRole(
  records: TestRecords,
  merchantId: string,
  membershipId: string,
  roleId: string,
) {
  const assignment = await client.membershipRole.create({
    data: { merchantId, membershipId, roleId },
  });
  records.membershipRoleIds.push(assignment.id);
  return assignment;
}

async function createRolePermission(
  records: TestRecords,
  merchantId: string,
  roleId: string,
  permissionId: string,
) {
  const assignment = await client.rolePermission.create({
    data: { merchantId, roleId, permissionId },
  });
  records.rolePermissionIds.push(assignment.id);
  return assignment;
}

async function uuidVersion(id: string): Promise<number> {
  const rows = await client.$queryRaw<{ version: number }[]>`
    SELECT uuid_extract_version(${id}::uuid)::integer AS version
  `;
  assert.equal(rows.length, 1);
  return rows[0]!.version;
}

void test('creates a global Permission with ACTIVE default and timestamps', async () => {
  await withTestRecords(async (records) => {
    const before = new Date();
    const permission = await createPermission(records);

    assert.equal(permission.status, 'ACTIVE');
    assert.ok(permission.createdAt >= before);
    assert.ok(permission.updatedAt >= before);
  });
});

void test('generates Permission IDs as UUIDv7 in PostgreSQL', async () => {
  await withTestRecords(async (records) => {
    const permission = await createPermission(records);
    assert.equal(await uuidVersion(permission.id), 7);
  });
});

void test('rejects duplicate global Permission keys', async () => {
  await withTestRecords(async (records) => {
    const permission = await createPermission(records);
    await assert.rejects(
      client.permission.create({ data: { key: permission.key } }),
    );
  });
});

void test('deprecating a Permission preserves it', async () => {
  await withTestRecords(async (records) => {
    const permission = await createPermission(records);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await client.permission.update({
      where: { id: permission.id },
      data: { status: 'DEPRECATED' },
    });

    assert.equal(updated.status, 'DEPRECATED');
    assert.ok(updated.updatedAt > permission.updatedAt);
    assert.equal(
      await client.permission.count({ where: { id: permission.id } }),
      1,
    );
  });
});

void test('creates a merchant Role with ACTIVE default and timestamps', async () => {
  await withTestRecords(async (records) => {
    const before = new Date();
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);

    assert.equal(role.merchantId, merchant.id);
    assert.equal(role.status, 'ACTIVE');
    assert.ok(role.createdAt >= before);
    assert.ok(role.updatedAt >= before);
  });
});

void test('generates Role IDs as UUIDv7 in PostgreSQL', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    assert.equal(await uuidVersion(role.id), 7);
  });
});

void test('rejects the same Role name twice inside one Merchant', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    await assert.rejects(
      client.role.create({
        data: { merchantId: merchant.id, name: role.name },
      }),
    );
  });
});

void test('allows the same Role name across different Merchants', async () => {
  await withTestRecords(async (records) => {
    const merchantA = await createMerchant(records);
    const merchantB = await createMerchant(records);
    const name = `${TEST_PREFIX} Shared Role ${randomUUID()}`;
    const roleA = await createRole(records, merchantA.id, name);
    const roleB = await createRole(records, merchantB.id, name);

    assert.equal(roleA.name, roleB.name);
    assert.notEqual(roleA.merchantId, roleB.merchantId);
  });
});

void test('rejects a Role for a nonexistent Merchant', async () => {
  await withTestRecords(async () => {
    await assert.rejects(
      client.role.create({
        data: { merchantId: randomUUID(), name: `${TEST_PREFIX} Missing` },
      }),
    );
  });
});

void test('disabling a Role preserves the Role', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    const updated = await client.role.update({
      where: { id: role.id },
      data: { status: 'DISABLED' },
    });

    assert.equal(updated.status, 'DISABLED');
    assert.equal(await client.role.count({ where: { id: role.id } }), 1);
  });
});

void test('assigns a same-merchant Role to a Membership', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);
    const role = await createRole(records, merchant.id);
    const assignment = await createMembershipRole(
      records,
      merchant.id,
      membership.id,
      role.id,
    );

    assert.equal(assignment.membershipId, membership.id);
    assert.equal(assignment.roleId, role.id);
  });
});

void test('generates MembershipRole IDs as UUIDv7 in PostgreSQL', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);
    const role = await createRole(records, merchant.id);
    const assignment = await createMembershipRole(
      records,
      merchant.id,
      membership.id,
      role.id,
    );

    assert.equal(await uuidVersion(assignment.id), 7);
  });
});

void test('allows one Membership to receive multiple different Roles', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);
    const roleA = await createRole(records, merchant.id);
    const roleB = await createRole(records, merchant.id);
    await createMembershipRole(records, merchant.id, membership.id, roleA.id);
    await createMembershipRole(records, merchant.id, membership.id, roleB.id);

    assert.equal(
      await client.membershipRole.count({
        where: { membershipId: membership.id },
      }),
      2,
    );
  });
});

void test('allows one Role to be assigned to multiple Memberships', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const userA = await createUser(records);
    const userB = await createUser(records);
    const membershipA = await createMembership(records, merchant.id, userA.id);
    const membershipB = await createMembership(records, merchant.id, userB.id);
    const role = await createRole(records, merchant.id);
    await createMembershipRole(records, merchant.id, membershipA.id, role.id);
    await createMembershipRole(records, merchant.id, membershipB.id, role.id);

    assert.equal(
      await client.membershipRole.count({ where: { roleId: role.id } }),
      2,
    );
  });
});

void test('rejects duplicate Membership and Role assignments', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);
    const role = await createRole(records, merchant.id);
    await createMembershipRole(records, merchant.id, membership.id, role.id);

    await assert.rejects(
      client.membershipRole.create({
        data: {
          merchantId: merchant.id,
          membershipId: membership.id,
          roleId: role.id,
        },
      }),
    );
  });
});

void test('rejects MembershipRole with a nonexistent Membership', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    await assert.rejects(
      client.membershipRole.create({
        data: {
          merchantId: merchant.id,
          membershipId: randomUUID(),
          roleId: role.id,
        },
      }),
    );
  });
});

void test('rejects MembershipRole with a nonexistent Role', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);
    await assert.rejects(
      client.membershipRole.create({
        data: {
          merchantId: merchant.id,
          membershipId: membership.id,
          roleId: randomUUID(),
        },
      }),
    );
  });
});

void test('database rejects a direct cross-tenant MembershipRole attack', async () => {
  await withTestRecords(async (records) => {
    const merchantA = await createMerchant(records);
    const merchantB = await createMerchant(records);
    const user = await createUser(records);
    const membershipA = await createMembership(records, merchantA.id, user.id);
    const roleB = await createRole(records, merchantB.id);

    await assert.rejects(client.$executeRaw`
      INSERT INTO membership_roles
        (id, merchant_id, membership_id, role_id, created_at)
      VALUES
        (uuidv7(), ${merchantA.id}::uuid, ${membershipA.id}::uuid, ${roleB.id}::uuid, CURRENT_TIMESTAMP)
    `);
    assert.equal(
      await client.membershipRole.count({
        where: { membershipId: membershipA.id, roleId: roleB.id },
      }),
      0,
    );
  });
});

void test('physically deleting a Membership cascades MembershipRole rows', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);
    const role = await createRole(records, merchant.id);
    const assignment = await createMembershipRole(
      records,
      merchant.id,
      membership.id,
      role.id,
    );

    await client.merchantMembership.delete({ where: { id: membership.id } });
    assert.equal(
      await client.membershipRole.count({ where: { id: assignment.id } }),
      0,
    );
  });
});

void test('physically deleting a Role cascades MembershipRole rows', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);
    const role = await createRole(records, merchant.id);
    const assignment = await createMembershipRole(
      records,
      merchant.id,
      membership.id,
      role.id,
    );

    await client.role.delete({ where: { id: role.id } });
    assert.equal(
      await client.membershipRole.count({ where: { id: assignment.id } }),
      0,
    );
  });
});

void test('disabling Membership and Role preserves MembershipRole rows', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const user = await createUser(records);
    const membership = await createMembership(records, merchant.id, user.id);
    const role = await createRole(records, merchant.id);
    const assignment = await createMembershipRole(
      records,
      merchant.id,
      membership.id,
      role.id,
    );

    await client.merchantMembership.update({
      where: { id: membership.id },
      data: { status: 'DISABLED' },
    });
    await client.role.update({
      where: { id: role.id },
      data: { status: 'DISABLED' },
    });
    assert.equal(
      await client.membershipRole.count({ where: { id: assignment.id } }),
      1,
    );
  });
});

void test('assigns Permissions to Roles and generates RolePermission UUIDv7 IDs', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    const permission = await createPermission(records);
    const assignment = await createRolePermission(
      records,
      merchant.id,
      role.id,
      permission.id,
    );

    assert.equal(assignment.permissionId, permission.id);
    assert.equal(await uuidVersion(assignment.id), 7);
  });
});

void test('allows one Role to receive multiple Permissions', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    const permissionA = await createPermission(records);
    const permissionB = await createPermission(records);
    await createRolePermission(records, merchant.id, role.id, permissionA.id);
    await createRolePermission(records, merchant.id, role.id, permissionB.id);

    assert.equal(
      await client.rolePermission.count({ where: { roleId: role.id } }),
      2,
    );
  });
});

void test('allows one global Permission across Roles in different Merchants', async () => {
  await withTestRecords(async (records) => {
    const merchantA = await createMerchant(records);
    const merchantB = await createMerchant(records);
    const roleA = await createRole(records, merchantA.id);
    const roleB = await createRole(records, merchantB.id);
    const permission = await createPermission(records);
    await createRolePermission(records, merchantA.id, roleA.id, permission.id);
    await createRolePermission(records, merchantB.id, roleB.id, permission.id);

    assert.equal(
      await client.rolePermission.count({
        where: { permissionId: permission.id },
      }),
      2,
    );
  });
});

void test('rejects duplicate Role and Permission assignments', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    const permission = await createPermission(records);
    await createRolePermission(records, merchant.id, role.id, permission.id);

    await assert.rejects(
      client.rolePermission.create({
        data: {
          merchantId: merchant.id,
          roleId: role.id,
          permissionId: permission.id,
        },
      }),
    );
  });
});

void test('rejects RolePermission with a nonexistent Role', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const permission = await createPermission(records);
    await assert.rejects(
      client.rolePermission.create({
        data: {
          merchantId: merchant.id,
          roleId: randomUUID(),
          permissionId: permission.id,
        },
      }),
    );
  });
});

void test('rejects RolePermission with a nonexistent Permission', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    await assert.rejects(
      client.rolePermission.create({
        data: {
          merchantId: merchant.id,
          roleId: role.id,
          permissionId: randomUUID(),
        },
      }),
    );
  });
});

void test('database rejects a direct cross-tenant RolePermission attack', async () => {
  await withTestRecords(async (records) => {
    const merchantA = await createMerchant(records);
    const merchantB = await createMerchant(records);
    const roleB = await createRole(records, merchantB.id);
    const permission = await createPermission(records);

    await assert.rejects(client.$executeRaw`
      INSERT INTO role_permissions
        (id, merchant_id, role_id, permission_id, created_at)
      VALUES
        (uuidv7(), ${merchantA.id}::uuid, ${roleB.id}::uuid, ${permission.id}::uuid, CURRENT_TIMESTAMP)
    `);
    assert.equal(
      await client.rolePermission.count({
        where: { roleId: roleB.id, permissionId: permission.id },
      }),
      0,
    );
  });
});

void test('physically deleting a Role cascades RolePermission rows', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    const permission = await createPermission(records);
    const assignment = await createRolePermission(
      records,
      merchant.id,
      role.id,
      permission.id,
    );

    await client.role.delete({ where: { id: role.id } });
    assert.equal(
      await client.rolePermission.count({ where: { id: assignment.id } }),
      0,
    );
  });
});

void test('restricts deleting a referenced Permission', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    const permission = await createPermission(records);
    await createRolePermission(records, merchant.id, role.id, permission.id);

    await assert.rejects(
      client.permission.delete({ where: { id: permission.id } }),
    );
  });
});

void test('deprecating Permission and disabling Role preserve RolePermission rows', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    const role = await createRole(records, merchant.id);
    const permission = await createPermission(records);
    const assignment = await createRolePermission(
      records,
      merchant.id,
      role.id,
      permission.id,
    );

    await client.permission.update({
      where: { id: permission.id },
      data: { status: 'DEPRECATED' },
    });
    await client.role.update({
      where: { id: role.id },
      data: { status: 'DISABLED' },
    });
    assert.equal(
      await client.rolePermission.count({ where: { id: assignment.id } }),
      1,
    );
  });
});

void test('a Merchant with Role records cannot be hard-deleted', async () => {
  await withTestRecords(async (records) => {
    const merchant = await createMerchant(records);
    await createRole(records, merchant.id);
    await assert.rejects(
      client.merchant.delete({ where: { id: merchant.id } }),
    );
  });
});

void test('authorization IDs use UUID columns with uuidv7 defaults', async () => {
  const rows = await client.$queryRaw<
    { tableName: string; dataType: string; columnDefault: string | null }[]
  >`
    SELECT table_name AS "tableName",
           data_type AS "dataType",
           column_default AS "columnDefault"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('permissions', 'roles', 'membership_roles', 'role_permissions')
      AND column_name = 'id'
    ORDER BY table_name
  `;

  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.dataType, 'uuid');
    assert.equal(row.columnDefault, 'uuidv7()');
  }
});

void test('authorization timestamps use timestamptz', async () => {
  const rows = await client.$queryRaw<{ dataType: string; count: bigint }[]>`
    SELECT data_type AS "dataType", count(*) AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('permissions', 'roles', 'membership_roles', 'role_permissions')
      AND column_name IN ('created_at', 'updated_at')
    GROUP BY data_type
  `;

  assert.deepEqual(rows, [
    { dataType: 'timestamp with time zone', count: BigInt(6) },
  ]);
});

void test('creates tenant-safe composite authorization foreign keys with expected delete rules', async () => {
  const expected = [
    {
      constraintName: 'membership_roles_merchant_id_membership_id_fkey',
      deleteAction: 'CASCADE',
      definition:
        'FOREIGN KEY (merchant_id, membership_id) REFERENCES merchant_memberships(merchant_id, id) ON UPDATE CASCADE ON DELETE CASCADE',
    },
    {
      constraintName: 'membership_roles_merchant_id_role_id_fkey',
      deleteAction: 'CASCADE',
      definition:
        'FOREIGN KEY (merchant_id, role_id) REFERENCES roles(merchant_id, id) ON UPDATE CASCADE ON DELETE CASCADE',
    },
    {
      constraintName: 'role_permissions_merchant_id_role_id_fkey',
      deleteAction: 'CASCADE',
      definition:
        'FOREIGN KEY (merchant_id, role_id) REFERENCES roles(merchant_id, id) ON UPDATE CASCADE ON DELETE CASCADE',
    },
  ];
  const rows = await client.$queryRaw<
    { constraintName: string; deleteAction: string; definition: string }[]
  >`
    SELECT tc.constraint_name AS "constraintName",
           rc.delete_rule AS "deleteAction",
           pg_get_constraintdef(pc.oid) AS definition
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_schema = tc.constraint_schema
     AND rc.constraint_name = tc.constraint_name
    JOIN pg_constraint AS pc
      ON pc.conname = tc.constraint_name
     AND pc.connamespace = 'public'::regnamespace
    WHERE tc.table_schema = 'public'
      AND tc.constraint_name IN (
        'membership_roles_merchant_id_membership_id_fkey',
        'membership_roles_merchant_id_role_id_fkey',
        'role_permissions_merchant_id_role_id_fkey'
      )
    ORDER BY tc.constraint_name
  `;

  assert.deepEqual(rows, expected);
});

void test('creates restrictive Role Merchant and RolePermission Permission foreign keys', async () => {
  const rows = await client.$queryRaw<
    { constraintName: string; deleteAction: string; updateAction: string }[]
  >`
    SELECT constraint_name AS "constraintName",
           delete_rule AS "deleteAction",
           update_rule AS "updateAction"
    FROM information_schema.referential_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name IN (
        'roles_merchant_id_fkey',
        'role_permissions_permission_id_fkey'
      )
    ORDER BY constraint_name
  `;

  assert.deepEqual(rows, [
    {
      constraintName: 'role_permissions_permission_id_fkey',
      deleteAction: 'RESTRICT',
      updateAction: 'CASCADE',
    },
    {
      constraintName: 'roles_merchant_id_fkey',
      deleteAction: 'RESTRICT',
      updateAction: 'CASCADE',
    },
  ]);
});

void test('creates required authorization unique indexes and supporting composite uniqueness', async () => {
  const expected: Readonly<Record<string, string>> = {
    membership_roles_membership_id_role_id_key: '(membership_id, role_id)',
    merchant_memberships_merchant_id_id_key: '(merchant_id, id)',
    permissions_key_key: '(key)',
    role_permissions_role_id_permission_id_key: '(role_id, permission_id)',
    roles_merchant_id_id_key: '(merchant_id, id)',
    roles_merchant_id_name_key: '(merchant_id, name)',
  };
  const rows = await client.$queryRaw<
    { indexName: string; indexDefinition: string }[]
  >`
    SELECT indexname AS "indexName", indexdef AS "indexDefinition"
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY(${Object.keys(expected)}::text[])
    ORDER BY indexname
  `;

  assert.deepEqual(
    rows.map((row) => row.indexName),
    Object.keys(expected).sort(),
  );
  for (const row of rows) {
    assert.match(row.indexDefinition, /CREATE UNIQUE INDEX/);
    assert.ok(
      row.indexDefinition
        .replaceAll('"', '')
        .includes(expected[row.indexName]!),
    );
  }
});

void test('creates only the justified authorization lookup indexes', async () => {
  const expected: Readonly<Record<string, string>> = {
    membership_roles_merchant_id_role_id_idx: '(merchant_id, role_id)',
    permissions_status_idx: '(status)',
    role_permissions_permission_id_idx: '(permission_id)',
    roles_merchant_id_status_idx: '(merchant_id, status)',
  };
  const rows = await client.$queryRaw<
    { indexName: string; indexDefinition: string }[]
  >`
    SELECT indexname AS "indexName", indexdef AS "indexDefinition"
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY(${Object.keys(expected)}::text[])
    ORDER BY indexname
  `;

  assert.deepEqual(
    rows.map((row) => row.indexName),
    Object.keys(expected).sort(),
  );
  for (const row of rows) {
    assert.doesNotMatch(row.indexDefinition, /CREATE UNIQUE INDEX/);
    assert.ok(
      row.indexDefinition
        .replaceAll('"', '')
        .includes(expected[row.indexName]!),
    );
  }
});

void test('authorization integration cleanup leaves no B1.3 test data', async () => {
  assert.equal(
    await client.merchant.count({
      where: { displayName: { startsWith: TEST_PREFIX } },
    }),
    0,
  );
  assert.equal(
    await client.user.count({
      where: { displayName: { startsWith: TEST_PREFIX } },
    }),
    0,
  );
  assert.equal(
    await client.permission.count({
      where: { description: `${TEST_PREFIX} permission` },
    }),
    0,
  );
  assert.equal(
    await client.role.count({
      where: { description: `${TEST_PREFIX} role` },
    }),
    0,
  );
});
