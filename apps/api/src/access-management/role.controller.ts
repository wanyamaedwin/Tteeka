import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CurrentMerchantContext } from '../authorization/current-merchant-context.decorator';
import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import { MerchantContextGuard } from '../authorization/merchant-context.guard';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { ACCESS_MANAGEMENT_PERMISSIONS } from './access-management-permissions';
import {
  type AccessManagementHttpResponse,
  setAccessManagementCacheHeaders,
} from './http-cache';
import {
  createRoleSchema,
  roleIdSchema,
  rolePatchSchema,
  rolePermissionAssignmentSchema,
} from './role.schema';
import { RoleService } from './role.service';

@Controller('api/v1/merchants/:merchantId/roles')
@UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
export class RoleController {
  public constructor(
    @Inject(RoleService) private readonly roleService: RoleService,
  ) {}

  @Get()
  @RequirePermission(ACCESS_MANAGEMENT_PERMISSIONS.ROLES_READ)
  public async list(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Res({ passthrough: true }) response: AccessManagementHttpResponse,
  ) {
    const result = await this.roleService.list(context);
    setAccessManagementCacheHeaders(response);
    return result;
  }

  @Post()
  @RequirePermission(ACCESS_MANAGEMENT_PERMISSIONS.ROLES_MANAGE)
  public async create(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: AccessManagementHttpResponse,
  ) {
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid Role request.');
    const result = await this.roleService.create(context, parsed.data);
    setAccessManagementCacheHeaders(response);
    return result;
  }

  @Patch(':roleId')
  @RequirePermission(ACCESS_MANAGEMENT_PERMISSIONS.ROLES_MANAGE)
  public async update(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('roleId') roleId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: AccessManagementHttpResponse,
  ) {
    const parsedId = roleIdSchema.safeParse(roleId);
    const parsedBody = rolePatchSchema.safeParse(body);
    if (!parsedId.success || !parsedBody.success) {
      throw new BadRequestException('Invalid Role request.');
    }
    const result = await this.roleService.update(
      context,
      parsedId.data,
      parsedBody.data,
    );
    setAccessManagementCacheHeaders(response);
    return result;
  }

  @Put(':roleId/permissions')
  @RequirePermission(ACCESS_MANAGEMENT_PERMISSIONS.ROLES_MANAGE)
  public async replacePermissions(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('roleId') roleId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: AccessManagementHttpResponse,
  ) {
    const parsedId = roleIdSchema.safeParse(roleId);
    const parsedBody = rolePermissionAssignmentSchema.safeParse(body);
    if (!parsedId.success || !parsedBody.success) {
      throw new BadRequestException('Invalid Permission assignment request.');
    }
    const result = await this.roleService.replacePermissions(
      context,
      parsedId.data,
      parsedBody.data,
    );
    setAccessManagementCacheHeaders(response);
    return result;
  }
}
