import { Injectable } from '@nestjs/common';

import type { ResolvedMerchantContext } from './merchant-context';

@Injectable()
export class PermissionEvaluator {
  public hasPermission(
    context: ResolvedMerchantContext,
    permissionKey: string,
  ): boolean {
    return context.permissions.has(permissionKey);
  }

  public hasAllPermissions(
    context: ResolvedMerchantContext,
    permissionKeys: readonly string[],
  ): boolean {
    return permissionKeys.every((key) => context.permissions.has(key));
  }

  public hasAnyPermission(
    context: ResolvedMerchantContext,
    permissionKeys: readonly string[],
  ): boolean {
    return permissionKeys.some((key) => context.permissions.has(key));
  }
}
