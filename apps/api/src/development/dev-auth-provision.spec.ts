import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';
import { verifyPassword } from '@tteeka/security';

import { APPLICATION_PERMISSION_KEYS } from '../access-management/application-permission-catalog';
import {
  DevelopmentAuthProvisionError,
  provisionDevelopmentAuth,
  readDevelopmentAuthProvisionInput,
  type DevelopmentAuthProvisionInput,
} from './dev-auth-provision';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Development Auth provisioning tests require DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const marker = randomUUID();
const merchantDisplayName = `INT0.1A Provision Test ${marker}`;
const roleName = `Local Test Role ${marker}`;
const phoneE164 = `+2567${randomInt(10_000_000, 100_000_000)}`;
const firstPassword = randomBytes(24).toString('base64url');
const secondPassword = randomBytes(24).toString('base64url');

async function cleanup(): Promise<void> {
  const users = await client.user.findMany({
    where: { phoneE164 },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  const merchants = await client.merchant.findMany({
    where: { displayName: merchantDisplayName },
    select: { id: true },
  });
  const merchantIds = merchants.map(({ id }) => id);
  await client.session.deleteMany({ where: { userId: { in: userIds } } });
  await client.rolePermission.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.membershipRole.deleteMany({
    where: { merchantId: { in: merchantIds } },
  });
  await client.merchantMembership.deleteMany({
    where: {
      OR: [{ merchantId: { in: merchantIds } }, { userId: { in: userIds } }],
    },
  });
  await client.role.deleteMany({ where: { merchantId: { in: merchantIds } } });
  await client.passwordCredential.deleteMany({
    where: { userId: { in: userIds } },
  });
  await client.user.deleteMany({ where: { id: { in: userIds } } });
  await client.merchant.deleteMany({ where: { id: { in: merchantIds } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('environment guard refuses staging and production before database use', async () => {
  const beforeCounts = await Promise.all([
    client.merchant.count(),
    client.user.count(),
    client.passwordCredential.count(),
  ]);
  for (const nodeEnv of ['staging', 'production'] as const) {
    assert.throws(
      () => readDevelopmentAuthProvisionInput({ NODE_ENV: nodeEnv }),
      DevelopmentAuthProvisionError,
    );
  }
  assert.deepEqual(
    await Promise.all([
      client.merchant.count(),
      client.user.count(),
      client.passwordCredential.count(),
    ]),
    beforeCounts,
  );
});

void test('input uses the production Uganda phone normalizer and requires explicit confirmation', () => {
  const environment = {
    NODE_ENV: 'development',
    TTEEKA_DEV_PROVISION_AUTH_CONFIRM: 'local-only',
    TTEEKA_DEV_AUTH_MERCHANT_NAME: merchantDisplayName,
    TTEEKA_DEV_AUTH_USER_NAME: 'Provision Test User',
    TTEEKA_DEV_AUTH_PHONE: `0${phoneE164.slice(4)}`,
    TTEEKA_DEV_AUTH_PASSWORD: firstPassword,
    TTEEKA_DEV_AUTH_ROLE_NAME: roleName,
  };
  assert.equal(
    readDevelopmentAuthProvisionInput(environment).phoneE164,
    phoneE164,
  );
  assert.throws(
    () =>
      readDevelopmentAuthProvisionInput({
        ...environment,
        TTEEKA_DEV_PROVISION_AUTH_CONFIRM: '',
      }),
    DevelopmentAuthProvisionError,
  );
});

void test('provisioning is idempotent, desired-state RBAC uses all code-owned Permissions, and password reprovisions', async () => {
  const input: DevelopmentAuthProvisionInput = {
    merchantDisplayName,
    userDisplayName: 'Provision Test User',
    phoneE164,
    password: firstPassword,
    roleName,
  };
  const first = await provisionDevelopmentAuth(client, input);
  const firstCredential = await client.passwordCredential.findUniqueOrThrow({
    where: { userId: first.user.id },
    select: { passwordHash: true },
  });
  assert.equal(
    await verifyPassword(firstPassword, firstCredential.passwordHash),
    true,
  );

  const second = await provisionDevelopmentAuth(client, {
    ...input,
    password: secondPassword,
  });
  assert.equal(second.merchant.id, first.merchant.id);
  assert.equal(second.user.id, first.user.id);
  assert.equal(second.membership.id, first.membership.id);
  assert.equal(second.role.id, first.role.id);
  assert.equal(second.permissionCount, APPLICATION_PERMISSION_KEYS.length);

  const credential = await client.passwordCredential.findUniqueOrThrow({
    where: { userId: first.user.id },
    select: { passwordHash: true },
  });
  assert.equal(
    await verifyPassword(secondPassword, credential.passwordHash),
    true,
  );
  assert.equal(
    await verifyPassword(firstPassword, credential.passwordHash),
    false,
  );
  assert.equal(
    await client.merchant.count({
      where: { displayName: merchantDisplayName },
    }),
    1,
  );
  assert.equal(await client.user.count({ where: { phoneE164 } }), 1);
  assert.equal(
    await client.passwordCredential.count({ where: { userId: first.user.id } }),
    1,
  );
  assert.equal(
    await client.merchantMembership.count({
      where: {
        merchantId: first.merchant.id,
        userId: first.user.id,
        status: 'ACTIVE',
      },
    }),
    1,
  );
  assert.equal(
    await client.membershipRole.count({
      where: { membershipId: first.membership.id },
    }),
    1,
  );
  assert.equal(
    await client.rolePermission.count({ where: { roleId: first.role.id } }),
    21,
  );
  const grantedKeys = (
    await client.rolePermission.findMany({
      where: { roleId: first.role.id },
      select: { permission: { select: { key: true } } },
      orderBy: { permission: { key: 'asc' } },
    })
  ).map(({ permission }) => permission.key);
  assert.deepEqual(grantedKeys, [...APPLICATION_PERMISSION_KEYS].sort());
  assert.equal(new Set<string>(grantedKeys).has('*'), false);
});
