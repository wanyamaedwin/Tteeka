import type { NodeEnvironment } from '@tteeka/config';
import type { Request } from 'express';

export const SESSION_COOKIE_NAME = 'tteeka_session';
export const SESSION_COOKIE_PATH = '/api/v1';

export interface SessionCookieOptions {
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly secure: boolean;
  readonly path: typeof SESSION_COOKIE_PATH;
}

export function sessionCookieOptions(
  nodeEnv: NodeEnvironment,
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: nodeEnv === 'staging' || nodeEnv === 'production',
    path: SESSION_COOKIE_PATH,
  };
}

export function readSessionCookie(request: Pick<Request, 'cookies'>): unknown {
  const cookies: unknown = request.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  return (cookies as Readonly<Record<string, unknown>>)[SESSION_COOKIE_NAME];
}
