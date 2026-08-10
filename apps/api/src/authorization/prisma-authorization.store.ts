import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type {
  AuthorizationContextRecord,
  AuthorizationStore,
} from './authorization.store';

@Injectable()
export class PrismaAuthorizationStore implements AuthorizationStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async findMerchantContextForUser(
    userId: string,
    merchantId: string,
  ): Promise<AuthorizationContextRecord | null> {
    return this.database.client.merchantMembership.findUnique({
      where: { merchantId_userId: { merchantId, userId } },
      select: {
        id: true,
        status: true,
        merchant: {
          select: { id: true, displayName: true, status: true },
        },
        membershipRoles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                status: true,
                rolePermissions: {
                  select: {
                    permission: { select: { key: true, status: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}
