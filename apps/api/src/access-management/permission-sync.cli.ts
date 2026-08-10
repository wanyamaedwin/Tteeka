import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import { syncApplicationPermissions } from './permission-sync';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error(
    'Permission synchronization requires database configuration.',
  );
}

async function main(validatedDatabaseUrl: string): Promise<void> {
  const client = createPrismaClient({ databaseUrl: validatedDatabaseUrl });
  try {
    await syncApplicationPermissions(client);
    console.log('Application Permission catalog synchronized.');
  } catch {
    console.error('Application Permission catalog synchronization failed.');
    process.exitCode = 1;
  } finally {
    await disconnectPrismaClient(client);
  }
}

void main(databaseUrl);
