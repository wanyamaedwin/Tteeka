import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { UNAUTHORIZED_MESSAGE } from '../auth/auth.service';
import { merchantIdSchema } from './merchant-id';
import type { MerchantContextRequest } from './merchant-context';
import { MerchantContextService } from './merchant-context.service';

@Injectable()
export class MerchantContextGuard implements CanActivate {
  public constructor(
    @Inject(MerchantContextService)
    private readonly merchantContextService: MerchantContextService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MerchantContextRequest>();
    if (request.auth === undefined) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    const parsedMerchantId = merchantIdSchema.safeParse(
      request.params.merchantId,
    );
    if (!parsedMerchantId.success) {
      throw new BadRequestException('Invalid merchantId.');
    }

    request.merchantContext = await this.merchantContextService.resolve(
      request.auth.user.id,
      parsedMerchantId.data,
    );
    return true;
  }
}
