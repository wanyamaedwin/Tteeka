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
  addStaffSchema,
  membershipIdSchema,
  membershipPatchSchema,
  membershipRoleAssignmentSchema,
} from './staff.schema';
import { StaffService } from './staff.service';

@Controller('api/v1/merchants/:merchantId/staff')
@UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
export class StaffController {
  public constructor(
    @Inject(StaffService) private readonly staffService: StaffService,
  ) {}

  @Get()
  @RequirePermission(ACCESS_MANAGEMENT_PERMISSIONS.STAFF_READ)
  public async list(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Res({ passthrough: true }) response: AccessManagementHttpResponse,
  ) {
    const result = await this.staffService.list(context);
    setAccessManagementCacheHeaders(response);
    return result;
  }

  @Post()
  @RequirePermission(ACCESS_MANAGEMENT_PERMISSIONS.STAFF_MANAGE)
  public async add(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: AccessManagementHttpResponse,
  ) {
    const parsed = addStaffSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Invalid staff request.');
    const result = await this.staffService.add(context, parsed.data);
    setAccessManagementCacheHeaders(response);
    return result;
  }

  @Patch(':membershipId')
  @RequirePermission(ACCESS_MANAGEMENT_PERMISSIONS.STAFF_MANAGE)
  public async updateStatus(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: AccessManagementHttpResponse,
  ) {
    const parsedId = membershipIdSchema.safeParse(membershipId);
    const parsedBody = membershipPatchSchema.safeParse(body);
    if (!parsedId.success || !parsedBody.success) {
      throw new BadRequestException('Invalid Membership request.');
    }
    const result = await this.staffService.updateStatus(
      context,
      parsedId.data,
      parsedBody.data,
    );
    setAccessManagementCacheHeaders(response);
    return result;
  }

  @Put(':membershipId/roles')
  @RequirePermission(ACCESS_MANAGEMENT_PERMISSIONS.ROLES_MANAGE)
  public async replaceRoles(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: AccessManagementHttpResponse,
  ) {
    const parsedId = membershipIdSchema.safeParse(membershipId);
    const parsedBody = membershipRoleAssignmentSchema.safeParse(body);
    if (!parsedId.success || !parsedBody.success) {
      throw new BadRequestException('Invalid Role assignment request.');
    }
    const result = await this.staffService.replaceRoles(
      context,
      parsedId.data,
      parsedBody.data,
    );
    setAccessManagementCacheHeaders(response);
    return result;
  }
}
