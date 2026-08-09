import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { AppConfig } from '@tteeka/config';
import { createClient, type RedisClientType } from 'redis';

import { APP_CONFIG } from '../configuration/configuration.module';
import type { InfrastructureHealthProbe } from './health.types';
import { withTimeout } from './with-timeout';

@Injectable()
export class RedisHealthProbe
  implements InfrastructureHealthProbe, OnModuleDestroy
{
  private readonly client: RedisClientType;
  private readonly timeoutMs: number;

  public constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.timeoutMs = config.infraHealthTimeoutMs;
    this.client = createClient({
      url: config.redisUrl,
      socket: {
        connectTimeout: this.timeoutMs,
        reconnectStrategy: false,
      },
    });
    this.client.on('error', () => undefined);
  }

  public async check(): Promise<void> {
    if (!this.client.isOpen) {
      await withTimeout(this.client.connect(), this.timeoutMs);
    }

    const response = await withTimeout(this.client.ping(), this.timeoutMs);

    if (response !== 'PONG') {
      throw new Error('Redis readiness ping returned an unexpected response');
    }
  }

  public onModuleDestroy(): void {
    if (this.client.isOpen) {
      this.client.destroy();
    }
  }
}
