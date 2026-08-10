import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type {
  MerchantContextRequest,
  ResolvedMerchantContext,
} from './merchant-context';

export const CurrentMerchantContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ResolvedMerchantContext => {
    const request = context.switchToHttp().getRequest<MerchantContextRequest>();
    if (request.merchantContext === undefined) {
      throw new Error('Merchant request context is unavailable.');
    }
    return request.merchantContext;
  },
);
