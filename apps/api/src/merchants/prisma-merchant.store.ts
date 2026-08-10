import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type {
  MerchantProfileRecord,
  MerchantProfileStorePatch,
  MerchantSettingsRecord,
  MerchantSettingsStorePatch,
  MerchantStore,
} from './merchant.store';

const profileSelect = {
  id: true,
  displayName: true,
  legalName: true,
  phoneE164: true,
  email: true,
} as const;

const settingsSelect = { currency: true, timezone: true } as const;

@Injectable()
export class PrismaMerchantStore implements MerchantStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public getProfile(merchantId: string): Promise<MerchantProfileRecord | null> {
    return this.database.client.merchant.findUnique({
      where: { id: merchantId },
      select: profileSelect,
    });
  }

  public updateProfile(
    merchantId: string,
    patch: MerchantProfileStorePatch,
  ): Promise<MerchantProfileRecord> {
    return this.database.client.merchant.update({
      where: { id: merchantId },
      data: patch,
      select: profileSelect,
    });
  }

  public getSettings(
    merchantId: string,
  ): Promise<MerchantSettingsRecord | null> {
    return this.database.client.merchant.findUnique({
      where: { id: merchantId },
      select: settingsSelect,
    });
  }

  public updateSettings(
    merchantId: string,
    patch: MerchantSettingsStorePatch,
  ): Promise<MerchantSettingsRecord> {
    return this.database.client.merchant.update({
      where: { id: merchantId },
      data: patch,
      select: settingsSelect,
    });
  }
}
