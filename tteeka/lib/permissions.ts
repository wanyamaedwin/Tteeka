// ---------------------------------------------------------------------------
// lib/permissions.ts
//
// Centralized Permission catalog for F3.3 Roles & Permissions Management.
//
// Rules:
//   • Exactly 13 ACTIVE permission keys — the current production set.
//   • No future keys. No hierarchy. No implication.
//   • Manage does NOT imply Read. Every Permission is independent.
//   • Permission keys are authoritative — friendly labels are presentation only.
//   • This file is the single source of truth for the Permission catalogue.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Canonical permission key type
// (Mirrors the backend's exact string keys)
// ---------------------------------------------------------------------------

export const PERMISSION_KEYS = [
  // Business
  'merchant.profile.read',
  'merchant.profile.manage',
  'merchant.settings.read',
  'merchant.settings.manage',
  // Team
  'merchant.staff.read',
  'merchant.staff.manage',
  'merchant.roles.read',
  'merchant.roles.manage',
  // Catalogue
  'catalogue.read',
  'catalogue.manage',
  'catalogue.price.manage',
  // Inventory
  'inventory.read',
  'inventory.manage',
  // Customers
  'customers.read',
  'customers.manage',
  'orders.read',
  'orders.manage',
  'payments.read',
  'payments.manage',
  'deliveries.read',
  'deliveries.manage',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

// ---------------------------------------------------------------------------
// Permission group definition
// ---------------------------------------------------------------------------

export type PermissionGroup = 'BUSINESS' | 'TEAM' | 'CATALOGUE' | 'INVENTORY' | 'CUSTOMERS' | 'ORDERS' | 'PAYMENTS' | 'DELIVERIES'

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  BUSINESS: 'Business',
  TEAM: 'Team',
  CATALOGUE: 'Catalogue',
  INVENTORY: 'Inventory',
  CUSTOMERS: 'Customers',
  ORDERS: 'Orders',
  PAYMENTS: 'Payments',
  DELIVERIES: 'Deliveries',
}

// ---------------------------------------------------------------------------
// Permission metadata — friendly label, description, group
// ---------------------------------------------------------------------------

export type PermissionMetadata = {
  key: PermissionKey
  label: string
  description: string
  group: PermissionGroup
}

export const PERMISSION_CATALOG: PermissionMetadata[] = [
  // ─── BUSINESS ────────────────────────────────────────────────────────────
  {
    key: 'merchant.profile.read',
    label: 'View business profile',
    description: 'See the business display name, legal name, phone, and email.',
    group: 'BUSINESS',
  },
  {
    key: 'merchant.profile.manage',
    label: 'Manage business profile',
    description: 'Update the business display name, legal name, phone, and email.',
    group: 'BUSINESS',
  },
  {
    key: 'merchant.settings.read',
    label: 'View business settings',
    description: 'See the business currency and timezone configuration.',
    group: 'BUSINESS',
  },
  {
    key: 'merchant.settings.manage',
    label: 'Manage business settings',
    description: 'Update the business currency and timezone configuration.',
    group: 'BUSINESS',
  },

  // ─── TEAM ─────────────────────────────────────────────────────────────────
  {
    key: 'merchant.staff.read',
    label: 'View staff',
    description: 'View the staff directory, membership status, and assigned roles.',
    group: 'TEAM',
  },
  {
    key: 'merchant.staff.manage',
    label: 'Manage staff',
    description: 'Add staff, disable or reactivate access, and assign roles.',
    group: 'TEAM',
  },
  {
    key: 'merchant.roles.read',
    label: 'View roles & permissions',
    description: 'View role definitions, granted permissions, and the permission catalogue.',
    group: 'TEAM',
  },
  {
    key: 'merchant.roles.manage',
    label: 'Manage roles & permissions',
    description: 'Create and edit roles, assign permissions, and manage role lifecycle.',
    group: 'TEAM',
  },

  // ─── CATALOGUE ────────────────────────────────────────────────────────────
  {
    key: 'catalogue.read',
    label: 'View catalogue',
    description: 'Browse products, variants, and pricing in the catalogue.',
    group: 'CATALOGUE',
  },
  {
    key: 'catalogue.manage',
    label: 'Manage catalogue',
    description: 'Create, edit, and archive products and variants.',
    group: 'CATALOGUE',
  },
  {
    key: 'catalogue.price.manage',
    label: 'Manage pricing',
    description: 'Set and update product and variant prices.',
    group: 'CATALOGUE',
  },

  // ─── INVENTORY ────────────────────────────────────────────────────────────
  {
    key: 'inventory.read',
    label: 'View inventory',
    description: 'See current stock levels and inventory history.',
    group: 'INVENTORY',
  },
  {
    key: 'inventory.manage',
    label: 'Manage inventory',
    description: 'Adjust stock levels and record inventory movements.',
    group: 'INVENTORY',
  },
  {
    key: 'customers.read',
    label: 'View customers',
    description: 'View customers and their delivery locations.',
    group: 'CUSTOMERS',
  },
  {
    key: 'customers.manage',
    label: 'Manage customers',
    description: 'Create and update customers and delivery locations.',
    group: 'CUSTOMERS',
  },
  { key: 'orders.read', label: 'View orders', description: 'View orders, commercial snapshots and items.', group: 'ORDERS' },
  { key: 'orders.manage', label: 'Manage orders', description: 'Create and edit draft orders and manage draft lifecycle.', group: 'ORDERS' },
  { key: 'payments.read', label: 'View payments', description: 'View Order payment transactions and summaries.', group: 'PAYMENTS' },
  { key: 'payments.manage', label: 'Manage payments', description: 'Report and manually process payment transactions.', group: 'PAYMENTS' },
  { key: 'deliveries.read', label: 'View deliveries', description: 'View Delivery Jobs and delivery Attempt history.', group: 'DELIVERIES' },
  { key: 'deliveries.manage', label: 'Manage deliveries', description: 'Create and progress Delivery Jobs and record delivery Attempts.', group: 'DELIVERIES' },
]

/** Return catalog entries for a given group in order. */
export function getPermissionsByGroup(group: PermissionGroup): PermissionMetadata[] {
  return PERMISSION_CATALOG.filter((p) => p.group === group)
}

/** All groups in display order. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  'BUSINESS',
  'TEAM',
  'CATALOGUE',
  'INVENTORY',
  'CUSTOMERS',
  'ORDERS',
  'PAYMENTS',
  'DELIVERIES',
]

/** Lookup metadata for a single key. Returns undefined if not found (deprecated/unknown). */
export function getPermissionMeta(key: string): PermissionMetadata | undefined {
  return PERMISSION_CATALOG.find((p) => p.key === key)
}
