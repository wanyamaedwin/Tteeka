import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import {
  type AccessManagementStore,
  type ActiveUserRecord,
  MembershipAlreadyExistsError,
  type MembershipStatus,
  type ReplacementResult,
  type RoleRecord,
  RoleNameAlreadyExistsError,
  type RoleStatus,
  type StaffRecord,
} from './access-management.store';

const staffSelect = {
  id: true,
  status: true,
  user: {
    select: { id: true, displayName: true, phoneE164: true, email: true },
  },
  membershipRoles: {
    select: { role: { select: { id: true, name: true, status: true } } },
    orderBy: [
      { role: { name: 'asc' as const } },
      { roleId: 'asc' as const },
    ] as [{ role: { name: 'asc' } }, { roleId: 'asc' }],
  },
} as const;

const roleSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  rolePermissions: {
    select: { permission: { select: { key: true, status: true } } },
    orderBy: { permission: { key: 'asc' as const } },
  },
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function mapStaff(record: {
  id: string;
  status: MembershipStatus;
  user: StaffRecord['user'];
  membershipRoles: readonly { role: StaffRecord['roles'][number] }[];
}): StaffRecord {
  return {
    id: record.id,
    status: record.status,
    user: record.user,
    roles: record.membershipRoles.map(({ role }) => role),
  };
}

function mapRole(record: {
  id: string;
  name: string;
  description: string | null;
  status: RoleStatus;
  rolePermissions: readonly { permission: RoleRecord['permissions'][number] }[];
}): RoleRecord {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    status: record.status,
    permissions: record.rolePermissions.map(({ permission }) => permission),
  };
}

@Injectable()
export class PrismaAccessManagementStore implements AccessManagementStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async listStaff(merchantId: string): Promise<readonly StaffRecord[]> {
    const records = await this.database.client.merchantMembership.findMany({
      where: { merchantId },
      select: staffSelect,
      orderBy: [{ user: { displayName: 'asc' } }, { id: 'asc' }],
    });
    return records.map(mapStaff);
  }

  public findActiveUserByPhone(
    phoneE164: string,
  ): Promise<ActiveUserRecord | null> {
    return this.database.client.user.findFirst({
      where: { phoneE164, status: 'ACTIVE' },
      select: { id: true },
    });
  }

  public async createMembership(
    merchantId: string,
    userId: string,
  ): Promise<StaffRecord> {
    try {
      return mapStaff(
        await this.database.client.merchantMembership.create({
          data: { merchantId, userId, status: 'ACTIVE' },
          select: staffSelect,
        }),
      );
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new MembershipAlreadyExistsError();
      }
      throw error;
    }
  }

  public async updateMembershipStatus(
    merchantId: string,
    membershipId: string,
    status: MembershipStatus,
  ): Promise<StaffRecord | null> {
    const updated = await this.database.client.merchantMembership.updateMany({
      where: { merchantId, id: membershipId },
      data: { status },
    });
    if (updated.count === 0) return null;
    const record = await this.database.client.merchantMembership.findUnique({
      where: { merchantId_id: { merchantId, id: membershipId } },
      select: staffSelect,
    });
    return record === null ? null : mapStaff(record);
  }

  public replaceMembershipRoles(
    merchantId: string,
    membershipId: string,
    roleIds: readonly string[],
  ): Promise<ReplacementResult<StaffRecord>> {
    return this.database.client.$transaction(async (transaction) => {
      const membership = await transaction.merchantMembership.findUnique({
        where: { merchantId_id: { merchantId, id: membershipId } },
        select: { id: true },
      });
      if (membership === null) return { outcome: 'not-found' } as const;
      const roles = await transaction.role.findMany({
        where: { merchantId, id: { in: [...roleIds] }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (roles.length !== roleIds.length) {
        return { outcome: 'invalid-assignment' } as const;
      }
      await transaction.membershipRole.deleteMany({
        where: { merchantId, membershipId },
      });
      if (roleIds.length > 0) {
        await transaction.membershipRole.createMany({
          data: roleIds.map((roleId) => ({ merchantId, membershipId, roleId })),
        });
      }
      const record = await transaction.merchantMembership.findUniqueOrThrow({
        where: { merchantId_id: { merchantId, id: membershipId } },
        select: staffSelect,
      });
      return { outcome: 'updated', value: mapStaff(record) } as const;
    });
  }

  public async listRoles(merchantId: string): Promise<readonly RoleRecord[]> {
    const records = await this.database.client.role.findMany({
      where: { merchantId },
      select: roleSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return records.map(mapRole);
  }

  public async createRole(
    merchantId: string,
    input: { readonly name: string; readonly description?: string | null },
  ): Promise<RoleRecord> {
    try {
      return mapRole(
        await this.database.client.role.create({
          data: { merchantId, ...input, status: 'ACTIVE' },
          select: roleSelect,
        }),
      );
    } catch (error: unknown) {
      if (isUniqueConstraintError(error))
        throw new RoleNameAlreadyExistsError();
      throw error;
    }
  }

  public async updateRole(
    merchantId: string,
    roleId: string,
    patch: {
      readonly name?: string;
      readonly description?: string | null;
      readonly status?: RoleStatus;
    },
  ): Promise<RoleRecord | null> {
    try {
      const updated = await this.database.client.role.updateMany({
        where: { merchantId, id: roleId },
        data: patch,
      });
      if (updated.count === 0) return null;
      const record = await this.database.client.role.findUnique({
        where: { merchantId_id: { merchantId, id: roleId } },
        select: roleSelect,
      });
      return record === null ? null : mapRole(record);
    } catch (error: unknown) {
      if (isUniqueConstraintError(error))
        throw new RoleNameAlreadyExistsError();
      throw error;
    }
  }

  public replaceRolePermissions(
    merchantId: string,
    roleId: string,
    permissionKeys: readonly string[],
  ): Promise<ReplacementResult<RoleRecord>> {
    return this.database.client.$transaction(async (transaction) => {
      const role = await transaction.role.findUnique({
        where: { merchantId_id: { merchantId, id: roleId } },
        select: { id: true },
      });
      if (role === null) return { outcome: 'not-found' } as const;
      const permissions = await transaction.permission.findMany({
        where: { key: { in: [...permissionKeys] }, status: 'ACTIVE' },
        select: { id: true, key: true },
      });
      if (permissions.length !== permissionKeys.length) {
        return { outcome: 'invalid-assignment' } as const;
      }
      await transaction.rolePermission.deleteMany({
        where: { merchantId, roleId },
      });
      if (permissions.length > 0) {
        await transaction.rolePermission.createMany({
          data: permissions.map(({ id }) => ({
            merchantId,
            roleId,
            permissionId: id,
          })),
        });
      }
      const record = await transaction.role.findUniqueOrThrow({
        where: { merchantId_id: { merchantId, id: roleId } },
        select: roleSelect,
      });
      return { outcome: 'updated', value: mapRole(record) } as const;
    });
  }

  public async listActivePermissionKeys(
    catalogKeys: readonly string[],
  ): Promise<readonly string[]> {
    const records = await this.database.client.permission.findMany({
      where: { key: { in: [...catalogKeys] }, status: 'ACTIVE' },
      select: { key: true },
      orderBy: { key: 'asc' },
    });
    return records.map(({ key }) => key);
  }
}
