import { Module, type Provider } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AUTHORIZATION_STORE } from './authorization.store';
import { MerchantContextController } from './merchant-context.controller';
import { MerchantContextGuard } from './merchant-context.guard';
import { MerchantContextService } from './merchant-context.service';
import { PermissionEvaluator } from './permission-evaluator';
import { PrismaAuthorizationStore } from './prisma-authorization.store';

const authorizationStoreProvider: Provider = {
  provide: AUTHORIZATION_STORE,
  useClass: PrismaAuthorizationStore,
};

@Module({
  imports: [AuthModule],
  controllers: [MerchantContextController],
  providers: [
    authorizationStoreProvider,
    MerchantContextService,
    MerchantContextGuard,
    PermissionEvaluator,
  ],
  exports: [PermissionEvaluator],
})
export class AuthorizationModule {}
