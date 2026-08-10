import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type {
  AuthStore,
  AuthenticationSession,
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

  public async findSessionForAuthentication(
    tokenHash: string,
  ): Promise<AuthenticationSession | null> {
    return this.database.client.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        user: {
          select: { id: true, displayName: true, status: true },
        },
      },
    });
  }

  public async touchSessionLastUsedAt(
    sessionId: string,
    lastUsedAtThreshold: Date,
    now: Date,
  ): Promise<void> {
    await this.database.client.session.updateMany({
      where: { id: sessionId, lastUsedAt: { lte: lastUsedAtThreshold } },
      data: { lastUsedAt: now },
    });
  }

  public async revokeSessionByTokenHash(
    tokenHash: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.database.client.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt },
    });
  }

  public async revokeAllSessionsForUser(
    userId: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.database.client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
  }
}
