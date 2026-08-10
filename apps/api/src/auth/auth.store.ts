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

export interface AuthStore {
  findUserForPasswordLogin(
    phoneE164: string,
  ): Promise<PasswordLoginUser | null>;
  updateCredentialHash(
    credentialId: string,
    passwordHash: string,
  ): Promise<void>;
  createSession(input: CreateSessionInput): Promise<void>;
}
