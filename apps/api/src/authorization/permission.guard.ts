import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { MerchantContextRequest } from './merchant-context';
import { FORBIDDEN_MESSAGE } from './merchant-context.service';
import { PermissionEvaluator } from './permission-evaluator';
import { REQUIRED_PERMISSION_METADATA } from './require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  public constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PermissionEvaluator)
    private readonly permissionEvaluator: PermissionEvaluator,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      REQUIRED_PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (requiredPermission === undefined) {
      throw new InternalServerErrorException();
    }

    const request = context.switchToHttp().getRequest<MerchantContextRequest>();
    if (request.merchantContext === undefined) {
      throw new InternalServerErrorException();
    }

    if (
      !this.permissionEvaluator.hasPermission(
        request.merchantContext,
        requiredPermission,
      )
    ) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    return true;
  }
}
