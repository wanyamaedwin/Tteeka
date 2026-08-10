import { Inject, Injectable } from '@nestjs/common';

import {
  ACCESS_MANAGEMENT_STORE,
  type AccessManagementStore,
} from './access-management.store';
import {
  APPLICATION_PERMISSION_CATALOG,
  APPLICATION_PERMISSION_KEYS,
} from './application-permission-catalog';

@Injectable()
export class PermissionCatalogService {
  public constructor(
    @Inject(ACCESS_MANAGEMENT_STORE)
    private readonly store: AccessManagementStore,
  ) {}

  public async listAssignable(): Promise<{
    readonly permissions: readonly {
      readonly key: string;
      readonly description: string;
    }[];
  }> {
    const activeKeys = new Set(
      await this.store.listActivePermissionKeys(APPLICATION_PERMISSION_KEYS),
    );
    return {
      permissions: APPLICATION_PERMISSION_CATALOG.filter(({ key }) =>
        activeKeys.has(key),
      ),
    };
  }
}
