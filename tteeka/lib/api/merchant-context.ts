import type { MerchantRole, MerchantWorkspace, Permission } from '@/lib/workspaces'
import { apiRequest } from './client'
import { endpoints } from './endpoints'

export interface MerchantContextResponse {
  merchant: { id: string; displayName: string }
  membership: { id: string }
  roles: { id: string; name: string }[]
  permissions: string[]
}

const permissionProjection: Readonly<Record<string, Permission>> = {
  'merchant.profile.read': 'MERCHANT_PROFILE_READ',
  'merchant.profile.manage': 'MERCHANT_PROFILE_MANAGE',
  'merchant.settings.read': 'MERCHANT_SETTINGS_READ',
  'merchant.settings.manage': 'MERCHANT_SETTINGS_MANAGE',
  'merchant.staff.read': 'STAFF_READ',
  'merchant.staff.manage': 'STAFF_MANAGE',
  'merchant.roles.read': 'ROLES_READ',
  'merchant.roles.manage': 'ROLES_MANAGE',
  'catalogue.read': 'CATALOGUE_READ',
  'catalogue.manage': 'CATALOGUE_MANAGE',
  'catalogue.price.manage': 'PRICING_MANAGE',
  'inventory.read': 'INVENTORY_READ',
  'inventory.manage': 'INVENTORY_MANAGE',
  'customers.read': 'CUSTOMERS_READ',
  'customers.manage': 'CUSTOMERS_MANAGE',
  'orders.read': 'ORDERS_READ',
  'orders.manage': 'ORDERS_MANAGE',
  'payments.read': 'PAYMENTS_READ',
  'payments.manage': 'PAYMENTS_MANAGE',
  'deliveries.read': 'DELIVERIES_READ',
  'deliveries.manage': 'DELIVERIES_MANAGE',
}

function projectRole(roles: MerchantContextResponse['roles']): MerchantRole {
  const names = new Set(roles.map(({ name }) => name.toLowerCase()))
  if (names.has('owner')) return 'OWNER'
  if (names.has('manager')) return 'MANAGER'
  return 'STAFF'
}

export function projectMerchantContext(context: MerchantContextResponse): MerchantWorkspace {
  const permissions = context.permissions
    .map((permission) => permissionProjection[permission])
    .filter((permission): permission is Permission => permission !== undefined)

  return {
    id: context.merchant.id,
    name: context.merchant.displayName,
    location: '',
    status: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    role: projectRole(context.roles),
    permissions,
    profile: {
      displayName: context.merchant.displayName,
      legalName: null,
      phone: null,
      email: null,
    },
    settings: { currency: '', timezone: '' },
  }
}

export function getMerchantContext(merchantId: string) {
  return apiRequest<MerchantContextResponse>(endpoints.merchant.context(merchantId), {
    requestContext: 'merchant.context',
  })
}
