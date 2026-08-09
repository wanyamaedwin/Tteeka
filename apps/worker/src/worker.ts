import {
  loadConfig,
  type AppConfig,
  type RawEnvironment,
} from '@tteeka/config';

export function initializeWorker(environment: RawEnvironment): AppConfig {
  return loadConfig(environment);
}
