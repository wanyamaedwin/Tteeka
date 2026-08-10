export const ACCESS_MANAGEMENT_STORE = Symbol('ACCESS_MANAGEMENT_STORE');

export type MembershipStatus = 'ACTIVE' | 'DISABLED';
export type RoleStatus = 'ACTIVE' | 'DISABLED';
export type PermissionStatus = 'ACTIVE' | 'DEPRECATED';

export interface StaffRecord {
  readonly id: string;
  readonly status: MembershipStatus;
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly phoneE164: string;
    readonly email: string | null;
  };
  readonly roles: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: RoleStatus;
  }[];
}

export interface RoleRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: RoleStatus;
  readonly permissions: readonly {
    readonly key: string;
    readonly status: PermissionStatus;
  }[];
}

export interface ActiveUserRecord {
  readonly id: string;
}

export type ReplacementResult<T> =
  | { readonly outcome: 'updated'; readonly value: T }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'invalid-assignment' };

export class MembershipAlreadyExistsError extends Error {}
export class RoleNameAlreadyExistsError extends Error {}

export interface AccessManagementStore {
  listStaff(merchantId: string): Promise<readonly StaffRecord[]>;
  findActiveUserByPhone(phoneE164: string): Promise<ActiveUserRecord | null>;
  createMembership(merchantId: string, userId: string): Promise<StaffRecord>;
  updateMembershipStatus(
    merchantId: string,
    membershipId: string,
    status: MembershipStatus,
  ): Promise<StaffRecord | null>;
  replaceMembershipRoles(
    merchantId: string,
    membershipId: string,
    roleIds: readonly string[],
  ): Promise<ReplacementResult<StaffRecord>>;
  listRoles(merchantId: string): Promise<readonly RoleRecord[]>;
  createRole(
    merchantId: string,
    input: { readonly name: string; readonly description?: string | null },
  ): Promise<RoleRecord>;
  updateRole(
    merchantId: string,
    roleId: string,
    patch: {
      readonly name?: string;
      readonly description?: string | null;
      readonly status?: RoleStatus;
    },
  ): Promise<RoleRecord | null>;
  replaceRolePermissions(
    merchantId: string,
    roleId: string,
    permissionKeys: readonly string[],
  ): Promise<ReplacementResult<RoleRecord>>;
  listActivePermissionKeys(
    catalogKeys: readonly string[],
  ): Promise<readonly string[]>;
}
