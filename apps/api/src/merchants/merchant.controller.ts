import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CurrentMerchantContext } from '../authorization/current-merchant-context.decorator';
import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import { MerchantContextGuard } from '../authorization/merchant-context.guard';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { MERCHANT_PERMISSIONS } from './merchant-permissions';
import { merchantProfilePatchSchema } from './merchant-profile.schema';
import { MerchantService } from './merchant.service';
import { merchantSettingsPatchSchema } from './merchant-settings.schema';

interface MerchantHttpResponse {
  setHeader(name: string, value: string): void;
}

function setPrivateCacheHeaders(response: MerchantHttpResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

@Controller('api/v1/merchants/:merchantId')
export class MerchantController {
  public constructor(
    @Inject(MerchantService) private readonly merchantService: MerchantService,
  ) {}

  @Get('profile')
  @UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
  @RequirePermission(MERCHANT_PERMISSIONS.PROFILE_READ)
  public async getProfile(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Res({ passthrough: true }) response: MerchantHttpResponse,
  ) {
    const profile = await this.merchantService.getProfile(context);
    setPrivateCacheHeaders(response);
    return profile;
  }

  @Patch('profile')
  @UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
  @RequirePermission(MERCHANT_PERMISSIONS.PROFILE_MANAGE)
  public async updateProfile(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: MerchantHttpResponse,
  ) {
    const parsed = merchantProfilePatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid merchant profile request.');
    }
    const profile = await this.merchantService.updateProfile(
      context,
      parsed.data,
    );
    setPrivateCacheHeaders(response);
    return profile;
  }

  @Get('settings')
  @UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
  @RequirePermission(MERCHANT_PERMISSIONS.SETTINGS_READ)
  public async getSettings(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Res({ passthrough: true }) response: MerchantHttpResponse,
  ) {
    const settings = await this.merchantService.getSettings(context);
    setPrivateCacheHeaders(response);
    return settings;
  }

  @Patch('settings')
  @UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
  @RequirePermission(MERCHANT_PERMISSIONS.SETTINGS_MANAGE)
  public async updateSettings(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: MerchantHttpResponse,
  ) {
    const parsed = merchantSettingsPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid merchant settings request.');
    }
    const settings = await this.merchantService.updateSettings(
      context,
      parsed.data,
    );
    setPrivateCacheHeaders(response);
    return settings;
  }
}
