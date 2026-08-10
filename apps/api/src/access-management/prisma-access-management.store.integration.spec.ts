import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import type { DatabaseService } from '../database/database.service';
import { PrismaAccessManagementStore } from './prisma-access-management.store';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error('Access-management store tests require DATABASE_URL.');
}
const client = createPrismaClient({ databaseUrl });
const store = new PrismaAccessManagementStore({ client } as DatabaseService);
const PREFIX = 'B2.2 Store Test';

function phone(): string {
  return `+2567${randomInt(10_000_000, 100_000_000)}`;
}

async function merchant(label: string) {
  return client.merchant.create({
    data: { displayName: `${PREFIX} ${label} ${randomUUID()}` },
  });
}
async function user(label: string) {
  return client.user.create({
    data: {
      displayName: `${PREFIX} ${label} ${randomUUID()}`,
      phoneE164: phone(),
    },
  });
}

async function cleanup(): Promise<void> {
  const merchants = await client.merchant.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const merchantIds = merchants.map(({ id }) => id);
  const users = await client.user.findMany({
    where: { displayName: { startsWith: PREFIX } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
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
  await client.permission.deleteMany({
    where: { key: { startsWith: 'test.b22.store.' } },
  });
  await client.user.deleteMany({ where: { id: { in: userIds } } });
  await client.merchant.deleteMany({ where: { id: { in: merchantIds } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await disconnectPrismaClient(client);
});

void test('staff persistence is scoped, deterministic, bounded, and supports multi-Merchant Users', async () => {
  const merchantA = await merchant('A');
  const merchantB = await merchant('B');
  const zed = await user('Zed');
  const amy = await user('Amy');
  const membershipZ = await store.createMembership(merchantA.id, zed.id);
  const membershipA = await store.createMembership(merchantA.id, amy.id);
  await store.createMembership(merchantB.id, amy.id);
  const listed = await store.listStaff(merchantA.id);
  assert.deepEqual(
    listed.map(({ id }) => id),
    [membershipA.id, membershipZ.id],
  );
  assert.equal(JSON.stringify(listed).includes('password'), false);
  assert.equal((await store.listStaff(merchantB.id)).length, 1);
  await assert.rejects(() => store.createMembership(merchantA.id, amy.id));
});

void test('Membership disable/reactivate retains Role links and replacement is exact, empty, and tenant-safe', async () => {
  const merchantA = await merchant('Membership A');
  const merchantB = await merchant('Membership B');
  const person = await user('Membership');
  const membership = await store.createMembership(merchantA.id, person.id);
  const roleOne = await store.createRole(merchantA.id, {
    name: `One ${randomUUID()}`,
  });
  const roleTwo = await store.createRole(merchantA.id, {
    name: `Two ${randomUUID()}`,
  });
  const foreignRole = await store.createRole(merchantB.id, {
    name: `Foreign ${randomUUID()}`,
  });
  assert.equal(
    (
      await store.replaceMembershipRoles(merchantA.id, membership.id, [
        roleOne.id,
        roleTwo.id,
      ])
    ).outcome,
    'updated',
  );
  await store.updateMembershipStatus(merchantA.id, membership.id, 'DISABLED');
  assert.equal(
    await client.membershipRole.count({
      where: { membershipId: membership.id },
    }),
    2,
  );
  await store.updateMembershipStatus(merchantA.id, membership.id, 'ACTIVE');
  assert.equal(
    (
      await store.replaceMembershipRoles(merchantA.id, membership.id, [
        foreignRole.id,
      ])
    ).outcome,
    'invalid-assignment',
  );
  assert.equal(
    await client.membershipRole.count({
      where: { membershipId: membership.id },
    }),
    2,
  );
  await store.replaceMembershipRoles(merchantA.id, membership.id, []);
  assert.equal(
    await client.membershipRole.count({
      where: { membershipId: membership.id },
    }),
    0,
  );
  assert.equal(
    (await store.replaceMembershipRoles(merchantB.id, membership.id, []))
      .outcome,
    'not-found',
  );
});

void test('Role persistence is deterministic, conflict-safe, lifecycle-preserving, and tenant-scoped', async () => {
  const merchantA = await merchant('Role A');
  const merchantB = await merchant('Role B');
  const name = `Manager ${randomUUID()}`;
  const role = await store.createRole(merchantA.id, {
    name,
    description: 'Description',
  });
  assert.equal(role.status, 'ACTIVE');
  assert.equal(role.description, 'Description');
  await assert.rejects(() => store.createRole(merchantA.id, { name }));
  assert.equal(
    await store.updateRole(merchantB.id, role.id, { status: 'DISABLED' }),
    null,
  );
  const disabled = await store.updateRole(merchantA.id, role.id, {
    status: 'DISABLED',
  });
  assert.equal(disabled?.status, 'DISABLED');
  const other = await store.createRole(merchantA.id, {
    name: `Aardvark ${randomUUID()}`,
  });
  assert.deepEqual(
    (await store.listRoles(merchantA.id)).map(({ id }) => id),
    [other.id, role.id],
  );
});

void test('Role Permission replacement is exact, empty, atomic, retains links on disable, and isolates tenants', async () => {
  const merchantA = await merchant('Permission A');
  const merchantB = await merchant('Permission B');
  const role = await store.createRole(merchantA.id, {
    name: `Role ${randomUUID()}`,
  });
  const foreignRole = await store.createRole(merchantB.id, {
    name: `Foreign ${randomUUID()}`,
  });
  const keyOne = `test.b22.store.one.${randomUUID()}`;
  const keyTwo = `test.b22.store.two.${randomUUID()}`;
  await client.permission.createMany({
    data: [{ key: keyOne }, { key: keyTwo }],
  });
  assert.equal(
    (
      await store.replaceRolePermissions(merchantA.id, role.id, [
        keyOne,
        keyTwo,
      ])
    ).outcome,
    'updated',
  );
  await store.updateRole(merchantA.id, role.id, { status: 'DISABLED' });
  assert.equal(
    await client.rolePermission.count({ where: { roleId: role.id } }),
    2,
  );
  assert.equal(
    (await store.replaceRolePermissions(merchantA.id, role.id, ['missing']))
      .outcome,
    'invalid-assignment',
  );
  assert.equal(
    await client.rolePermission.count({ where: { roleId: role.id } }),
    2,
  );
  assert.equal(
    (await store.replaceRolePermissions(merchantA.id, foreignRole.id, []))
      .outcome,
    'not-found',
  );
  await store.replaceRolePermissions(merchantA.id, role.id, []);
  assert.equal(
    await client.rolePermission.count({ where: { roleId: role.id } }),
    0,
  );
  assert.equal(
    await client.rolePermission.count({ where: { roleId: foreignRole.id } }),
    0,
  );
});

void test('concurrent Membership and Role creation yield one row plus one safe conflict', async () => {
  const targetMerchant = await merchant('Concurrent');
  const targetUser = await user('Concurrent');
  const memberships = await Promise.allSettled([
    store.createMembership(targetMerchant.id, targetUser.id),
    store.createMembership(targetMerchant.id, targetUser.id),
  ]);
  assert.equal(
    memberships.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(
    await client.merchantMembership.count({
      where: { merchantId: targetMerchant.id, userId: targetUser.id },
    }),
    1,
  );
  const roleName = `Concurrent ${randomUUID()}`;
  const roles = await Promise.allSettled([
    store.createRole(targetMerchant.id, { name: roleName }),
    store.createRole(targetMerchant.id, { name: roleName }),
  ]);
  assert.equal(roles.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(
    await client.role.count({
      where: { merchantId: targetMerchant.id, name: roleName },
    }),
    1,
  );
});
