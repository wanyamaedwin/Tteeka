import { Controller, Get, Inject, Res, UseGuards } from '@nestjs/common';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import { MerchantContextGuard } from '../authorization/merchant-context.guard';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { ACCESS_MANAGEMENT_PERMISSIONS } from './access-management-permissions';
import {
  type AccessManagementHttpResponse,
  setAccessManagementCacheHeaders,
} from './http-cache';
import { PermissionCatalogService } from './permission-catalog.service';

@Controller('api/v1/merchants/:merchantId/permissions')
@UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
export class PermissionCatalogController {
  public constructor(
    @Inject(PermissionCatalogService)
    private readonly permissionCatalogService: PermissionCatalogService,
  ) {}

  @Get()
  @RequirePermission(ACCESS_MANAGEMENT_PERMISSIONS.ROLES_READ)
  public async list(
    @Res({ passthrough: true }) response: AccessManagementHttpResponse,
  ) {
    const result = await this.permissionCatalogService.listAssignable();
    setAccessManagementCacheHeaders(response);
    return result;
  }
}
