import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { POSTGRES_HEALTH_PROBE, REDIS_HEALTH_PROBE } from './health.types';
import { PostgresHealthProbe } from './postgres-health.probe';
import { RedisHealthProbe } from './redis-health.probe';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: POSTGRES_HEALTH_PROBE, useClass: PostgresHealthProbe },
    { provide: REDIS_HEALTH_PROBE, useClass: RedisHealthProbe },
  ],
})
export class HealthModule {}
