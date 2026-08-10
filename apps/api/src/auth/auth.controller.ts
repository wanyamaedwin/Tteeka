import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { AppConfig } from '@tteeka/config';

import { APP_CONFIG } from '../configuration/configuration.module';
import { AuthService } from './auth.service';
import type { AuthenticatedPrincipal } from './authenticated-principal';
import type { AuthenticatedRequest } from './authenticated-principal';
import { CurrentAuth } from './current-auth.decorator';
import { loginRequestSchema } from './login-request';
import { normalizeUgandaPhone } from './uganda-phone';
import {
  readSessionCookie,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './session-cookie';
import { SessionAuthGuard } from './session-auth.guard';

export { SESSION_COOKIE_NAME, SESSION_COOKIE_PATH } from './session-cookie';

interface LoginHttpResponse {
  cookie(
    name: string,
    value: string,
    options: {
      readonly httpOnly: boolean;
      readonly sameSite: 'lax';
      readonly secure: boolean;
      readonly path: string;
      readonly expires: Date;
    },
  ): void;
  setHeader(name: string, value: string): void;
}

interface PrivateHttpResponse {
  setHeader(name: string, value: string): void;
}

interface AuthenticatedHttpResponse extends PrivateHttpResponse {
  clearCookie(
    name: string,
    options: ReturnType<typeof sessionCookieOptions>,
  ): void;
}

function setPrivateCacheHeaders(response: PrivateHttpResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

@Controller('api/v1/auth')
export class AuthController {
  public constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  public async login(
    @Body() body: unknown,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string | undefined,
    @Res({ passthrough: true }) response: LoginHttpResponse,
  ): Promise<{
    user: { id: string; displayName: string };
    session: { expiresAt: string };
  }> {
    const request = loginRequestSchema.safeParse(body);
    if (!request.success) {
      throw new BadRequestException('Invalid login request.');
    }
    const phoneE164 = normalizeUgandaPhone(request.data.phone);
    if (phoneE164 === null) {
      throw new BadRequestException('Invalid login request.');
    }

    const login = await this.authService.login(
      phoneE164,
      request.data.password,
      {
        ...(userAgent === undefined
          ? {}
          : { userAgent: userAgent.slice(0, 512) }),
        ...(ipAddress === undefined || ipAddress.length > 45
          ? {}
          : { ipAddress }),
      },
    );
    response.cookie(SESSION_COOKIE_NAME, login.token, {
      ...sessionCookieOptions(this.config.nodeEnv),
      expires: login.session.expiresAt,
    });
    setPrivateCacheHeaders(response);

    return {
      user: login.user,
      session: { expiresAt: login.session.expiresAt.toISOString() },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: AuthenticatedHttpResponse,
  ): Promise<void> {
    await this.authService.logout(readSessionCookie(request));
    response.clearCookie(
      SESSION_COOKIE_NAME,
      sessionCookieOptions(this.config.nodeEnv),
    );
    setPrivateCacheHeaders(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard)
  public async logoutAll(
    @CurrentAuth() auth: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: AuthenticatedHttpResponse,
  ): Promise<void> {
    await this.authService.logoutAll(auth);
    response.clearCookie(
      SESSION_COOKIE_NAME,
      sessionCookieOptions(this.config.nodeEnv),
    );
    setPrivateCacheHeaders(response);
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  public me(
    @CurrentAuth() auth: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: AuthenticatedHttpResponse,
  ): {
    user: { id: string; displayName: string };
    session: { expiresAt: string };
  } {
    setPrivateCacheHeaders(response);
    return {
      user: auth.user,
      session: { expiresAt: auth.session.expiresAt.toISOString() },
    };
  }
}
