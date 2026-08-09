import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { HealthService } from './health.service';
import type { LivenessResponse, ReadinessResponse } from './health.types';

@Controller('api/v1/health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get('live')
  public live(): LivenessResponse {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  public async ready(): Promise<ReadinessResponse> {
    const response = await this.healthService.getReadiness();

    if (response.status === 'not_ready') {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}
