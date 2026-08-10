import type { TteekaPrismaClient } from '@tteeka/database';

import { APPLICATION_PERMISSION_CATALOG } from './application-permission-catalog';

export async function syncApplicationPermissions(
  client: TteekaPrismaClient,
): Promise<void> {
  await client.$transaction(
    APPLICATION_PERMISSION_CATALOG.map(({ key, description }) =>
      client.permission.upsert({
        where: { key },
        create: { key, description, status: 'ACTIVE' },
        update: { description },
      }),
    ),
  );
}
