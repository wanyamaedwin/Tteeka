import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Post,
  Res,
} from '@nestjs/common';
import type { AppConfig } from '@tteeka/config';

import { APP_CONFIG } from '../configuration/configuration.module';
import { AuthService } from './auth.service';
import { loginRequestSchema } from './login-request';
import { normalizeUgandaPhone } from './uganda-phone';

export const SESSION_COOKIE_NAME = 'tteeka_session';
export const SESSION_COOKIE_PATH = '/api/v1';

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
      httpOnly: true,
      sameSite: 'lax',
      secure:
        this.config.nodeEnv === 'staging' ||
        this.config.nodeEnv === 'production',
      path: SESSION_COOKIE_PATH,
      expires: login.session.expiresAt,
    });
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');

    return {
      user: login.user,
      session: { expiresAt: login.session.expiresAt.toISOString() },
    };
  }
}
