export type MerchantStatus = 'ACTIVE' | 'SUSPENDED'
export type MembershipStatus = 'ACTIVE' | 'DISABLED'
export type MerchantRole = 'OWNER' | 'MANAGER' | 'STAFF'

export const PERMISSIONS = [
  'MERCHANT_READ',
  'MERCHANT_UPDATE',
  'MERCHANT_PROFILE_READ',
  'MERCHANT_PROFILE_MANAGE',
  'MERCHANT_SETTINGS_READ',
  'MERCHANT_SETTINGS_MANAGE',
  // Granular staff permissions (exact F3.2 spec — manage does NOT imply read)
  'STAFF_READ',
  'STAFF_MANAGE',
  // Granular roles permissions (exact F3.3 spec — manage does NOT imply read)
  'ROLES_READ',
  'ROLES_MANAGE',
  'CATALOGUE_READ',
  'CATALOGUE_MANAGE',
  'PRICING_READ',
  'PRICING_MANAGE',
  'INVENTORY_READ',
  'INVENTORY_MANAGE',
  'CUSTOMERS_READ',
  'CUSTOMERS_MANAGE',
  'ORDERS_READ',
  'ORDERS_MANAGE',
  'PAYMENTS_READ',
  'PAYMENTS_MANAGE',
  'DELIVERIES_READ',
  'DELIVERIES_MANAGE',
] as const


export type Permission = (typeof PERMISSIONS)[number]

// ---------------------------------------------------------------------------
// Business data types — mirrors backend contract (profile PATCH, settings PATCH)
// ---------------------------------------------------------------------------

export type BusinessProfile = {
  displayName: string
  legalName: string | null
  phone: string | null
  email: string | null
}

export type BusinessSettings = {
  /** Canonical ISO 4217 three-letter currency code, e.g. 'UGX' */
  currency: string
  /** IANA timezone identifier, e.g. 'Africa/Kampala' */
  timezone: string
}

export type MerchantWorkspace = {
  id: string
  name: string
  location: string
  status: MerchantStatus
  membershipStatus: MembershipStatus
  role: MerchantRole
  permissions: readonly Permission[]
  profile: BusinessProfile
  settings: BusinessSettings
}

export const roleLabels: Record<MerchantRole, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
}

// ---------------------------------------------------------------------------
// Currency reference list — used by settings form selector
// ---------------------------------------------------------------------------

export type CurrencyOption = { code: string; label: string }

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'UGX', label: 'UGX — Ugandan Shilling' },
  { code: 'KES', label: 'KES — Kenyan Shilling' },
  { code: 'TZS', label: 'TZS — Tanzanian Shilling' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'EUR', label: 'EUR — Euro' },
]

// ---------------------------------------------------------------------------
// Timezone reference list — IANA identifiers
// ---------------------------------------------------------------------------

export type TimezoneOption = { id: string; label: string }

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { id: 'Africa/Kampala',   label: 'Africa/Kampala (EAT, UTC+3)' },
  { id: 'Africa/Nairobi',   label: 'Africa/Nairobi (EAT, UTC+3)' },
  { id: 'Africa/Dar_es_Salaam', label: 'Africa/Dar es Salaam (EAT, UTC+3)' },
  { id: 'Africa/Lagos',     label: 'Africa/Lagos (WAT, UTC+1)' },
  { id: 'Africa/Accra',     label: 'Africa/Accra (GMT, UTC+0)' },
  { id: 'Europe/London',    label: 'Europe/London (GMT/BST)' },
  { id: 'Europe/Paris',     label: 'Europe/Paris (CET, UTC+1)' },
  { id: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  { id: 'America/Los_Angeles', label: 'America/Los Angeles (PST/PDT)' },
  { id: 'Asia/Kolkata',     label: 'Asia/Kolkata (IST, UTC+5:30)' },
  { id: 'UTC',              label: 'UTC (Coordinated Universal Time)' },
]

// ---------------------------------------------------------------------------
// Mock workspaces
// ---------------------------------------------------------------------------

export const mockWorkspaces: MerchantWorkspace[] = [
  // ─── Dstyle Hub — full Owner access ────────────────────────────────────
  {
    id: 'dstyle',
    name: 'Dstyle Hub',
    location: 'Kampala, Uganda',
    status: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    role: 'OWNER',
    permissions: [
      'MERCHANT_READ', 'MERCHANT_UPDATE',
      'MERCHANT_PROFILE_READ', 'MERCHANT_PROFILE_MANAGE',
      'MERCHANT_SETTINGS_READ', 'MERCHANT_SETTINGS_MANAGE',
      'STAFF_READ', 'STAFF_MANAGE',
      'ROLES_READ', 'ROLES_MANAGE',
      'CATALOGUE_READ', 'CATALOGUE_MANAGE',
      'PRICING_READ', 'PRICING_MANAGE',
      'INVENTORY_READ', 'INVENTORY_MANAGE',
      'CUSTOMERS_READ', 'CUSTOMERS_MANAGE',
      'ORDERS_READ', 'ORDERS_MANAGE', 'PAYMENTS_READ', 'PAYMENTS_MANAGE', 'DELIVERIES_READ', 'DELIVERIES_MANAGE',
    ],
    profile: {
      displayName: 'Dstyle Hub',
      legalName: 'Dstyle Hub Uganda Ltd',
      phone: '+256 772 123 456',
      email: 'hello@dstylehub.ug',
    },
    settings: {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    },
  },

  // ─── Urban Steps — Manager with read-only profile/settings ─────────────
  {
    id: 'urban',
    name: 'Urban Steps',
    location: 'Nairobi, Kenya',
    status: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    role: 'MANAGER',
    permissions: [
      'MERCHANT_READ',
      'MERCHANT_PROFILE_READ',
      'MERCHANT_SETTINGS_READ',
      'STAFF_READ', 'STAFF_MANAGE',
      'CATALOGUE_READ', 'CATALOGUE_MANAGE',
      'PRICING_READ',
      'INVENTORY_READ', 'INVENTORY_MANAGE',
      'CUSTOMERS_READ',
    ],
    profile: {
      displayName: 'Urban Steps',
      legalName: 'Urban Steps Kenya Ltd',
      phone: '+254 700 987 654',
      email: 'ops@urbansteps.ke',
    },
    settings: {
      currency: 'KES',
      timezone: 'Africa/Nairobi',
    },
  },

  // ─── Classic Wear — Suspended merchant, read-only profile, no settings ──
  {
    id: 'classic',
    name: 'Classic Wear',
    location: 'Dar es Salaam, Tanzania',
    status: 'SUSPENDED',
    membershipStatus: 'ACTIVE',
    role: 'OWNER',
    permissions: [
      'MERCHANT_READ',
      'MERCHANT_PROFILE_READ',
      'CATALOGUE_READ',
      'PRICING_READ',
      'INVENTORY_READ',
      'CUSTOMERS_READ',
    ],
    profile: {
      displayName: 'Classic Wear',
      legalName: null,
      phone: '+255 754 000 111',
      email: null,
    },
    settings: {
      currency: 'TZS',
      timezone: 'Africa/Dar_es_Salaam',
    },
  },

  // ─── Disabled membership ────────────────────────────────────────────────
  {
    id: 'customers-read-only',
    name: 'Dstyle Hub — Customers read only',
    location: 'Kampala, Uganda',
    status: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'STAFF',
    permissions: ['CUSTOMERS_READ'],
    profile: { displayName: 'Dstyle Hub', legalName: null, phone: '+256 772 123 456', email: null },
    settings: { currency: 'UGX', timezone: 'Africa/Kampala' },
  },
  {
    id: 'orders-read-only', name: 'Dstyle Hub — Orders read only', location: 'Kampala, Uganda', status: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'STAFF',
    permissions: ['ORDERS_READ'], profile: { displayName: 'Dstyle Hub', legalName: null, phone: '+256 772 123 456', email: null }, settings: { currency: 'UGX', timezone: 'Africa/Kampala' },
  },
  {
    id: 'orders-manage-only', name: 'Dstyle Hub — Orders manage only', location: 'Kampala, Uganda', status: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'STAFF',
    permissions: ['ORDERS_MANAGE'], profile: { displayName: 'Dstyle Hub', legalName: null, phone: '+256 772 123 456', email: null }, settings: { currency: 'UGX', timezone: 'Africa/Kampala' },
  },
  {
    id: 'orders-full-no-selectors', name: 'Dstyle Hub — Orders without selectors', location: 'Kampala, Uganda', status: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'STAFF',
    permissions: ['ORDERS_READ','ORDERS_MANAGE'], profile: { displayName: 'Dstyle Hub', legalName: null, phone: '+256 772 123 456', email: null }, settings: { currency: 'UGX', timezone: 'Africa/Kampala' },
  },
  {
    id: 'customers-manage-only',
    name: 'Dstyle Hub — Customers manage only',
    location: 'Kampala, Uganda',
    status: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'STAFF',
    permissions: ['CUSTOMERS_MANAGE'],
    profile: { displayName: 'Dstyle Hub', legalName: null, phone: '+256 772 123 456', email: null },
    settings: { currency: 'UGX', timezone: 'Africa/Kampala' },
  },
  {
    id: 'payments-read-only', name: 'Dstyle Hub - Payments read only', location: 'Kampala, Uganda', status: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'STAFF',
    permissions: ['ORDERS_READ','PAYMENTS_READ'], profile: { displayName: 'Dstyle Hub', legalName: null, phone: '+256 772 123 456', email: null }, settings: { currency: 'UGX', timezone: 'Africa/Kampala' },
  },
  {
    id: 'payments-manage-only', name: 'Dstyle Hub - Payments manage only', location: 'Kampala, Uganda', status: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'STAFF',
    permissions: ['PAYMENTS_MANAGE'], profile: { displayName: 'Dstyle Hub', legalName: null, phone: '+256 772 123 456', email: null }, settings: { currency: 'UGX', timezone: 'Africa/Kampala' },
  },
  {id:'deliveries-read-only',name:'Dstyle Hub - Deliveries read only',location:'Kampala, Uganda',status:'ACTIVE',membershipStatus:'ACTIVE',role:'STAFF',permissions:['DELIVERIES_READ'],profile:{displayName:'Dstyle Hub',legalName:null,phone:'+256 772 123 456',email:null},settings:{currency:'UGX',timezone:'Africa/Kampala'}},
  {id:'deliveries-manage-only',name:'Dstyle Hub - Deliveries manage only',location:'Kampala, Uganda',status:'ACTIVE',membershipStatus:'ACTIVE',role:'STAFF',permissions:['DELIVERIES_MANAGE'],profile:{displayName:'Dstyle Hub',legalName:null,phone:'+256 772 123 456',email:null},settings:{currency:'UGX',timezone:'Africa/Kampala'}},
  {id:'deliveries-full-no-orders',name:'Dstyle Hub - Deliveries without Orders',location:'Kampala, Uganda',status:'ACTIVE',membershipStatus:'ACTIVE',role:'STAFF',permissions:['DELIVERIES_READ','DELIVERIES_MANAGE'],profile:{displayName:'Dstyle Hub',legalName:null,phone:'+256 772 123 456',email:null},settings:{currency:'UGX',timezone:'Africa/Kampala'}},
  {
    id: 'disabled',
    name: 'Dstyle Hub — Disabled access',
    location: 'Kampala, Uganda',
    status: 'ACTIVE',
    membershipStatus: 'DISABLED',
    role: 'STAFF',
    permissions: [],
    profile: {
      displayName: 'Dstyle Hub',
      legalName: 'Dstyle Hub Uganda Ltd',
      phone: '+256 772 123 456',
      email: 'hello@dstylehub.ug',
    },
    settings: {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    },
  },

  // ─── Manage-only test persona — profile.manage WITHOUT profile.read ─────
  // Also settings.manage WITHOUT settings.read.
  // Used to verify the PATCH-style blank form edge case.
  {
    id: 'manage-only',
    name: 'Dstyle Hub — Manage only',
    location: 'Kampala, Uganda',
    status: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    role: 'STAFF',
    permissions: [
      'MERCHANT_PROFILE_MANAGE',
      'MERCHANT_SETTINGS_MANAGE',
    ],
    profile: {
      displayName: 'Dstyle Hub',
      legalName: 'Dstyle Hub Uganda Ltd',
      phone: '+256 772 123 456',
      email: 'hello@dstylehub.ug',
    },
    settings: {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    },
  },

  // ─── Staff read-only test persona — STAFF_READ without STAFF_MANAGE ──────
  {
    id: 'staff-read-only',
    name: 'Dstyle Hub — Staff read only',
    location: 'Kampala, Uganda',
    status: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    role: 'STAFF',
    permissions: [
      'MERCHANT_PROFILE_READ',
      'MERCHANT_SETTINGS_READ',
      'STAFF_READ',
      'CATALOGUE_READ',
      'INVENTORY_READ',
    ],
    profile: {
      displayName: 'Dstyle Hub',
      legalName: 'Dstyle Hub Uganda Ltd',
      phone: '+256 772 123 456',
      email: 'hello@dstylehub.ug',
    },
    settings: {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    },
  },

  // ─── Staff manage-only — STAFF_MANAGE without STAFF_READ ─────────────────
  {
    id: 'staff-manage-only',
    name: 'Dstyle Hub — Staff manage only',
    location: 'Kampala, Uganda',
    status: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    role: 'STAFF',
    permissions: [
      'STAFF_MANAGE',
    ],
    profile: {
      displayName: 'Dstyle Hub',
      legalName: 'Dstyle Hub Uganda Ltd',
      phone: '+256 772 123 456',
      email: 'hello@dstylehub.ug',
    },
    settings: {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    },
  },

  // ─── Roles read-only — ROLES_READ without ROLES_MANAGE ───────────────────
  {
    id: 'roles-read-only',
    name: 'Dstyle Hub — Roles read only',
    location: 'Kampala, Uganda',
    status: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    role: 'STAFF',
    permissions: [
      'MERCHANT_PROFILE_READ',
      'MERCHANT_SETTINGS_READ',
      'STAFF_READ',
      'ROLES_READ',
      'CATALOGUE_READ',
      'INVENTORY_READ',
    ],
    profile: {
      displayName: 'Dstyle Hub',
      legalName: 'Dstyle Hub Uganda Ltd',
      phone: '+256 772 123 456',
      email: 'hello@dstylehub.ug',
    },
    settings: {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    },
  },

  // ─── Roles manage-only — ROLES_MANAGE without ROLES_READ ─────────────────
  {
    id: 'roles-manage-only',
    name: 'Dstyle Hub — Roles manage only',
    location: 'Kampala, Uganda',
    status: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    role: 'STAFF',
    permissions: [
      'ROLES_MANAGE',
    ],
    profile: {
      displayName: 'Dstyle Hub',
      legalName: 'Dstyle Hub Uganda Ltd',
      phone: '+256 772 123 456',
      email: 'hello@dstylehub.ug',
    },
    settings: {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    },
  },

  // ─── Catalogue manage-only — CATALOGUE_MANAGE without CATALOGUE_READ ──────
  {
    id: 'catalogue-manage-only',
    name: 'Dstyle Hub — Catalogue manage only',
    location: 'Kampala, Uganda',
    status: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    role: 'STAFF',
    permissions: [
      'CATALOGUE_MANAGE',
    ],
    profile: {
      displayName: 'Dstyle Hub',
      legalName: 'Dstyle Hub Uganda Ltd',
      phone: '+256 772 123 456',
      email: 'hello@dstylehub.ug',
    },
    settings: {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    },
  },

  // ─── Catalogue price-manage-only — PRICING_MANAGE without read/manage ─────
  {
    id: 'catalogue-price-only',
    name: 'Dstyle Hub — Price manage only',
    location: 'Kampala, Uganda',
    status: 'ACTIVE',
    membershipStatus: 'ACTIVE',
    role: 'STAFF',
    permissions: [
      'PRICING_MANAGE',
    ],
    profile: {
      displayName: 'Dstyle Hub',
      legalName: 'Dstyle Hub Uganda Ltd',
      phone: '+256 772 123 456',
      email: 'hello@dstylehub.ug',
    },
    settings: {
      currency: 'UGX',
      timezone: 'Africa/Kampala',
    },
  },
]



export function canRead(permission: Permission, permissions: readonly Permission[]) {
  return permissions.includes(permission)
}

export function canManage(managePermission: Permission, readPermission: Permission, permissions: readonly Permission[]) {
  return permissions.includes(managePermission) || permissions.includes(readPermission)
}

export function getMockWorkspace(id?: string) {
  return mockWorkspaces.find((workspace) => workspace.id === id) ?? mockWorkspaces[0]
}
