import assert from 'node:assert/strict';
import test from 'node:test';

import { argon2id, hash } from 'argon2';

import {
  ARGON2ID_PASSWORD_CONFIGURATION,
  hashPassword,
  PasswordHashingError,
  passwordNeedsRehash,
  verifyPassword,
} from './password-hasher';

const SYNTHETIC_PASSWORD = 'Synthetic-Test-Password-Only';

void test('hashPassword returns an Argon2id PHC string', async () => {
  const encodedHash = await hashPassword(SYNTHETIC_PASSWORD);

  assert.match(encodedHash, /^\$argon2id\$/);
});

void test('hashPassword records the explicit Tteeka Argon2 parameters', async () => {
  const encodedHash = await hashPassword(SYNTHETIC_PASSWORD);
  const parameterSegment = encodedHash.split('$')[3];

  assert.ok(parameterSegment);
  assert.deepEqual(
    Object.fromEntries(
      parameterSegment.split(',').map((parameter) => parameter.split('=')),
    ),
    { m: '19456', p: '1', t: '2' },
  );
  assert.deepEqual(ARGON2ID_PASSWORD_CONFIGURATION, {
    type: argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });
});

void test('verifyPassword returns true for the correct password', async () => {
  const encodedHash = await hashPassword(SYNTHETIC_PASSWORD);

  assert.equal(await verifyPassword(SYNTHETIC_PASSWORD, encodedHash), true);
});

void test('verifyPassword returns false for an incorrect password', async () => {
  const encodedHash = await hashPassword(SYNTHETIC_PASSWORD);

  assert.equal(
    await verifyPassword('Synthetic-Incorrect-Password', encodedHash),
    false,
  );
});

void test('hashPassword uses a fresh random salt for each hash', async () => {
  const firstHash = await hashPassword(SYNTHETIC_PASSWORD);
  const secondHash = await hashPassword(SYNTHETIC_PASSWORD);

  assert.notEqual(firstHash, secondHash);
});

void test('different salted hashes both verify the original password', async () => {
  const firstHash = await hashPassword(SYNTHETIC_PASSWORD);
  const secondHash = await hashPassword(SYNTHETIC_PASSWORD);

  assert.equal(await verifyPassword(SYNTHETIC_PASSWORD, firstHash), true);
  assert.equal(await verifyPassword(SYNTHETIC_PASSWORD, secondHash), true);
});

void test('Unicode passwords hash and verify correctly', async () => {
  const unicodePassword = 'Synthetic-Obusobozi-🔐-密碼';
  const encodedHash = await hashPassword(unicodePassword);

  assert.equal(await verifyPassword(unicodePassword, encodedHash), true);
});

void test('encoded hashes do not contain the plaintext password', async () => {
  const encodedHash = await hashPassword(SYNTHETIC_PASSWORD);

  assert.equal(encodedHash.includes(SYNTHETIC_PASSWORD), false);
});

void test('current Tteeka hashes do not require rehashing', async () => {
  const encodedHash = await hashPassword(SYNTHETIC_PASSWORD);

  assert.equal(passwordNeedsRehash(encodedHash), false);
});

void test('hashes with weaker parameters require rehashing', async () => {
  const weakerHash = await hash(SYNTHETIC_PASSWORD, {
    type: argon2id,
    memoryCost: 4096,
    timeCost: 1,
    parallelism: 1,
    hashLength: 32,
  });

  assert.equal(passwordNeedsRehash(weakerHash), true);
});

void test('malformed encoded hashes use the safe wrapper contract', async () => {
  const malformedHash = 'not-a-valid-phc-string';

  assert.equal(await verifyPassword(SYNTHETIC_PASSWORD, malformedHash), false);
  assert.equal(passwordNeedsRehash(malformedHash), true);
});

void test('hashing errors expose only the wrapper message', async () => {
  const syntheticSecret = 'Synthetic-Secret-Must-Not-Appear';
  const invalidInput = {
    toString: () => {
      throw new Error(syntheticSecret);
    },
  } as unknown as string;

  await assert.rejects(hashPassword(invalidInput), (error: unknown) => {
    assert.ok(error instanceof PasswordHashingError);
    assert.equal(error.message, 'Password hashing failed.');
    assert.doesNotMatch(error.message, new RegExp(syntheticSecret));
    return true;
  });
});
