import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import {
  APPLICATION_PERMISSION_CATALOG,
  APPLICATION_PERMISSION_KEYS,
} from './application-permission-catalog';
import { syncApplicationPermissions } from './permission-sync';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0)
  throw new Error('Permission sync tests require DATABASE_URL.');
const client = createPrismaClient({ databaseUrl });
const unknownKey = `test.b22.sync.unknown.${randomUUID()}`;
const deprecatedKey = APPLICATION_PERMISSION_KEYS[0];
if (deprecatedKey === undefined) throw new Error('Catalog must not be empty.');

before(async () => {
  await syncApplicationPermissions(client);
  await client.permission.update({
    where: { key: deprecatedKey },
    data: { status: 'DEPRECATED' },
  });
  await client.permission.create({
    data: { key: unknownKey, status: 'ACTIVE' },
  });
});
after(async () => {
  await client.permission.updateMany({
    where: { key: deprecatedKey },
    data: { status: 'ACTIVE' },
  });
  await client.permission.deleteMany({ where: { key: unknownKey } });
  await disconnectPrismaClient(client);
});

void test('sync creates all seventeen catalog records and is idempotent', async () => {
  await syncApplicationPermissions(client);
  await syncApplicationPermissions(client);
  assert.equal(
    await client.permission.count({
      where: { key: { in: [...APPLICATION_PERMISSION_KEYS] } },
    }),
    17,
  );
  for (const entry of APPLICATION_PERMISSION_CATALOG) {
    const record = await client.permission.findUniqueOrThrow({
      where: { key: entry.key },
    });
    assert.equal(record.description, entry.description);
  }
});

void test('sync preserves DEPRECATED and unknown Permissions and creates no authorization graph', async () => {
  const rolesBefore = await client.role.count();
  const membershipsBefore = await client.merchantMembership.count();
  const grantsBefore = await client.rolePermission.count();
  await syncApplicationPermissions(client);
  assert.equal(
    (
      await client.permission.findUniqueOrThrow({
        where: { key: deprecatedKey },
      })
    ).status,
    'DEPRECATED',
  );
  assert.equal(
    (await client.permission.findUniqueOrThrow({ where: { key: unknownKey } }))
      .status,
    'ACTIVE',
  );
  assert.equal(await client.role.count(), rolesBefore);
  assert.equal(await client.merchantMembership.count(), membershipsBefore);
  assert.equal(await client.rolePermission.count(), grantsBefore);
});
