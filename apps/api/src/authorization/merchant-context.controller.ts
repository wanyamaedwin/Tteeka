import { Controller, Get, Res, UseGuards } from '@nestjs/common';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CurrentMerchantContext } from './current-merchant-context.decorator';
import type { ResolvedMerchantContext } from './merchant-context';
import { MerchantContextGuard } from './merchant-context.guard';

interface MerchantContextHttpResponse {
  setHeader(name: string, value: string): void;
}

@Controller('api/v1/merchants')
export class MerchantContextController {
  @Get(':merchantId/context')
  @UseGuards(SessionAuthGuard, MerchantContextGuard)
  public context(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Res({ passthrough: true }) response: MerchantContextHttpResponse,
  ): {
    merchant: { id: string; displayName: string };
    membership: { id: string };
    roles: readonly { id: string; name: string }[];
    permissions: string[];
  } {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    return {
      merchant: context.merchant,
      membership: context.membership,
      roles: context.roles,
      permissions: [...context.permissions].sort(),
    };
  }
}
