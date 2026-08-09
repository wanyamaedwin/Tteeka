import { Global, Module, type Provider } from '@nestjs/common';
import { createPrismaClient, type PrismaClientFactory } from '@tteeka/database';

import { DatabaseService, PRISMA_CLIENT_FACTORY } from './database.service';

const prismaClientFactoryProvider: Provider<PrismaClientFactory> = {
  provide: PRISMA_CLIENT_FACTORY,
  useValue: createPrismaClient,
};

@Global()
@Module({
  providers: [prismaClientFactoryProvider, DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
