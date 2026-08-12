import { Module, type Provider } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PAYMENT_STORE } from './payment.store';
import {
  EmptyProviderVerificationRegistry,
  PROVIDER_VERIFICATION_REGISTRY,
} from './provider-verification';
import { ProviderVerificationService } from './provider-verification.service';
import { PROVIDER_VERIFICATION_STORE } from './provider-verification.store';
import { PrismaPaymentStore } from './prisma-payment.store';
import { PrismaProviderVerificationStore } from './prisma-provider-verification.store';

const paymentStoreProvider: Provider = {
  provide: PAYMENT_STORE,
  useClass: PrismaPaymentStore,
};

const providerVerificationStoreProvider: Provider = {
  provide: PROVIDER_VERIFICATION_STORE,
  useClass: PrismaProviderVerificationStore,
};

const providerVerificationRegistryProvider: Provider = {
  provide: PROVIDER_VERIFICATION_REGISTRY,
  useClass: EmptyProviderVerificationRegistry,
};

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [PaymentController],
  providers: [
    paymentStoreProvider,
    providerVerificationStoreProvider,
    providerVerificationRegistryProvider,
    PaymentService,
    ProviderVerificationService,
  ],
})
export class PaymentModule {}
