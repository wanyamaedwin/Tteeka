import { Module } from '@nestjs/common';

import { AccessManagementModule } from './access-management/access-management.module';
import { ConfigurationModule } from './configuration/configuration.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrderModule } from './orders/order.module';
import { CustomerModule } from './customers/customer.module';
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
    CatalogueModule,
    InventoryModule,
    OrderModule,
    CustomerModule,
  ],
})
export class AppModule {}
