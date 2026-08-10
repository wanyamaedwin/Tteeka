import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExecutionContext, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import type {
  MerchantContextRequest,
  ResolvedMerchantContext,
} from './merchant-context';
import { PermissionEvaluator } from './permission-evaluator';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';

const AUTH: AuthenticatedPrincipal = {
  user: {
    id: '018f0000-0000-7000-8000-000000000001',
    displayName: 'Synthetic User',
  },
  session: {
    id: '018f0000-0000-7000-8000-000000000002',
    expiresAt: new Date('2030-01-02T03:04:05.000Z'),
  },
};

function merchantContext(
  permissions: readonly string[],
): ResolvedMerchantContext {
  return {
    merchant: {
      id: '018f0000-0000-7000-8000-000000000003',
      displayName: 'Synthetic Merchant',
    },
    membership: { id: '018f0000-0000-7000-8000-000000000004' },
    roles: [{ id: '018f0000-0000-7000-8000-000000000005', name: 'Owner' }],
    permissions: new Set(permissions),
  };
}

@RequirePermission('test.class.read')
class ProtectedController {
  public classRequirement(this: void): boolean {
    return true;
  }

  @RequirePermission('test.resource.read')
  public read(this: void): boolean {
    return true;
  }

  @RequirePermission('test.resource.write')
  public write(this: void): boolean {
    return true;
  }

  @RequirePermission('Test.Resource.Read')
  public caseMismatch(this: void): boolean {
    return true;
  }

  @RequirePermission('test.resource.*')
  public wildcardLiteral(this: void): boolean {
    return true;
  }

  public noMetadata(this: void): boolean {
    return true;
  }
}

class PermissionEvaluatorRecorder extends PermissionEvaluator {
  public readonly calls: [ResolvedMerchantContext, string][] = [];

  public override hasPermission(
    context: ResolvedMerchantContext,
    permissionKey: string,
  ): boolean {
    this.calls.push([context, permissionKey]);
    return super.hasPermission(context, permissionKey);
  }
}

function executionContext(
  request: Partial<MerchantContextRequest>,
  handler: () => unknown,
  controller: Type = ProtectedController,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createGuard(): {
  guard: PermissionGuard;
  evaluator: PermissionEvaluatorRecorder;
} {
  const evaluator = new PermissionEvaluatorRecorder();
  return {
    guard: new PermissionGuard(new Reflector(), evaluator),
    evaluator,
  };
}

void test('exact grant allows through PermissionEvaluator without mutating request contexts', () => {
  const resolved = merchantContext(['test.resource.read']);
  const request: Partial<MerchantContextRequest> = {
    auth: AUTH,
    merchantContext: resolved,
  };
  const { guard, evaluator } = createGuard();
  assert.equal(
    guard.canActivate(
      executionContext(request, ProtectedController.prototype.read),
    ),
    true,
  );
  assert.deepEqual(evaluator.calls, [[resolved, 'test.resource.read']]);
  assert.equal(request.auth, AUTH);
  assert.equal(request.merchantContext, resolved);
  assert.equal(request.auth.session.expiresAt, AUTH.session.expiresAt);
});

for (const [label, handler] of [
  ['absent', ProtectedController.prototype.write],
  ['different case', ProtectedController.prototype.caseMismatch],
  ['wildcard-looking', ProtectedController.prototype.wildcardLiteral],
] as const) {
  void test(`${label} requirement returns generic forbidden`, () => {
    const resolved = merchantContext(['test.resource.read']);
    const { guard, evaluator } = createGuard();
    assert.throws(
      () =>
        guard.canActivate(
          executionContext({ merchantContext: resolved }, handler),
        ),
      { status: 403, message: 'Forbidden.' },
    );
    assert.equal(evaluator.calls.length, 1);
  });
}

void test('wildcard-looking key grants only when the exact literal exists', () => {
  const resolved = merchantContext(['test.resource.*']);
  const { guard, evaluator } = createGuard();
  assert.equal(
    guard.canActivate(
      executionContext(
        { merchantContext: resolved },
        ProtectedController.prototype.wildcardLiteral,
      ),
    ),
    true,
  );
  assert.deepEqual(evaluator.calls, [[resolved, 'test.resource.*']]);
});

void test('missing requirement metadata fails closed as server misconfiguration', () => {
  const { guard, evaluator } = createGuard();
  assert.throws(
    () =>
      guard.canActivate(
        executionContext(
          { merchantContext: merchantContext(['test.class.read']) },
          ProtectedController.prototype.noMetadata,
          class UnprotectedController {},
        ),
      ),
    { status: 500, message: 'Internal Server Error' },
  );
  assert.equal(evaluator.calls.length, 0);
});

void test('missing merchant context fails as server misconfiguration', () => {
  const { guard, evaluator } = createGuard();
  assert.throws(
    () =>
      guard.canActivate(
        executionContext({}, ProtectedController.prototype.read),
      ),
    { status: 500, message: 'Internal Server Error' },
  );
  assert.equal(evaluator.calls.length, 0);
});

void test('class, method, and method-over-class metadata are enforced', () => {
  const resolved = merchantContext(['test.class.read', 'test.resource.write']);
  const { guard, evaluator } = createGuard();
  assert.equal(
    guard.canActivate(
      executionContext(
        { merchantContext: resolved },
        ProtectedController.prototype.classRequirement,
      ),
    ),
    true,
  );
  assert.equal(
    guard.canActivate(
      executionContext(
        { merchantContext: resolved },
        ProtectedController.prototype.write,
      ),
    ),
    true,
  );
  assert.throws(
    () =>
      guard.canActivate(
        executionContext(
          { merchantContext: resolved },
          ProtectedController.prototype.read,
        ),
      ),
    { status: 403, message: 'Forbidden.' },
  );
  assert.deepEqual(
    evaluator.calls.map(([, key]) => key),
    ['test.class.read', 'test.resource.write', 'test.resource.read'],
  );
});
