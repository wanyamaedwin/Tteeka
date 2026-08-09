import { initializeWorker } from './worker';

async function run(): Promise<void> {
  const runtime = initializeWorker(process.env);

  try {
    process.stdout.write(
      `Tteeka worker started (${runtime.config.nodeEnv}).\n`,
    );
  } finally {
    await runtime.close();
  }
}

void run().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`Failed to start Tteeka worker: ${message}\n`);
  process.exitCode = 1;
});
