import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExecutionContext } from '@nestjs/common';
import { createSessionToken } from '@tteeka/security';

import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from './authenticated-principal';
import type { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './session-cookie';
import { SessionAuthGuard } from './session-auth.guard';

const PRINCIPAL: AuthenticatedPrincipal = {
  user: {
    id: '018f0000-0000-7000-8000-000000000021',
    displayName: 'Synthetic Principal',
  },
  session: {
    id: '018f0000-0000-7000-8000-000000000022',
    expiresAt: new Date('2030-01-02T03:04:05.000Z'),
  },
};

function context(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardRecorder() {
  const tokens: string[] = [];
  const service = {
    authenticateSessionToken: (token: string) => {
      tokens.push(token);
      return Promise.resolve(PRINCIPAL);
    },
  } as AuthService;
  return { guard: new SessionAuthGuard(service), tokens };
}

for (const [description, cookies] of [
  ['missing cookie', {}],
  ['empty cookie', { [SESSION_COOKIE_NAME]: '' }],
  ['malformed cookie', { [SESSION_COOKIE_NAME]: 'malformed' }],
  ['oversized cookie', { [SESSION_COOKIE_NAME]: 'A'.repeat(2000) }],
] as const) {
  void test(`${description} receives 401 without a persistence lookup`, async () => {
    const recorder = guardRecorder();
    await assert.rejects(recorder.guard.canActivate(context({ cookies })), {
      status: 401,
      message: 'Unauthorized.',
    });
    assert.equal(recorder.tokens.length, 0);
  });
}

void test('a parsed valid cookie resolves and attaches request.auth', async () => {
  const token = createSessionToken().token;
  const request: Partial<AuthenticatedRequest> = {
    cookies: { [SESSION_COOKIE_NAME]: token },
  };
  const recorder = guardRecorder();
  assert.equal(await recorder.guard.canActivate(context(request)), true);
  assert.deepEqual(recorder.tokens, [token]);
  assert.deepEqual(request.auth, PRINCIPAL);
});
