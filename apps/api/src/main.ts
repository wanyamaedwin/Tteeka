import { NestFactory } from '@nestjs/core';
import type { AppConfig } from '@tteeka/config';

import { AppModule } from './app.module';
import { APP_CONFIG } from './configuration/configuration.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);
  app.enableShutdownHooks();
  await app.listen(config.apiPort);
}

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? (error.stack ?? error.message)
      : 'Unknown startup error';

  process.stderr.write(`Failed to start Tteeka API: ${message}\n`);
  process.exitCode = 1;
});
