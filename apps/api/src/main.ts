import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(DEFAULT_PORT);
}

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? (error.stack ?? error.message)
      : 'Unknown startup error';

  process.stderr.write(`Failed to start Tteeka API: ${message}\n`);
  process.exitCode = 1;
});
