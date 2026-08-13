import { NestFactory } from '@nestjs/core';
import type { AppConfig } from '@tteeka/config';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { APP_CONFIG } from './configuration/configuration.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.frontendOrigin !== undefined) {
    app.enableCors({
      origin: [config.frontendOrigin],
      credentials: true,
    });
  }
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
