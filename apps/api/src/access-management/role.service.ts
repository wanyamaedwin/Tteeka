import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import {
  ACCESS_MANAGEMENT_STORE,
  type AccessManagementStore,
  type RoleRecord,
  RoleNameAlreadyExistsError,
} from './access-management.store';
import { isApplicationPermissionKey } from './application-permission-catalog';
import type {
  CreateRoleInput,
  RolePatch,
  RolePermissionAssignment,
} from './role.schema';

export type RoleResponse = RoleRecord;

@Injectable()
export class RoleService {
  public constructor(
    @Inject(ACCESS_MANAGEMENT_STORE)
    private readonly store: AccessManagementStore,
  ) {}

  public async list(
    context: ResolvedMerchantContext,
  ): Promise<{ readonly roles: readonly RoleResponse[] }> {
    return { roles: await this.store.listRoles(context.merchant.id) };
  }

  public async create(
    context: ResolvedMerchantContext,
    input: CreateRoleInput,
  ): Promise<RoleResponse> {
    try {
      return await this.store.createRole(context.merchant.id, {
        name: input.name,
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
      });
    } catch (error: unknown) {
      this.mapConflict(error);
    }
  }

  public async update(
    context: ResolvedMerchantContext,
    roleId: string,
    patch: RolePatch,
  ): Promise<RoleResponse> {
    try {
      const record = await this.store.updateRole(context.merchant.id, roleId, {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.description === undefined
          ? {}
          : { description: patch.description }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
      });
      if (record === null) throw new NotFoundException('Not found.');
      return record;
    } catch (error: unknown) {
      this.mapConflict(error);
    }
  }

  public async replacePermissions(
    context: ResolvedMerchantContext,
    roleId: string,
    input: RolePermissionAssignment,
  ): Promise<RoleResponse> {
    if (!input.permissionKeys.every(isApplicationPermissionKey)) {
      throw new BadRequestException('Invalid Permission assignment request.');
    }
    const result = await this.store.replaceRolePermissions(
      context.merchant.id,
      roleId,
      input.permissionKeys,
    );
    if (result.outcome === 'not-found') {
      throw new NotFoundException('Not found.');
    }
    if (result.outcome === 'invalid-assignment') {
      throw new UnprocessableEntityException('Invalid permission assignment.');
    }
    return result.value;
  }

  private mapConflict(error: unknown): never {
    if (error instanceof RoleNameAlreadyExistsError) {
      throw new ConflictException('Role name already exists.');
    }
    throw error;
  }
}
