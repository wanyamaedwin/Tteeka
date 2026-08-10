import type { Request } from 'express';

export interface AuthenticatedPrincipal {
  readonly user: {
    readonly id: string;
    readonly displayName: string;
  };
  readonly session: {
    readonly id: string;
    readonly expiresAt: Date;
  };
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedPrincipal;
}
