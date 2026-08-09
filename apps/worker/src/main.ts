import { initializeWorker } from './worker';

try {
  const config = initializeWorker(process.env);
  process.stdout.write(`Tteeka worker started (${config.nodeEnv}).\n`);
} catch (error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`Failed to start Tteeka worker: ${message}\n`);
  process.exitCode = 1;
}
