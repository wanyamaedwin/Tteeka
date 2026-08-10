import { createHash, randomBytes } from 'node:crypto';

export const SESSION_TOKEN_BYTES = 32;
export const SESSION_TOKEN_LENGTH = 43;

export interface CreatedSessionToken {
  /** Secret presented to the client exactly once. Never persist or log it. */
  readonly token: string;
  /** Lowercase hexadecimal SHA-256 digest safe for persistence and lookup. */
  readonly tokenHash: string;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isSessionTokenFormat(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length !== SESSION_TOKEN_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return false;
  }

  try {
    return Buffer.from(value, 'base64url').byteLength === SESSION_TOKEN_BYTES;
  } catch {
    return false;
  }
}

export function createSessionToken(): CreatedSessionToken {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');

  return { token, tokenHash: hashSessionToken(token) };
}
