import { Module, type Provider } from '@nestjs/common';
import { hashPassword } from '@tteeka/security';

import { AuthController } from './auth.controller';
import { AuthService, DUMMY_PASSWORD_HASH } from './auth.service';
import { AUTH_STORE } from './auth.store';
import { PrismaAuthStore } from './prisma-auth.store';
import { SessionAuthGuard } from './session-auth.guard';

const authStoreProvider: Provider = {
  provide: AUTH_STORE,
  useClass: PrismaAuthStore,
};

const dummyPasswordHashProvider: Provider = {
  provide: DUMMY_PASSWORD_HASH,
  useFactory: () => hashPassword('Tteeka synthetic dummy credential'),
};

@Module({
  controllers: [AuthController],
  providers: [
    authStoreProvider,
    dummyPasswordHashProvider,
    AuthService,
    SessionAuthGuard,
  ],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule {}
