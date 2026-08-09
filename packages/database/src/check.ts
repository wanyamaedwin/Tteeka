import { loadConfig } from '@tteeka/config';

import { createPrismaClient, disconnectPrismaClient } from './client';

interface ConnectivityResult {
  readonly result: number;
}

async function checkDatabase(): Promise<void> {
  const config = loadConfig(process.env);
  const client = createPrismaClient({ databaseUrl: config.databaseUrl });

  try {
    const rows = await client.$queryRaw<ConnectivityResult[]>`
      SELECT 1 AS result
    `;

    if (rows[0]?.result !== 1) {
      throw new Error(
        'Database connectivity query returned an unexpected result.',
      );
    }

    process.stdout.write(
      'Database connectivity check passed: SELECT 1 -> 1.\n',
    );
  } finally {
    await disconnectPrismaClient(client);
  }
}

void checkDatabase().catch(() => {
  process.stderr.write('Database connectivity check failed.\n');
  process.exitCode = 1;
});
