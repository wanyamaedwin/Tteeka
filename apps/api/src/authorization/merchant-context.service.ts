import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

import {
  AUTHORIZATION_STORE,
  type AuthorizationStore,
} from './authorization.store';
import type { ResolvedMerchantContext } from './merchant-context';

export const FORBIDDEN_MESSAGE = 'Forbidden.';

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

@Injectable()
export class MerchantContextService {
  public constructor(
    @Inject(AUTHORIZATION_STORE) private readonly store: AuthorizationStore,
  ) {}

  public async resolve(
    userId: string,
    merchantId: string,
  ): Promise<ResolvedMerchantContext> {
    const membership = await this.store.findMerchantContextForUser(
      userId,
      merchantId,
    );
    if (
      membership?.status !== 'ACTIVE' ||
      membership.merchant.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const activeRoles = membership.membershipRoles
      .map(({ role }) => role)
      .filter((role) => role.status === 'ACTIVE')
      .sort(
        (left, right) =>
          compareText(left.name, right.name) || compareText(left.id, right.id),
      );
    const permissionKeys = new Set<string>();
    for (const role of activeRoles) {
      for (const { permission } of role.rolePermissions) {
        if (permission.status === 'ACTIVE') permissionKeys.add(permission.key);
      }
    }

    return {
      merchant: {
        id: membership.merchant.id,
        displayName: membership.merchant.displayName,
      },
      membership: { id: membership.id },
      roles: activeRoles.map(({ id, name }) => ({ id, name })),
      permissions: new Set([...permissionKeys].sort(compareText)),
    };
  }
}
