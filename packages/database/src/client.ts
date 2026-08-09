import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

export interface DatabaseClientOptions {
  readonly databaseUrl: string;
}

export type TteekaPrismaClient = PrismaClient;
export type PrismaClientFactory = (
  options: DatabaseClientOptions,
) => TteekaPrismaClient;

export class DatabaseClientConfigurationError extends Error {
  public constructor() {
    super('Database client requires a validated database URL.');
    this.name = 'DatabaseClientConfigurationError';
  }
}

export function createPrismaClient(
  options: DatabaseClientOptions,
): TteekaPrismaClient {
  if (options.databaseUrl.trim().length === 0) {
    throw new DatabaseClientConfigurationError();
  }

  const adapter = new PrismaPg({ connectionString: options.databaseUrl });

  return new PrismaClient({ adapter });
}

export async function disconnectPrismaClient(
  client: TteekaPrismaClient,
): Promise<void> {
  await client.$disconnect();
}
