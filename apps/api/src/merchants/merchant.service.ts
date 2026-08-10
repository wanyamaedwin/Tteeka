import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import type { MerchantProfilePatch } from './merchant-profile.schema';
import type { MerchantSettingsPatch } from './merchant-settings.schema';
import {
  MERCHANT_STORE,
  type MerchantProfileRecord,
  type MerchantSettingsRecord,
  type MerchantStore,
} from './merchant.store';

export interface MerchantProfileResponse {
  readonly id: string;
  readonly displayName: string;
  readonly legalName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
}

export interface MerchantSettingsResponse {
  readonly currency: string;
  readonly timezone: string;
}

@Injectable()
export class MerchantService {
  public constructor(
    @Inject(MERCHANT_STORE) private readonly store: MerchantStore,
  ) {}

  public async getProfile(
    context: ResolvedMerchantContext,
  ): Promise<MerchantProfileResponse> {
    return this.mapProfile(
      await this.requireResult(() =>
        this.store.getProfile(context.merchant.id),
      ),
    );
  }

  public async updateProfile(
    context: ResolvedMerchantContext,
    patch: MerchantProfilePatch,
  ): Promise<MerchantProfileResponse> {
    const storePatch = {
      ...(patch.displayName === undefined
        ? {}
        : { displayName: patch.displayName }),
      ...(patch.legalName === undefined ? {} : { legalName: patch.legalName }),
      ...(patch.phone === undefined ? {} : { phoneE164: patch.phone }),
      ...(patch.email === undefined ? {} : { email: patch.email }),
    };
    return this.mapProfile(
      await this.requireResult(() =>
        this.store.updateProfile(context.merchant.id, storePatch),
      ),
    );
  }

  public async getSettings(
    context: ResolvedMerchantContext,
  ): Promise<MerchantSettingsResponse> {
    return this.mapSettings(
      await this.requireResult(() =>
        this.store.getSettings(context.merchant.id),
      ),
    );
  }

  public async updateSettings(
    context: ResolvedMerchantContext,
    patch: MerchantSettingsPatch,
  ): Promise<MerchantSettingsResponse> {
    const storePatch = {
      ...(patch.currency === undefined ? {} : { currency: patch.currency }),
      ...(patch.timezone === undefined ? {} : { timezone: patch.timezone }),
    };
    return this.mapSettings(
      await this.requireResult(() =>
        this.store.updateSettings(context.merchant.id, storePatch),
      ),
    );
  }

  private async requireResult<T>(
    operation: () => Promise<T | null>,
  ): Promise<T> {
    try {
      const result = await operation();
      if (result === null) throw new InternalServerErrorException();
      return result;
    } catch (error: unknown) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException();
    }
  }

  private mapProfile(record: MerchantProfileRecord): MerchantProfileResponse {
    return {
      id: record.id,
      displayName: record.displayName,
      legalName: record.legalName,
      phone: record.phoneE164,
      email: record.email,
    };
  }

  private mapSettings(
    record: MerchantSettingsRecord,
  ): MerchantSettingsResponse {
    return { currency: record.currency, timezone: record.timezone };
  }
}
