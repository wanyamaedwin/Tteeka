import { Module } from '@nestjs/common';

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
  ],
})
export class AppModule {}
