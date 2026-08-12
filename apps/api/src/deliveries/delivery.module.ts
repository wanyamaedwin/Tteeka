import { Module, type Provider } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DELIVERY_STORE } from './delivery.store';
import { PrismaDeliveryStore } from './prisma-delivery.store';

const deliveryStoreProvider: Provider = {
  provide: DELIVERY_STORE,
  useClass: PrismaDeliveryStore,
};

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [DeliveryController],
  providers: [deliveryStoreProvider, DeliveryService],
})
export class DeliveryModule {}
