import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type {
  AuthStore,
  CreateSessionInput,
  PasswordLoginUser,
} from './auth.store';

@Injectable()
export class PrismaAuthStore implements AuthStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async findUserForPasswordLogin(
    phoneE164: string,
  ): Promise<PasswordLoginUser | null> {
    return this.database.client.user.findUnique({
      where: { phoneE164 },
      select: {
        id: true,
        displayName: true,
        status: true,
        passwordCredential: {
          select: { id: true, passwordHash: true },
        },
      },
    });
  }

  public async updateCredentialHash(
    credentialId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.database.client.passwordCredential.update({
      where: { id: credentialId },
      data: { passwordHash },
    });
  }

  public async createSession(input: CreateSessionInput): Promise<void> {
    await this.database.client.session.create({ data: input });
  }
}
