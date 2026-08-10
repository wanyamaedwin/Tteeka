import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AppConfig } from '@tteeka/config';
import {
  createSessionToken,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from '@tteeka/security';

import { APP_CONFIG } from '../configuration/configuration.module';
import { AUTH_STORE, type AuthStore } from './auth.store';

export const DUMMY_PASSWORD_HASH = Symbol('DUMMY_PASSWORD_HASH');
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid phone number or password.';

export interface LoginMetadata {
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

export interface IssuedLogin {
  readonly user: { readonly id: string; readonly displayName: string };
  readonly session: { readonly expiresAt: Date };
  readonly token: string;
}

@Injectable()
export class AuthService {
  public constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(DUMMY_PASSWORD_HASH) private readonly dummyPasswordHash: string,
  ) {}

  public async login(
    phoneE164: string,
    password: string,
    metadata: LoginMetadata,
  ): Promise<IssuedLogin> {
    const user = await this.store.findUserForPasswordLogin(phoneE164);
    const credential = user?.passwordCredential;

    if (user === null || credential === null || credential === undefined) {
      await verifyPassword(password, this.dummyPasswordHash);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await verifyPassword(
      password,
      credential.passwordHash,
    );
    if (!passwordMatches || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (passwordNeedsRehash(credential.passwordHash)) {
      await this.store.updateCredentialHash(
        credential.id,
        await hashPassword(password),
      );
    }

    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + this.config.sessionTtlSeconds * 1000,
    );
    const { token, tokenHash } = createSessionToken();
    await this.store.createSession({
      userId: user.id,
      tokenHash,
      expiresAt,
      ...metadata,
    });

    return {
      user: { id: user.id, displayName: user.displayName },
      session: { expiresAt },
      token,
    };
  }
}
