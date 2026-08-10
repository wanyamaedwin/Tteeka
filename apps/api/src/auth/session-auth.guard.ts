import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isSessionTokenFormat } from '@tteeka/security';

import type { AuthenticatedRequest } from './authenticated-principal';
import { AuthService, UNAUTHORIZED_MESSAGE } from './auth.service';
import { SESSION_COOKIE_NAME } from './session-cookie';

function sessionCookie(request: AuthenticatedRequest): unknown {
  const cookies: unknown = request.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  return (cookies as Readonly<Record<string, unknown>>)[SESSION_COOKIE_NAME];
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  public constructor(
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = sessionCookie(request);
    if (!isSessionTokenFormat(token)) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    request.auth = await this.authService.authenticateSessionToken(token);
    return true;
  }
}
