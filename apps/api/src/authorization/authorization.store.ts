export const AUTHORIZATION_STORE = Symbol('AUTHORIZATION_STORE');

export interface AuthorizationContextRecord {
  readonly id: string;
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly merchant: {
    readonly id: string;
    readonly displayName: string;
    readonly status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  };
  readonly membershipRoles: readonly {
    readonly role: {
      readonly id: string;
      readonly name: string;
      readonly status: 'ACTIVE' | 'DISABLED';
      readonly rolePermissions: readonly {
        readonly permission: {
          readonly key: string;
          readonly status: 'ACTIVE' | 'DEPRECATED';
        };
      }[];
    };
  }[];
}

export interface AuthorizationStore {
  findMerchantContextForUser(
    userId: string,
    merchantId: string,
  ): Promise<AuthorizationContextRecord | null>;
}
