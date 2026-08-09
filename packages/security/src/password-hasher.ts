import { argon2id, hash, needsRehash, verify, type HashOptions } from 'argon2';

export const ARGON2ID_PASSWORD_CONFIGURATION = Object.freeze({
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
}) satisfies Readonly<HashOptions>;

export class PasswordHashingError extends Error {
  public constructor() {
    super('Password hashing failed.');
    this.name = 'PasswordHashingError';
  }
}

export async function hashPassword(password: string): Promise<string> {
  try {
    return await hash(password, ARGON2ID_PASSWORD_CONFIGURATION);
  } catch {
    throw new PasswordHashingError();
  }
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  try {
    return await verify(encodedHash, password);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(encodedHash: string): boolean {
  try {
    return needsRehash(encodedHash, ARGON2ID_PASSWORD_CONFIGURATION);
  } catch {
    return true;
  }
}
