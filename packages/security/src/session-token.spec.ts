import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  createSessionToken,
  hashSessionToken,
  SESSION_TOKEN_BYTES,
  SESSION_TOKEN_LENGTH,
} from './session-token';

void test('createSessionToken creates an opaque token and hash', () => {
  const created = createSessionToken();
  assert.equal(typeof created.token, 'string');
  assert.equal(typeof created.tokenHash, 'string');
});

void test('session tokens decode to 32 random bytes', () => {
  const { token } = createSessionToken();
  assert.equal(Buffer.from(token, 'base64url').byteLength, SESSION_TOKEN_BYTES);
});

void test('session tokens use unpadded base64url format', () => {
  const { token } = createSessionToken();
  assert.equal(token.length, SESSION_TOKEN_LENGTH);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(token, /=/);
});

void test('two generated session tokens differ', () => {
  assert.notEqual(createSessionToken().token, createSessionToken().token);
});

void test('a modest sample contains no duplicate session tokens', () => {
  const tokens = Array.from({ length: 100 }, () => createSessionToken().token);
  assert.equal(new Set(tokens).size, tokens.length);
});

void test('hashSessionToken returns lowercase hexadecimal SHA-256', () => {
  const syntheticToken = 'synthetic-session-token';
  const tokenHash = hashSessionToken(syntheticToken);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(
    tokenHash,
    createHash('sha256').update(syntheticToken, 'utf8').digest('hex'),
  );
});

void test('session token hashes are exactly 64 characters', () => {
  assert.equal(hashSessionToken('synthetic').length, 64);
});

void test('hashSessionToken is deterministic', () => {
  const syntheticToken = 'same-synthetic-token';
  assert.equal(
    hashSessionToken(syntheticToken),
    hashSessionToken(syntheticToken),
  );
});

void test('different session tokens produce different hashes', () => {
  assert.notEqual(
    hashSessionToken('synthetic-a'),
    hashSessionToken('synthetic-b'),
  );
});

void test('createSessionToken returns the matching token hash', () => {
  const created = createSessionToken();
  assert.equal(created.tokenHash, hashSessionToken(created.token));
});

void test('a raw session token does not equal its hash', () => {
  const created = createSessionToken();
  assert.notEqual(created.token, created.tokenHash);
});

void test('a session token hash does not contain its raw token', () => {
  const created = createSessionToken();
  assert.equal(created.tokenHash.includes(created.token), false);
});

void test('generated tokens contain no supplied identity or authorization data', () => {
  const forbiddenData = ['user-id', 'merchant-id', 'role', 'permission'];
  const { token } = createSessionToken();
  for (const value of forbiddenData) assert.equal(token.includes(value), false);
});
