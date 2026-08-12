import { Module, type Provider } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { CUSTOMER_STORE } from './customer.store';
import { PrismaCustomerStore } from './prisma-customer.store';

const customerStoreProvider: Provider = {
  provide: CUSTOMER_STORE,
  useClass: PrismaCustomerStore,
};

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [CustomerController],
  providers: [customerStoreProvider, CustomerService],
})
export class CustomerModule {}
