import type { TteekaPrismaClient } from '@tteeka/database';
import { hashPassword } from '@tteeka/security';

import { APPLICATION_PERMISSION_KEYS } from '../access-management/application-permission-catalog';
import { syncApplicationPermissions } from '../access-management/permission-sync';
import { normalizeUgandaPhone } from '../auth/uganda-phone';

const LOCAL_CONFIRMATION = 'local-only';

export interface DevelopmentAuthProvisionInput {
  readonly merchantDisplayName: string;
  readonly userDisplayName: string;
  readonly phoneE164: string;
  readonly password: string;
  readonly roleName: string;
}

export interface DevelopmentAuthProvisionResult {
  readonly merchant: { readonly id: string; readonly displayName: string };
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly phoneE164: string;
  };
  readonly membership: { readonly id: string };
  readonly role: { readonly id: string; readonly name: string };
  readonly permissionCount: number;
}

export class DevelopmentAuthProvisionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DevelopmentAuthProvisionError';
  }
}

function requireBoundedValue(
  environment: NodeJS.ProcessEnv,
  name: string,
  maximumLength: number,
): string {
  const value = environment[name]?.trim();
  if (
    value === undefined ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new DevelopmentAuthProvisionError(
      `Development Auth provisioning requires a valid ${name}.`,
    );
  }
  return value;
}

export function readDevelopmentAuthProvisionInput(
  environment: NodeJS.ProcessEnv,
): DevelopmentAuthProvisionInput {
  if (environment.NODE_ENV !== 'development') {
    throw new DevelopmentAuthProvisionError(
      'Development Auth provisioning is allowed only when NODE_ENV=development.',
    );
  }
  if (environment.TTEEKA_DEV_PROVISION_AUTH_CONFIRM !== LOCAL_CONFIRMATION) {
    throw new DevelopmentAuthProvisionError(
      'Development Auth provisioning requires explicit local-only confirmation.',
    );
  }

  const phone = requireBoundedValue(environment, 'TTEEKA_DEV_AUTH_PHONE', 64);
  const phoneE164 = normalizeUgandaPhone(phone);
  if (phoneE164 === null) {
    throw new DevelopmentAuthProvisionError(
      'TTEEKA_DEV_AUTH_PHONE must be a supported Uganda phone number.',
    );
  }

  const password = environment.TTEEKA_DEV_AUTH_PASSWORD;
  if (
    password === undefined ||
    password.length === 0 ||
    password.length > 1024
  ) {
    throw new DevelopmentAuthProvisionError(
      'Development Auth provisioning requires a valid TTEEKA_DEV_AUTH_PASSWORD.',
    );
  }

  return {
    merchantDisplayName: requireBoundedValue(
      environment,
      'TTEEKA_DEV_AUTH_MERCHANT_NAME',
      160,
    ),
    userDisplayName: requireBoundedValue(
      environment,
      'TTEEKA_DEV_AUTH_USER_NAME',
      160,
    ),
    phoneE164,
    password,
    roleName: requireBoundedValue(environment, 'TTEEKA_DEV_AUTH_ROLE_NAME', 80),
  };
}

export async function provisionDevelopmentAuth(
  client: TteekaPrismaClient,
  input: DevelopmentAuthProvisionInput,
): Promise<DevelopmentAuthProvisionResult> {
  await syncApplicationPermissions(client);
  const passwordHash = await hashPassword(input.password);

  return client.$transaction(async (transaction) => {
    const matchingMerchants = await transaction.merchant.findMany({
      where: { displayName: input.merchantDisplayName },
      select: { id: true, displayName: true },
      orderBy: { id: 'asc' },
      take: 2,
    });
    if (matchingMerchants.length > 1) {
      throw new DevelopmentAuthProvisionError(
        'More than one Merchant matches the configured local display name.',
      );
    }
    const existingMerchant = matchingMerchants[0];
    const merchant =
      existingMerchant === undefined
        ? await transaction.merchant.create({
            data: { displayName: input.merchantDisplayName, status: 'ACTIVE' },
            select: { id: true, displayName: true },
          })
        : await transaction.merchant.update({
            where: { id: existingMerchant.id },
            data: { status: 'ACTIVE' },
            select: { id: true, displayName: true },
          });

    const user = await transaction.user.upsert({
      where: { phoneE164: input.phoneE164 },
      create: {
        displayName: input.userDisplayName,
        phoneE164: input.phoneE164,
        status: 'ACTIVE',
      },
      update: { displayName: input.userDisplayName, status: 'ACTIVE' },
      select: { id: true, displayName: true, phoneE164: true },
    });

    await transaction.passwordCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, passwordHash },
      update: { passwordHash, passwordChangedAt: new Date() },
      select: { id: true },
    });

    const membership = await transaction.merchantMembership.upsert({
      where: {
        merchantId_userId: { merchantId: merchant.id, userId: user.id },
      },
      create: { merchantId: merchant.id, userId: user.id, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
      select: { id: true },
    });

    const role = await transaction.role.upsert({
      where: {
        merchantId_name: { merchantId: merchant.id, name: input.roleName },
      },
      create: {
        merchantId: merchant.id,
        name: input.roleName,
        description: 'Explicit local development integration role',
        status: 'ACTIVE',
      },
      update: {
        description: 'Explicit local development integration role',
        status: 'ACTIVE',
      },
      select: { id: true, name: true },
    });

    const permissions = await transaction.permission.findMany({
      where: {
        key: { in: [...APPLICATION_PERMISSION_KEYS] },
        status: 'ACTIVE',
      },
      select: { id: true, key: true },
      orderBy: { key: 'asc' },
    });
    if (permissions.length !== APPLICATION_PERMISSION_KEYS.length) {
      throw new DevelopmentAuthProvisionError(
        'The active Permission catalog does not match the code-owned catalog.',
      );
    }

    await transaction.rolePermission.deleteMany({ where: { roleId: role.id } });
    await transaction.rolePermission.createMany({
      data: permissions.map(({ id }) => ({
        merchantId: merchant.id,
        roleId: role.id,
        permissionId: id,
      })),
    });
    await transaction.membershipRole.deleteMany({
      where: { membershipId: membership.id },
    });
    await transaction.membershipRole.create({
      data: {
        merchantId: merchant.id,
        membershipId: membership.id,
        roleId: role.id,
      },
      select: { id: true },
    });

    return {
      merchant,
      user,
      membership,
      role,
      permissionCount: permissions.length,
    };
  });
}
