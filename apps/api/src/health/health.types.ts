export const POSTGRES_HEALTH_PROBE = Symbol('POSTGRES_HEALTH_PROBE');
export const REDIS_HEALTH_PROBE = Symbol('REDIS_HEALTH_PROBE');

export interface InfrastructureHealthProbe {
  check(): Promise<void>;
}

export interface LivenessResponse {
  readonly status: 'ok';
  readonly service: 'api';
  readonly timestamp: string;
}

export interface ReadinessResponse {
  readonly status: 'ready' | 'not_ready';
  readonly checks: {
    readonly postgres: { readonly status: 'up' | 'down' };
    readonly redis: { readonly status: 'up' | 'down' };
  };
  readonly timestamp: string;
}
