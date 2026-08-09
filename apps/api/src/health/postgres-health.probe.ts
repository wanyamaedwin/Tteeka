import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { AppConfig } from '@tteeka/config';
import { Pool } from 'pg';

import { APP_CONFIG } from '../configuration/configuration.module';
import type { InfrastructureHealthProbe } from './health.types';
import { withTimeout } from './with-timeout';

@Injectable()
export class PostgresHealthProbe
  implements InfrastructureHealthProbe, OnModuleDestroy
{
  private readonly pool: Pool;
  private readonly timeoutMs: number;

  public constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.timeoutMs = config.infraHealthTimeoutMs;
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 1,
      connectionTimeoutMillis: this.timeoutMs,
      idleTimeoutMillis: this.timeoutMs,
      allowExitOnIdle: true,
    });
  }

  public async check(): Promise<void> {
    const result = await withTimeout(
      this.pool.query<{ check: number }>('SELECT 1 AS check'),
      this.timeoutMs,
    );

    if (result.rows[0]?.check !== 1) {
      throw new Error(
        'PostgreSQL readiness query returned an unexpected result',
      );
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
