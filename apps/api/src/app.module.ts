import { Module } from '@nestjs/common';

import { AccessManagementModule } from './access-management/access-management.module';
import { ConfigurationModule } from './configuration/configuration.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { HealthModule } from './health/health.module';
import { MerchantModule } from './merchants/merchant.module';

@Module({
  imports: [
    ConfigurationModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    AuthorizationModule,
    MerchantModule,
    AccessManagementModule,
  ],
})
export class AppModule {}
