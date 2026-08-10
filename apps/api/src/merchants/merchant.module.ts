import { Module, type Provider } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { MERCHANT_STORE } from './merchant.store';
import { PrismaMerchantStore } from './prisma-merchant.store';

const merchantStoreProvider: Provider = {
  provide: MERCHANT_STORE,
  useClass: PrismaMerchantStore,
};

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [MerchantController],
  providers: [merchantStoreProvider, MerchantService],
})
export class MerchantModule {}
