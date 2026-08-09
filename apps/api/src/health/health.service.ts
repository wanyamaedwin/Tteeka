import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  POSTGRES_HEALTH_PROBE,
  REDIS_HEALTH_PROBE,
  type InfrastructureHealthProbe,
  type LivenessResponse,
  type ReadinessResponse,
} from './health.types';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  public constructor(
    @Inject(POSTGRES_HEALTH_PROBE)
    private readonly postgresProbe: InfrastructureHealthProbe,
    @Inject(REDIS_HEALTH_PROBE)
    private readonly redisProbe: InfrastructureHealthProbe,
  ) {}

  public getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }

  public async getReadiness(): Promise<ReadinessResponse> {
    const [postgresStatus, redisStatus] = await Promise.all([
      this.getProbeStatus('PostgreSQL', this.postgresProbe),
      this.getProbeStatus('Redis', this.redisProbe),
    ]);
    const ready = postgresStatus === 'up' && redisStatus === 'up';

    return {
      status: ready ? 'ready' : 'not_ready',
      checks: {
        postgres: { status: postgresStatus },
        redis: { status: redisStatus },
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async getProbeStatus(
    label: 'PostgreSQL' | 'Redis',
    probe: InfrastructureHealthProbe,
  ): Promise<'up' | 'down'> {
    try {
      await probe.check();
      return 'up';
    } catch {
      this.logger.warn(`${label} readiness failed`);
      return 'down';
    }
  }
}
