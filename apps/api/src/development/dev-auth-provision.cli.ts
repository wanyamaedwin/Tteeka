import { createPrismaClient, disconnectPrismaClient } from '@tteeka/database';

import {
  provisionDevelopmentAuth,
  readDevelopmentAuthProvisionInput,
} from './dev-auth-provision';

async function main(): Promise<void> {
  const input = readDevelopmentAuthProvisionInput(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error(
      'Development Auth provisioning requires database configuration.',
    );
  }
  const client = createPrismaClient({ databaseUrl });
  try {
    const result = await provisionDevelopmentAuth(client, input);
    console.log('Local development Auth identity provisioned.');
    console.log(`Merchant ID: ${result.merchant.id}`);
    console.log(`Merchant: ${result.merchant.displayName}`);
    console.log(`User ID: ${result.user.id}`);
    console.log(`Phone: ${result.user.phoneE164}`);
    console.log(`Membership ID: ${result.membership.id}`);
    console.log(`Role: ${result.role.name}`);
    console.log(`Permission count: ${result.permissionCount}`);
  } finally {
    await disconnectPrismaClient(client);
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Unknown provisioning error.',
  );
  process.exitCode = 1;
});
