import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExecutionContext } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import type {
  MerchantContextRequest,
  ResolvedMerchantContext,
} from './merchant-context';
import { MerchantContextGuard } from './merchant-context.guard';
import type { MerchantContextService } from './merchant-context.service';

const MERCHANT_ID = '018f0000-0000-7000-8000-000000000002';
const AUTH: AuthenticatedPrincipal = {
  user: {
    id: '018f0000-0000-7000-8000-000000000001',
    displayName: 'Synthetic User',
  },
  session: {
    id: '018f0000-0000-7000-8000-000000000004',
    expiresAt: new Date('2030-01-02T03:04:05.000Z'),
  },
};
const RESOLVED: ResolvedMerchantContext = {
  merchant: { id: MERCHANT_ID, displayName: 'Synthetic Merchant' },
  membership: { id: '018f0000-0000-7000-8000-000000000003' },
  roles: [],
  permissions: new Set(),
};

function context(request: Partial<MerchantContextRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardRecorder() {
  const calls: unknown[][] = [];
  const service = {
    resolve: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve(RESOLVED);
    },
  } as unknown as MerchantContextService;
  return { guard: new MerchantContextGuard(service), calls, service };
}

void test('missing authentication context fails safely before resolution', async () => {
  const fake = guardRecorder();
  await assert.rejects(
    fake.guard.canActivate(context({ params: { merchantId: MERCHANT_ID } })),
    { status: 401, message: 'Unauthorized.' },
  );
  assert.equal(fake.calls.length, 0);
});

for (const merchantId of [
  'not-a-uuid',
  '018f0000-0000-4000-8000-000000000002',
  '',
]) {
  void test(`malformed merchantId ${merchantId || '<empty>'} returns 400 without resolution`, async () => {
    const fake = guardRecorder();
    await assert.rejects(
      fake.guard.canActivate(context({ auth: AUTH, params: { merchantId } })),
      { status: 400, message: 'Invalid merchantId.' },
    );
    assert.equal(fake.calls.length, 0);
  });
}

void test('valid unavailable context preserves generic 403', async () => {
  const fake = guardRecorder();
  fake.service.resolve = () =>
    Promise.reject(Object.assign(new Error('Forbidden.'), { status: 403 }));
  await assert.rejects(
    fake.guard.canActivate(
      context({ auth: AUTH, params: { merchantId: MERCHANT_ID } }),
    ),
    { status: 403, message: 'Forbidden.' },
  );
});

void test('valid context attaches separately without modifying request.auth', async () => {
  const request: Partial<MerchantContextRequest> = {
    auth: AUTH,
    params: { merchantId: MERCHANT_ID },
  };
  const fake = guardRecorder();
  assert.equal(await fake.guard.canActivate(context(request)), true);
  assert.deepEqual(fake.calls, [[AUTH.user.id, MERCHANT_ID]]);
  assert.equal(request.auth, AUTH);
  assert.equal(request.merchantContext, RESOLVED);
});
