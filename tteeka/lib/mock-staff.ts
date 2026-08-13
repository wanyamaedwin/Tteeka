// ---------------------------------------------------------------------------
// lib/mock-staff.ts
//
// Centralized F3.2 / F3.3 shared preview data.
//
// Architecture:
//   • RolePreview       — full Role record including permissionKeys (F3.3)
//   • StaffMemberPreview— MerchantMembership + User info, per Merchant
//   • MOCK_GLOBAL_USERS — the global Tteeka User directory (separate from Memberships)
//   • MOCK_MERCHANT_ROLES_FIXTURE — per-Merchant initial role data (read by provider)
//   • MOCK_MERCHANT_STAFF — per-Merchant initial staff fixture data
//
// The MerchantWorkspaceProvider owns ALL mutable session state.
// F3.2 Staff and F3.3 Roles share the same Role state through the provider,
// ensuring consistency (rename/disable reflects in both UIs).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MembershipStatus = 'ACTIVE' | 'DISABLED'
export type RoleStatus = 'ACTIVE' | 'DISABLED'

/**
 * Full Role preview record — consumed by both F3.2 (staff assignment) and
 * F3.3 (role management).
 *
 * permissionKeys contains the exact backend permission keys assigned to this
 * Role. The Permission catalog lives in lib/permissions.ts.
 */
export type RolePreview = {
  id: string
  merchantId: string
  name: string
  description?: string
  status: RoleStatus
  /** Exact backend permission keys granted to this Role */
  permissionKeys: string[]
  createdAt?: string
  updatedAt?: string
}

/** @deprecated Use RolePreview instead — kept for any leftover F3.2 references */
export type MockRoleRecord = {
  id: string
  name: string
  description?: string
  status: RoleStatus
}

export type StaffMemberPreview = {
  membershipId: string
  /** Global User ID — does not grant Merchant-level privileges by itself */
  userId: string
  name?: string
  phone: string
  email?: string
  membershipStatus: MembershipStatus
  /** IDs of assigned RolePreview records */
  roleIds: string[]
}

// ---------------------------------------------------------------------------
// Global Tteeka User directory — separate from Merchant Memberships
//
// Used by Add Staff mock lookup.
// The Merchant does NOT own these User records.
// ---------------------------------------------------------------------------

export type MockGlobalUser = {
  userId: string
  name?: string
  phone: string
  /** Canonical normalized form — used for matching */
  phoneNormalized: string
  email?: string
  /** Only ACTIVE users can be added to a Merchant */
  globalStatus: 'ACTIVE' | 'DISABLED'
}

/** Normalize a phone string for lookup (strip spaces, dashes, parens) */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '')
}

export const MOCK_GLOBAL_USERS: MockGlobalUser[] = [
  // ─── Already staff on Dstyle Hub (Sarah, Brian, Amina, Kenneth) ──────────
  { userId: 'u-sarah',   name: 'Sarah Namusoke',    phone: '+256 772 410 225', phoneNormalized: '+256772410225', email: 'sarah@dstylehub.ug',   globalStatus: 'ACTIVE' },
  { userId: 'u-brian',   name: 'Brian Kato',         phone: '+256 701 544 912', phoneNormalized: '+256701544912',                                  globalStatus: 'ACTIVE' },
  { userId: 'u-amina',   name: 'Amina Nakato',       phone: '+256 758 293 441', phoneNormalized: '+256758293441',                                  globalStatus: 'ACTIVE' },
  { userId: 'u-kenneth', name: 'Kenneth Ssebugwawo', phone: '+256 700 123 009', phoneNormalized: '+256700123009', email: 'k.sseb@dstylehub.ug',  globalStatus: 'ACTIVE' },
  // ─── Available to add ────────────────────────────────────────────────────
  { userId: 'u-grace',   name: 'Grace Atim',         phone: '+256 785 114 650', phoneNormalized: '+256785114650', email: 'grace.atim@gmail.com', globalStatus: 'ACTIVE' },
  { userId: 'u-joel',    name: 'Joel Musoke',         phone: '+256 704 808 211', phoneNormalized: '+256704808211',                                  globalStatus: 'ACTIVE' },
  // ─── Disabled global user (same generic error as unknown) ────────────────
  { userId: 'u-peter',   name: 'Peter Mugisha',       phone: '+256 752 619 844', phoneNormalized: '+256752619844',                                  globalStatus: 'DISABLED' },
]

// ---------------------------------------------------------------------------
// Per-Merchant initial Role fixtures
//
// These are the starting point. The MerchantWorkspaceProvider copies them
// into mutable session state on first access, so F3.3 CRUD operations
// (create/edit/disable/reactivate/manage permissions) update the same
// state that F3.2 reads for staff role badges.
//
// permissionKeys use the exact 13 canonical keys from lib/permissions.ts.
// ---------------------------------------------------------------------------

export const MOCK_MERCHANT_ROLES_FIXTURE: Record<string, RolePreview[]> = {
  dstyle: [
    {
      id: 'role-cat-mgr',
      merchantId: 'dstyle',
      name: 'Catalogue Manager',
      description: 'Manage product catalogue and variants',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read', 'catalogue.manage', 'catalogue.price.manage'],
      createdAt: '2025-01-10T09:00:00Z',
    },
    {
      id: 'role-stock',
      merchantId: 'dstyle',
      name: 'Stock Controller',
      description: 'Manage inventory levels and adjustments',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read', 'inventory.read', 'inventory.manage'],
      createdAt: '2025-01-10T09:05:00Z',
    },
    {
      id: 'role-viewer',
      merchantId: 'dstyle',
      name: 'Viewer',
      description: 'Read-only access to workspace data',
      status: 'ACTIVE',
      permissionKeys: [
        'merchant.profile.read',
        'merchant.settings.read',
        'catalogue.read',
        'inventory.read',
      ],
      createdAt: '2025-01-10T09:10:00Z',
    },
    {
      id: 'role-sales',
      merchantId: 'dstyle',
      name: 'Sales Associate',
      description: 'Process orders and update customer records',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read', 'inventory.read'],
      createdAt: '2025-01-10T09:15:00Z',
    },
    {
      id: 'role-disabled',
      merchantId: 'dstyle',
      name: 'Legacy Access',
      description: 'Retired access tier — no longer assignable',
      status: 'DISABLED',
      // Retains historical permission links even while disabled
      permissionKeys: ['catalogue.read', 'inventory.read', 'merchant.staff.read'],
      createdAt: '2024-06-01T08:00:00Z',
    },
  ],
  urban: [
    {
      id: 'role-u-ops',
      merchantId: 'urban',
      name: 'Operations',
      description: 'Day-to-day store operations',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read', 'catalogue.manage', 'inventory.read', 'inventory.manage'],
      createdAt: '2025-02-01T10:00:00Z',
    },
    {
      id: 'role-u-cat',
      merchantId: 'urban',
      name: 'Catalogue Editor',
      description: 'Edit products and pricing',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read', 'catalogue.manage', 'catalogue.price.manage'],
      createdAt: '2025-02-01T10:05:00Z',
    },
    {
      id: 'role-u-viewer',
      merchantId: 'urban',
      name: 'Viewer',
      description: 'Read-only workspace access',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read', 'inventory.read'],
      createdAt: '2025-02-01T10:10:00Z',
    },
  ],
  classic: [
    {
      id: 'role-c-viewer',
      merchantId: 'classic',
      name: 'Viewer',
      description: 'Read-only workspace access',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read'],
      createdAt: '2025-03-01T08:00:00Z',
    },
  ],
  disabled: [],
  'manage-only': [
    {
      id: 'role-mo-viewer',
      merchantId: 'manage-only',
      name: 'Viewer',
      description: 'Read-only access',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read', 'inventory.read'],
      createdAt: '2025-01-01T08:00:00Z',
    },
  ],
  'staff-read-only': [
    {
      id: 'role-sro-viewer',
      merchantId: 'staff-read-only',
      name: 'Viewer',
      description: 'Read-only access',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read', 'inventory.read'],
      createdAt: '2025-01-01T08:00:00Z',
    },
  ],
  'staff-manage-only': [
    {
      id: 'role-smo-viewer',
      merchantId: 'staff-manage-only',
      name: 'Viewer',
      description: 'Read-only access',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read', 'inventory.read'],
      createdAt: '2025-01-01T08:00:00Z',
    },
  ],
  'roles-read-only': [
    {
      id: 'role-rro-viewer',
      merchantId: 'roles-read-only',
      name: 'Viewer',
      description: 'Read-only access',
      status: 'ACTIVE',
      permissionKeys: ['catalogue.read'],
      createdAt: '2025-01-01T08:00:00Z',
    },
  ],
  'roles-manage-only': [],
}

// ---------------------------------------------------------------------------
// Per-Merchant initial staff fixture data
// ---------------------------------------------------------------------------

export const MOCK_MERCHANT_STAFF: Record<string, StaffMemberPreview[]> = {
  dstyle: [
    {
      membershipId: 'mem-sarah',
      userId: 'u-sarah',
      name: 'Sarah Namusoke',
      phone: '+256 772 410 225',
      email: 'sarah@dstylehub.ug',
      membershipStatus: 'ACTIVE',
      roleIds: ['role-cat-mgr'],
    },
    {
      membershipId: 'mem-brian',
      userId: 'u-brian',
      name: 'Brian Kato',
      phone: '+256 701 544 912',
      membershipStatus: 'ACTIVE',
      roleIds: ['role-stock'],
    },
    {
      membershipId: 'mem-amina',
      userId: 'u-amina',
      name: 'Amina Nakato',
      phone: '+256 758 293 441',
      membershipStatus: 'DISABLED',
      // Retains role while disabled; role-disabled is a historical assignment
      roleIds: ['role-viewer', 'role-disabled'],
    },
    {
      membershipId: 'mem-kenneth',
      userId: 'u-kenneth',
      name: 'Kenneth Ssebugwawo',
      phone: '+256 700 123 009',
      email: 'k.sseb@dstylehub.ug',
      membershipStatus: 'ACTIVE',
      roleIds: [], // zero-role state
    },
  ],
  urban: [
    {
      membershipId: 'mem-u-alice',
      userId: 'u-grace',
      name: 'Alice Njoroge',
      phone: '+254 722 100 200',
      email: 'alice@urbansteps.ke',
      membershipStatus: 'ACTIVE',
      roleIds: ['role-u-ops'],
    },
    {
      membershipId: 'mem-u-david',
      userId: 'u-joel',
      name: 'David Kimani',
      phone: '+254 733 400 500',
      membershipStatus: 'ACTIVE',
      roleIds: ['role-u-cat', 'role-u-viewer'],
    },
  ],
  classic: [
    {
      membershipId: 'mem-c-rose',
      userId: 'u-peter',
      name: 'Rose Mwangi',
      phone: '+255 754 111 222',
      membershipStatus: 'DISABLED',
      roleIds: ['role-c-viewer'],
    },
  ],
  disabled: [],
  'manage-only': [],
  'staff-read-only': [],
  'staff-manage-only': [],
  'roles-read-only': [],
  'roles-manage-only': [],
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Returns the global user matching a normalized phone, or undefined. */
export function findGlobalUserByPhone(raw: string): MockGlobalUser | undefined {
  const normalized = normalizePhone(raw)
  return MOCK_GLOBAL_USERS.find(
    (u) =>
      u.phoneNormalized === normalized ||
      normalizePhone(u.phone) === normalized,
  )
}

/**
 * Returns roles for a workspace from the fixture (ACTIVE and DISABLED).
 * The provider copies this into mutable session state — use staffRoles/rolesList
 * from useMerchantWorkspace() at runtime instead of calling this directly.
 */
export function getRolesForWorkspace(workspaceId: string): RolePreview[] {
  return MOCK_MERCHANT_ROLES_FIXTURE[workspaceId] ?? []
}

/** Generate a simple unique membership ID. */
export function generateMembershipId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Generate a simple unique role ID. */
export function generateRoleId(): string {
  return `role-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
