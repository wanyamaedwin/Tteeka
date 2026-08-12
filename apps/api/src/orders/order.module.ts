import { Module, type Provider } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { ORDER_STORE } from './order.store';
import { PrismaOrderStore } from './prisma-order.store';

const orderStoreProvider: Provider = {
  provide: ORDER_STORE,
  useClass: PrismaOrderStore,
};

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [OrderController],
  providers: [orderStoreProvider, OrderService],
})
export class OrderModule {}
