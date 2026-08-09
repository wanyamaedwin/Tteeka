import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { AppConfig } from '@tteeka/config';
import {
  disconnectPrismaClient,
  type PrismaClientFactory,
  type TteekaPrismaClient,
} from '@tteeka/database';

import { APP_CONFIG } from '../configuration/configuration.module';

export const PRISMA_CLIENT_FACTORY = Symbol('PRISMA_CLIENT_FACTORY');

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  public readonly client: TteekaPrismaClient;

  public constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(PRISMA_CLIENT_FACTORY) clientFactory: PrismaClientFactory,
  ) {
    this.client = clientFactory({ databaseUrl: config.databaseUrl });
  }

  public async onApplicationShutdown(): Promise<void> {
    await disconnectPrismaClient(this.client);
  }
}
