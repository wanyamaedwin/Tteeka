import {
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
  MembershipAlreadyExistsError,
  type StaffRecord,
} from './access-management.store';
import type {
  AddStaffInput,
  MembershipPatch,
  MembershipRoleAssignment,
} from './staff.schema';

export interface StaffResponse {
  readonly id: string;
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly phone: string;
    readonly email: string | null;
  };
  readonly roles: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: 'ACTIVE' | 'DISABLED';
  }[];
}

@Injectable()
export class StaffService {
  public constructor(
    @Inject(ACCESS_MANAGEMENT_STORE)
    private readonly store: AccessManagementStore,
  ) {}

  public async list(
    context: ResolvedMerchantContext,
  ): Promise<{ readonly staff: readonly StaffResponse[] }> {
    return {
      staff: (await this.store.listStaff(context.merchant.id)).map(mapStaff),
    };
  }

  public async add(
    context: ResolvedMerchantContext,
    input: AddStaffInput,
  ): Promise<StaffResponse> {
    const user = await this.store.findActiveUserByPhone(input.phone);
    if (user === null) {
      throw new UnprocessableEntityException('Unable to add staff member.');
    }
    try {
      return mapStaff(
        await this.store.createMembership(context.merchant.id, user.id),
      );
    } catch (error: unknown) {
      if (error instanceof MembershipAlreadyExistsError) {
        throw new ConflictException('Staff membership already exists.');
      }
      throw error;
    }
  }

  public async updateStatus(
    context: ResolvedMerchantContext,
    membershipId: string,
    patch: MembershipPatch,
  ): Promise<StaffResponse> {
    if (patch.status === undefined) {
      throw new UnprocessableEntityException('Invalid Membership status.');
    }
    const record = await this.store.updateMembershipStatus(
      context.merchant.id,
      membershipId,
      patch.status,
    );
    if (record === null) throw new NotFoundException('Not found.');
    return mapStaff(record);
  }

  public async replaceRoles(
    context: ResolvedMerchantContext,
    membershipId: string,
    input: MembershipRoleAssignment,
  ): Promise<StaffResponse> {
    const result = await this.store.replaceMembershipRoles(
      context.merchant.id,
      membershipId,
      input.roleIds,
    );
    if (result.outcome === 'not-found') {
      throw new NotFoundException('Not found.');
    }
    if (result.outcome === 'invalid-assignment') {
      throw new UnprocessableEntityException('Invalid role assignment.');
    }
    return mapStaff(result.value);
  }
}

function mapStaff(record: StaffRecord): StaffResponse {
  return {
    id: record.id,
    status: record.status,
    user: {
      id: record.user.id,
      displayName: record.user.displayName,
      phone: record.user.phoneE164,
      email: record.user.email,
    },
    roles: record.roles,
  };
}
