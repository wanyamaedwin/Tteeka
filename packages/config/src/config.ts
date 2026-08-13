import { z } from 'zod';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const REDIS_PROTOCOLS = new Set(['redis:', 'rediss:']);

const optionalEnvironmentValue = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const optionalOrigin = optionalEnvironmentValue.refine(
  (value) => {
    if (value === undefined) return true;
    try {
      const url = new URL(value);
      return url.origin === value && ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  },
  'FRONTEND_ORIGIN must be an HTTP(S) origin without a path',
);

const mtnMomoCollectionsEnvironmentSchema = z
  .object({
    MTN_MOMO_COLLECTIONS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    MTN_MOMO_COLLECTIONS_API_USER: optionalEnvironmentValue,
    MTN_MOMO_COLLECTIONS_API_KEY: optionalEnvironmentValue,
    MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY: optionalEnvironmentValue,
    MTN_MOMO_COLLECTIONS_CALLBACK_URL: optionalEnvironmentValue,
    MTN_MOMO_COLLECTIONS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(30_000)
      .default(10_000),
  })
  .superRefine((value, context) => {
    if (!value.MTN_MOMO_COLLECTIONS_ENABLED) return;

    for (const field of [
      'MTN_MOMO_COLLECTIONS_API_USER',
      'MTN_MOMO_COLLECTIONS_API_KEY',
      'MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY',
    ] as const) {
      const credential = value[field];
      if (credential === undefined || credential.trim().length === 0) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required when MTN Collections is enabled`,
        });
      }
    }

    const apiUser = value.MTN_MOMO_COLLECTIONS_API_USER;
    if (
      apiUser !== undefined &&
      !z.uuid({ version: 'v4' }).safeParse(apiUser).success
    ) {
      context.addIssue({
        code: 'custom',
        path: ['MTN_MOMO_COLLECTIONS_API_USER'],
        message: 'MTN_MOMO_COLLECTIONS_API_USER must be a UUID v4',
      });
    }

    const callbackUrl = value.MTN_MOMO_COLLECTIONS_CALLBACK_URL;
    if (callbackUrl !== undefined) {
      try {
        if (new URL(callbackUrl).protocol !== 'https:') throw new Error();
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['MTN_MOMO_COLLECTIONS_CALLBACK_URL'],
          message: 'MTN_MOMO_COLLECTIONS_CALLBACK_URL must be an HTTPS URL',
        });
      }
    }
  });

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
  FRONTEND_ORIGIN: optionalOrigin,
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
  SESSION_TOUCH_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(300),
});

export type RawEnvironment = Readonly<Record<string, string | undefined>>;
export type NodeEnvironment = z.infer<typeof environmentSchema>['NODE_ENV'];

export type MtnMomoCollectionsConfig =
  | Readonly<{ enabled: false }>
  | Readonly<{
      enabled: true;
      apiUser: string;
      apiKey: string;
      subscriptionKey: string;
      callbackUrl?: string;
      timeoutMs: number;
    }>;

export interface AppConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly apiPort: number;
  readonly frontendOrigin?: string;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly infraHealthTimeoutMs: number;
  readonly sessionTtlSeconds: number;
  readonly sessionTouchIntervalSeconds: number;
  readonly mtnMomoCollections: MtnMomoCollectionsConfig;
}

export class ConfigurationError extends Error {
  public constructor(messages: readonly string[]) {
    super(`Invalid application configuration:\n- ${messages.join('\n- ')}`);
    this.name = 'ConfigurationError';
  }
}

function configurationMessages(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const field = issue.path.join('.') || 'environment';
    return `${field}: ${issue.message}`;
  });
}

export function loadMtnMomoCollectionsConfig(
  environment: RawEnvironment,
): MtnMomoCollectionsConfig {
  const result = mtnMomoCollectionsEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new ConfigurationError(configurationMessages(result.error));
  }

  if (!result.data.MTN_MOMO_COLLECTIONS_ENABLED) {
    return Object.freeze({ enabled: false });
  }

  const callbackUrl = result.data.MTN_MOMO_COLLECTIONS_CALLBACK_URL;
  return Object.freeze({
    enabled: true,
    apiUser: result.data.MTN_MOMO_COLLECTIONS_API_USER!,
    apiKey: result.data.MTN_MOMO_COLLECTIONS_API_KEY!,
    subscriptionKey: result.data.MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY!,
    ...(callbackUrl === undefined ? {} : { callbackUrl }),
    timeoutMs: result.data.MTN_MOMO_COLLECTIONS_TIMEOUT_MS,
  });
}

export function loadConfig(environment: RawEnvironment): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    throw new ConfigurationError(configurationMessages(result.error));
  }

  const mtnMomoCollections = loadMtnMomoCollectionsConfig(environment);

  return Object.freeze({
    nodeEnv: result.data.NODE_ENV,
    apiPort: result.data.API_PORT,
    ...(result.data.FRONTEND_ORIGIN === undefined
      ? {}
      : { frontendOrigin: result.data.FRONTEND_ORIGIN }),
    databaseUrl: result.data.DATABASE_URL,
    redisUrl: result.data.REDIS_URL,
    infraHealthTimeoutMs: result.data.INFRA_HEALTH_TIMEOUT_MS,
    sessionTtlSeconds: result.data.SESSION_TTL_SECONDS,
    sessionTouchIntervalSeconds: result.data.SESSION_TOUCH_INTERVAL_SECONDS,
    mtnMomoCollections,
  });
}
