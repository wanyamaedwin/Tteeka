import { Module, type Provider } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { INVENTORY_STORE } from './inventory.store';
import { PrismaInventoryStore } from './prisma-inventory.store';
import { StockHoldExpiryService } from './stock-hold-expiry.service';

const inventoryStoreProvider: Provider = {
  provide: INVENTORY_STORE,
  useClass: PrismaInventoryStore,
};

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [InventoryController],
  providers: [inventoryStoreProvider, InventoryService, StockHoldExpiryService],
  exports: [StockHoldExpiryService],
})
export class InventoryModule {}
