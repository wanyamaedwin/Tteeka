import {
  loadConfig,
  type AppConfig,
  type RawEnvironment,
} from '@tteeka/config';
import {
  createPrismaClient,
  disconnectPrismaClient,
  type PrismaClientFactory,
  type TteekaPrismaClient,
} from '@tteeka/database';

export interface WorkerRuntime {
  readonly config: AppConfig;
  readonly database: TteekaPrismaClient;
  close(): Promise<void>;
}

export function initializeWorker(
  environment: RawEnvironment,
  clientFactory: PrismaClientFactory = createPrismaClient,
): WorkerRuntime {
  const config = loadConfig(environment);
  const database = clientFactory({ databaseUrl: config.databaseUrl });

  return {
    config,
    database,
    close: async () => disconnectPrismaClient(database),
  };
}
