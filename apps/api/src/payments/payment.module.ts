import { Module, type Provider } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PAYMENT_STORE } from './payment.store';
import { PrismaPaymentStore } from './prisma-payment.store';

const paymentStoreProvider: Provider = {
  provide: PAYMENT_STORE,
  useClass: PrismaPaymentStore,
};

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [PaymentController],
  providers: [paymentStoreProvider, PaymentService],
})
export class PaymentModule {}
