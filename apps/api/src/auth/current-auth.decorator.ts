import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from './authenticated-principal';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth === undefined) {
      throw new Error('Authenticated request context is unavailable.');
    }
    return request.auth;
  },
);
