export const MERCHANT_STORE = Symbol('MERCHANT_STORE');

export interface MerchantProfileRecord {
  readonly id: string;
  readonly displayName: string;
  readonly legalName: string | null;
  readonly phoneE164: string | null;
  readonly email: string | null;
}

export interface MerchantSettingsRecord {
  readonly currency: string;
  readonly timezone: string;
}

export interface MerchantProfileStorePatch {
  readonly displayName?: string;
  readonly legalName?: string | null;
  readonly phoneE164?: string | null;
  readonly email?: string | null;
}

export interface MerchantSettingsStorePatch {
  readonly currency?: string;
  readonly timezone?: string;
}

export interface MerchantStore {
  getProfile(merchantId: string): Promise<MerchantProfileRecord | null>;
  updateProfile(
    merchantId: string,
    patch: MerchantProfileStorePatch,
  ): Promise<MerchantProfileRecord>;
  getSettings(merchantId: string): Promise<MerchantSettingsRecord | null>;
  updateSettings(
    merchantId: string,
    patch: MerchantSettingsStorePatch,
  ): Promise<MerchantSettingsRecord>;
}
