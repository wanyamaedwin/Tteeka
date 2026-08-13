import { createHash } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@tteeka/database';
import { hashPassword } from '@tteeka/security';

import { APPLICATION_PERMISSION_KEYS } from '../access-management/application-permission-catalog';
import { syncApplicationPermissions } from '../access-management/permission-sync';
import { DatabaseService } from '../database/database.service';
import type {
  RegistrationRequest,
  WorkspaceRequest,
} from './onboarding.schema';

const PUBLIC_REGISTRATION_SUBJECT = 'public';
const DUPLICATE_PHONE_MESSAGE =
  'An account with this phone number already exists. Sign in instead.';
const IDEMPOTENCY_CONFLICT_MESSAGE =
  'This Idempotency-Key was already used with a different request.';
const EXISTING_WORKSPACE_MESSAGE =
  'You already belong to a Tteeka workspace.';

export interface OnboardingResult {
  readonly user: { readonly id: string };
  readonly merchant: { readonly id: string; readonly displayName: string };
  readonly membership: { readonly id: string };
}

function requestHash(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Injectable()
export class OnboardingService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async register(
    input: RegistrationRequest & { readonly phoneE164: string },
    idempotencyKey: string,
  ): Promise<OnboardingResult> {
    await syncApplicationPermissions(this.database.client);
    const hash = requestHash(input);
    const passwordHash = await hashPassword(input.password);

    try {
      return await this.database.client.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'onboarding:register:key:' + idempotencyKey}, 0))`;
        const replay = await transaction.onboardingCommand.findUnique({
          where: {
            kind_subject_idempotencyKey: {
              kind: 'REGISTER',
              subject: PUBLIC_REGISTRATION_SUBJECT,
              idempotencyKey,
            },
          },
        });
        if (replay !== null) {
          if (replay.requestHash !== hash) {
            throw new ConflictException(IDEMPOTENCY_CONFLICT_MESSAGE);
          }
          return this.readResult(transaction, replay);
        }

        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'onboarding:register:phone:' + input.phoneE164}, 0))`;
        if (
          (await transaction.user.findUnique({
            where: { phoneE164: input.phoneE164 },
            select: { id: true },
          })) !== null
        ) {
          throw new ConflictException(DUPLICATE_PHONE_MESSAGE);
        }

        const user = await transaction.user.create({
          data: {
            displayName: input.name,
            phoneE164: input.phoneE164,
            status: 'ACTIVE',
            passwordCredential: { create: { passwordHash } },
          },
          select: { id: true },
        });
        const result = await this.createWorkspaceGraph(
          transaction,
          user.id,
          input.businessName,
        );
        await transaction.onboardingCommand.create({
          data: {
            kind: 'REGISTER',
            subject: PUBLIC_REGISTRATION_SUBJECT,
            idempotencyKey,
            requestHash: hash,
            userId: user.id,
            merchantId: result.merchant.id,
            membershipId: result.membership.id,
          },
        });
        return { user, ...result };
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(DUPLICATE_PHONE_MESSAGE);
      }
      throw error;
    }
  }

  public async workspaceStatus(userId: string): Promise<
    | { readonly state: 'NO_WORKSPACE' }
    | {
        readonly state: 'READY';
        readonly workspace: { readonly merchantId: string; readonly displayName: string };
      }
  > {
    const membership = await this.database.client.merchantMembership.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { merchant: { select: { id: true, displayName: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return membership === null
      ? { state: 'NO_WORKSPACE' }
      : {
          state: 'READY',
          workspace: {
            merchantId: membership.merchant.id,
            displayName: membership.merchant.displayName,
          },
        };
  }

  public async createInitialWorkspace(
    userId: string,
    input: WorkspaceRequest,
    idempotencyKey: string,
  ): Promise<OnboardingResult> {
    await syncApplicationPermissions(this.database.client);
    const hash = requestHash(input);
    return this.database.client.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'onboarding:workspace:user:' + userId}, 0))`;
      const replay = await transaction.onboardingCommand.findUnique({
        where: {
          kind_subject_idempotencyKey: {
            kind: 'WORKSPACE',
            subject: userId,
            idempotencyKey,
          },
        },
      });
      if (replay !== null) {
        if (replay.requestHash !== hash) {
          throw new ConflictException(IDEMPOTENCY_CONFLICT_MESSAGE);
        }
        return this.readResult(transaction, replay);
      }
      if (
        (await transaction.merchantMembership.count({
          where: { userId, status: 'ACTIVE' },
        })) !== 0
      ) {
        throw new ConflictException(EXISTING_WORKSPACE_MESSAGE);
      }
      const result = await this.createWorkspaceGraph(
        transaction,
        userId,
        input.businessName,
      );
      await transaction.onboardingCommand.create({
        data: {
          kind: 'WORKSPACE',
          subject: userId,
          idempotencyKey,
          requestHash: hash,
          userId,
          merchantId: result.merchant.id,
          membershipId: result.membership.id,
        },
      });
      return { user: { id: userId }, ...result };
    });
  }

  private async createWorkspaceGraph(
    transaction: Prisma.TransactionClient,
    userId: string,
    businessName: string,
  ): Promise<Omit<OnboardingResult, 'user'>> {
    const permissions = await transaction.permission.findMany({
      where: { key: { in: [...APPLICATION_PERMISSION_KEYS] }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (permissions.length !== APPLICATION_PERMISSION_KEYS.length) {
      throw new InternalServerErrorException(
        'The active Permission catalog is unavailable.',
      );
    }
    const merchant = await transaction.merchant.create({
      data: { displayName: businessName, status: 'ACTIVE' },
      select: { id: true, displayName: true },
    });
    const membership = await transaction.merchantMembership.create({
      data: { merchantId: merchant.id, userId, status: 'ACTIVE' },
      select: { id: true },
    });
    const role = await transaction.role.create({
      data: {
        merchantId: merchant.id,
        name: 'Owner',
        description: 'Initial business workspace owner',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    await transaction.membershipRole.create({
      data: {
        merchantId: merchant.id,
        membershipId: membership.id,
        roleId: role.id,
      },
    });
    await transaction.rolePermission.createMany({
      data: permissions.map(({ id }) => ({
        merchantId: merchant.id,
        roleId: role.id,
        permissionId: id,
      })),
    });
    return { merchant, membership };
  }

  private async readResult(
    transaction: Prisma.TransactionClient,
    command: { readonly userId: string; readonly merchantId: string; readonly membershipId: string },
  ): Promise<OnboardingResult> {
    const merchant = await transaction.merchant.findUnique({
      where: { id: command.merchantId },
      select: { id: true, displayName: true },
    });
    if (merchant === null) {
      throw new InternalServerErrorException('Onboarding replay is unavailable.');
    }
    return {
      user: { id: command.userId },
      merchant,
      membership: { id: command.membershipId },
    };
  }
}
