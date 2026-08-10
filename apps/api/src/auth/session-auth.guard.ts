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
import { readSessionCookie } from './session-cookie';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  public constructor(
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request);
    if (!isSessionTokenFormat(token)) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    request.auth = await this.authService.authenticateSessionToken(token);
    return true;
  }
}
