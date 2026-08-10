import type { AuthenticatedRequest } from '../auth/authenticated-principal';

export interface ResolvedMerchantContext {
  readonly merchant: {
    readonly id: string;
    readonly displayName: string;
  };
  readonly membership: {
    readonly id: string;
  };
  readonly roles: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly permissions: ReadonlySet<string>;
}

export interface MerchantContextRequest extends AuthenticatedRequest {
  merchantContext?: ResolvedMerchantContext;
}
