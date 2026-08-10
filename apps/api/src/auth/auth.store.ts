export const AUTH_STORE = Symbol('AUTH_STORE');

export interface PasswordLoginUser {
  readonly id: string;
  readonly displayName: string;
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly passwordCredential: {
    readonly id: string;
    readonly passwordHash: string;
  } | null;
}

export interface CreateSessionInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

export interface AuthenticationSession {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly lastUsedAt: Date;
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly status: 'ACTIVE' | 'DISABLED';
  };
}

export interface AuthStore {
  findUserForPasswordLogin(
    phoneE164: string,
  ): Promise<PasswordLoginUser | null>;
  updateCredentialHash(
    credentialId: string,
    passwordHash: string,
  ): Promise<void>;
  createSession(input: CreateSessionInput): Promise<void>;
  findSessionForAuthentication(
    tokenHash: string,
  ): Promise<AuthenticationSession | null>;
  touchSessionLastUsedAt(
    sessionId: string,
    lastUsedAtThreshold: Date,
    now: Date,
  ): Promise<void>;
  revokeSessionByTokenHash(tokenHash: string, revokedAt: Date): Promise<void>;
  revokeAllSessionsForUser(userId: string, revokedAt: Date): Promise<void>;
}
