import type { BusinessProfile, BusinessSettings } from '@/lib/workspaces'
import { apiRequest } from './client'
import { endpoints } from './endpoints'

export interface MerchantProfileResponse extends BusinessProfile {
  id: string
}

export type MerchantProfilePatch = Partial<BusinessProfile>
export type MerchantSettingsResponse = BusinessSettings
export type MerchantSettingsPatch = Partial<BusinessSettings>

export function getMerchantProfile(merchantId: string) {
  return apiRequest<MerchantProfileResponse>(endpoints.merchant.profile(merchantId), {
    requestContext: 'merchant.profile.get',
  })
}

export function updateMerchantProfile(
  merchantId: string,
  patch: MerchantProfilePatch,
) {
  return apiRequest<MerchantProfileResponse>(endpoints.merchant.profile(merchantId), {
    method: 'PATCH',
    body: patch,
    requestContext: 'merchant.profile.patch',
  })
}

export function getMerchantSettings(merchantId: string) {
  return apiRequest<MerchantSettingsResponse>(endpoints.merchant.settings(merchantId), {
    requestContext: 'merchant.settings.get',
  })
}

export function updateMerchantSettings(
  merchantId: string,
  patch: MerchantSettingsPatch,
) {
  return apiRequest<MerchantSettingsResponse>(endpoints.merchant.settings(merchantId), {
    method: 'PATCH',
    body: patch,
    requestContext: 'merchant.settings.patch',
  })
}
