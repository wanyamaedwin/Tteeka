import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { normalizeUgandaPhone } from '../auth/uganda-phone';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  idempotencyKeySchema,
  registrationRequestSchema,
  workspaceRequestSchema,
} from './onboarding.schema';
import { OnboardingService } from './onboarding.service';

@Controller('api/v1/onboarding')
export class OnboardingController {
  public constructor(
    @Inject(OnboardingService)
    private readonly onboarding: OnboardingService,
  ) {}

  @Post('register')
  public async register(
    @Body() body: unknown,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const request = registrationRequestSchema.safeParse(body);
    const key = idempotencyKeySchema.safeParse(rawIdempotencyKey);
    if (!request.success || !key.success) {
      throw new BadRequestException('Invalid registration request.');
    }
    const phoneE164 = normalizeUgandaPhone(request.data.phone);
    if (phoneE164 === null) {
      throw new BadRequestException('Invalid registration request.');
    }
    return this.onboarding.register({ ...request.data, phoneE164 }, key.data);
  }

  @Get('workspace-status')
  @UseGuards(SessionAuthGuard)
  public workspaceStatus(
    @CurrentAuth() auth: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.onboarding.workspaceStatus(auth.user.id);
  }

  @Post('workspace')
  @UseGuards(SessionAuthGuard)
  public createWorkspace(
    @CurrentAuth() auth: AuthenticatedPrincipal,
    @Body() body: unknown,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const request = workspaceRequestSchema.safeParse(body);
    const key = idempotencyKeySchema.safeParse(rawIdempotencyKey);
    if (!request.success || !key.success) {
      throw new BadRequestException('Invalid workspace request.');
    }
    return this.onboarding.createInitialWorkspace(
      auth.user.id,
      request.data,
      key.data,
    );
  }
}
