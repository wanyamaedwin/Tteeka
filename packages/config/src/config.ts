import { z } from 'zod';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const REDIS_PROTOCOLS = new Set(['redis:', 'rediss:']);

function hasAllowedProtocol(
  value: string,
  protocols: ReadonlySet<string>,
): boolean {
  try {
    return protocols.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .url('DATABASE_URL must be a valid URL')
    .refine(
      (value) => hasAllowedProtocol(value, POSTGRES_PROTOCOLS),
      'DATABASE_URL must use the postgresql:// or postgres:// scheme',
    ),
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .url('REDIS_URL must be a valid URL')
    .refine(
      (value) => hasAllowedProtocol(value, REDIS_PROTOCOLS),
      'REDIS_URL must use the redis:// or rediss:// scheme',
    ),
  INFRA_HEALTH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(60_000)
    .default(2000),
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(2_592_000)
    .default(43_200),
});

export type RawEnvironment = Readonly<Record<string, string | undefined>>;
export type NodeEnvironment = z.infer<typeof environmentSchema>['NODE_ENV'];

export interface AppConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly apiPort: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly infraHealthTimeoutMs: number;
  readonly sessionTtlSeconds: number;
}

export class ConfigurationError extends Error {
  public constructor(messages: readonly string[]) {
    super(`Invalid application configuration:\n- ${messages.join('\n- ')}`);
    this.name = 'ConfigurationError';
  }
}

export function loadConfig(environment: RawEnvironment): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const field = issue.path.join('.') || 'environment';
      return `${field}: ${issue.message}`;
    });

    throw new ConfigurationError(messages);
  }

  return Object.freeze({
    nodeEnv: result.data.NODE_ENV,
    apiPort: result.data.API_PORT,
    databaseUrl: result.data.DATABASE_URL,
    redisUrl: result.data.REDIS_URL,
    infraHealthTimeoutMs: result.data.INFRA_HEALTH_TIMEOUT_MS,
    sessionTtlSeconds: result.data.SESSION_TTL_SECONDS,
  });
}
