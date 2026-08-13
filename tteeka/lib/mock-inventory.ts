// ---------------------------------------------------------------------------
// lib/mock-inventory.ts
//
// F5.1 — Inventory Availability preview data.
//
// Architecture:
//   • InventoryBalancePreview — current AVAILABLE quantity for a Variant
//   • MOCK_MERCHANT_INVENTORY_FIXTURE — per-Merchant map of variantId → balance
//   • InventoryListItemPreview — joined display record (variant + product + quantity)
//   • InventoryListFilters — search / product / status filters
//
// CRITICAL DOMAIN RULES:
//   • Quantity is a DECIMAL STRING — never JavaScript Number.
//   • Only state: AVAILABLE. Do NOT add HELD, RESERVED, etc. (F5.2+ domain).
//   • Inventory is keyed by Variant — NOT by Product.
//   • Product.stock does NOT exist. ProductVariantPreview.quantity does NOT exist.
//   • A Variant with NO balance fixture row reads as availableQuantity = "0".
//   • ALL Variants appear in the inventory directory (including zero-stock).
//   • Inventory is independent of Variant/Product lifecycle status.
//     - ARCHIVED Variant may retain nonzero inventory.
//     - Unpriced Variant may have inventory.
//     - Archiving/restoring does NOT touch quantity.
//   • No stock valuation. No price × quantity. No low-stock logic. No warehouse.
//   • No stock movements, ledger, or idempotency in F5.1.
//   • Ordering: Product name ASC → SKU ASC → Variant ID ASC.
//
// F5.2 readiness:
//   • inventoryOverrides in MerchantWorkspaceProvider holds session mutations.
//   • F5.2 will update balances via RECEIPT / ADJUSTMENT_IN / ADJUSTMENT_OUT.
//   • This file only handles F5.1 read state.
//
// F5.3 readiness:
//   • InventoryLedgerEntry will be a separate preview collection (not derived here).
// ---------------------------------------------------------------------------

import type { ProductPreview } from './mock-catalogue'
import type { ProductVariantPreview, VariantStatus } from './mock-variants'
import type { PaginationInfo } from './mock-catalogue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The only inventory state in F5.1/F5.2. */
export type InventoryState = 'AVAILABLE'

/** Authorized F5.2 movement types. */
export type InventoryMovementType = 'RECEIPT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'

/**
 * Current inventory balance for a single Variant.
 * Quantity is always a non-negative decimal string.
 * Absent from fixture = "0" (zero-balance semantics).
 * Never multiply quantity by price. Never normalize to JS Number.
 */
export type InventoryBalancePreview = {
  merchantId: string
  variantId: string
  state: InventoryState
  /** Non-negative decimal string. e.g. "0", "24", "1000000". NEVER number. */
  quantity: string
  /** ISO datetime of last balance update. */
  updatedAt?: string
}

/**
 * Represents a single appended movement record.
 * Immutable history (F5.3 readiness).
 */
export type InventoryLedgerEntryPreview = {
  id: string
  merchantId: string
  variantId: string
  movementType: InventoryMovementType
  /** Positive integer string representing the change amount. */
  quantity: string
  /** State before movement. Null for RECEIPTS and ADJUSTMENT_IN. */
  fromState: InventoryState | null
  /** State after movement. Null for ADJUSTMENT_OUT. */
  toState: InventoryState | null
  /** Balance prior to the movement. */
  balanceBefore: string
  /** Balance after the movement was applied. */
  balanceAfter: string
  /** Optional for RECEIPT. Required for ADJUSTMENT_IN/OUT. */
  note: string | null
  createdAt: string

  // Preview-internal idempotency tracking
  idempotencyKey: string
  requestHash: string
}

/**
 * Public/Redacted Ledger Entry.
 * Strictly hides idempotency keys from UI.
 */
export type InventoryLedgerEntryPublicPreview = Omit<
  InventoryLedgerEntryPreview,
  'idempotencyKey' | 'requestHash'
>

/**
 * Stock Hold state in F5.4
 */
export type StockHoldStatus = 'ACTIVE' | 'RELEASED' | 'EXPIRED'

export type StockHoldPreview = {
  id: string
  merchantId: string
  variantId: string
  status: StockHoldStatus
  quantity: string
  expiresAt: string
  createdAt: string
  releasedAt: string | null
  expiredAt: string | null

  // Preview-internal idempotency tracking
  idempotencyKey?: string
  requestHash?: string
  /** Preview-only marker; never exposed by public Inventory projections. */
  orderManaged?: boolean
}

export type StockHoldPublicPreview = Omit<StockHoldPreview, 'idempotencyKey' | 'requestHash'>

/**
 * Payload for the mock command helper.
 */
export type MockMovementRequest = {
  merchantId: string
  variantId: string
  movementType: InventoryMovementType
  /** Must be a positive integer decimal string (e.g. "10"). */
  quantity: string
  /** Trimmed note. Optional for RECEIPT, required otherwise. */
  note: string | null
  /** Required 1-128 chars. Usually crypto.randomUUID(). */
  idempotencyKey: string
}

/**
 * Result of the mock command helper.
 */
export type MockMovementResult = {
  success: boolean
  error?: string
  conflict?: boolean
  replayed?: boolean
  balance?: InventoryBalancePreview
  movement?: InventoryLedgerEntryPreview
}

/**
 * Joined display record for the Inventory list.
 * Combines Variant identity + Product name + current balance.
 * Derived at render time — never stored as domain data.
 */
export type InventoryListItemPreview = {
  variant: ProductVariantPreview
  product: ProductPreview
  /** Physical quantity in AVAILABLE state. "0" if no balance fixture. */
  physicalQuantity: string
  /** Held quantity from active holds. */
  heldQuantity: string
  /** Sellable quantity = physical - held. */
  sellableQuantity: string
  /** ISO datetime if balance fixture has updatedAt. */
  updatedAt?: string
}

/**
 * Filter state for the Inventory list.
 * Combines with AND semantics (search AND productId AND variantStatus).
 */
export type InventoryListFilters = {
  /** Case-insensitive substring: product name, SKU, barcode, size, colour. */
  search: string
  /** 'all' = no product filter. Otherwise exact product.id. */
  productId: string | 'all'
  /** 'all' = no status filter. Otherwise exact VariantStatus. */
  variantStatus: VariantStatus | 'all'
}

// ---------------------------------------------------------------------------
// Fixtures — per-Merchant inventory balances
//
// Rules:
//   • Only include Variants with EXPLICIT nonzero or notable quantities.
//   • Variants absent from this map read as AVAILABLE = "0".
//   • Do NOT include every Variant — leave some absent to demonstrate zero semantics.
//   • Negative quantities are NEVER valid.
//   • quantity "0" (explicit zero) is different from absent (derived zero).
//     For mock purposes both display as "0 available". Explicit zero may carry updatedAt.
//
// Dstyle Hub (UGX) — dstyle variants:
//   var-dstyle-001 = DS-OXF-BLK-M   (INACTIVE) — absent → "0"
//   var-dstyle-002 = DS-OXF-WHT-L   (ACTIVE)   → "9"
//   var-dstyle-003 = DS-OXF-WHT-M   (ACTIVE)   → "24"
//   var-dstyle-010 = DS-POLO-BLK-L  (ACTIVE)   → "18"
//   var-dstyle-020 = UF-CHN-KHK-32  (ACTIVE)   — absent → "0"
//   var-dstyle-021 = UF-CHN-NVY-34  (INACTIVE) — absent → "0"
//   var-dstyle-030 = NL-CARGO-S     (ACTIVE)   → "12"
//   var-dstyle-040 = FORMAL-STRETCH-STD (INACTIVE) — absent → "0"
//   var-dstyle-050 = NL-DENIM-M-BLU (ARCHIVED) → "3" (archived but nonzero)
// ---------------------------------------------------------------------------

export const MOCK_MERCHANT_INVENTORY_FIXTURE: Record<string, Record<string, InventoryBalancePreview>> = {
  dstyle: {
    // A) Physical 20, Held 0, Sellable 20
    'var-dstyle-002': {
      merchantId: 'dstyle',
      variantId: 'var-dstyle-002',
      state: 'AVAILABLE',
      quantity: '20',
      updatedAt: '2025-07-28T10:00:00Z',
    },
    // B) Physical 20, Held 6, Sellable 14
    'var-dstyle-003': {
      merchantId: 'dstyle',
      variantId: 'var-dstyle-003',
      state: 'AVAILABLE',
      quantity: '20',
      updatedAt: '2025-07-28T10:00:00Z',
    },
    // C) Physical 10, Held 10, Sellable 0
    'var-dstyle-010': {
      merchantId: 'dstyle',
      variantId: 'var-dstyle-010',
      state: 'AVAILABLE',
      quantity: '10',
      updatedAt: '2025-07-15T09:30:00Z',
    },
    // D) Physical 0, Held 0, Sellable 0
    'var-dstyle-001': {
      merchantId: 'dstyle',
      variantId: 'var-dstyle-001',
      state: 'AVAILABLE',
      quantity: '0',
      updatedAt: '2025-05-01T08:00:00Z',
    },
    // NL-CARGO-S — ACTIVE, 12 units
    'var-dstyle-030': {
      merchantId: 'dstyle',
      variantId: 'var-dstyle-030',
      state: 'AVAILABLE',
      quantity: '12',
      updatedAt: '2025-07-20T11:00:00Z',
    },
    // NL-DENIM-M-BLU — ARCHIVED, still has 3 units
    'var-dstyle-050': {
      merchantId: 'dstyle',
      variantId: 'var-dstyle-050',
      state: 'AVAILABLE',
      quantity: '3',
      updatedAt: '2025-01-20T14:00:00Z',
    },
    // UF-CHN-KHK-32, UF-CHN-NVY-34, FORMAL-STRETCH-STD intentionally absent → "0"
  },

  urban: {
    // SS-AIR-BLK-42 — ACTIVE, 30 units
    'var-urban-001': {
      merchantId: 'urban',
      variantId: 'var-urban-001',
      state: 'AVAILABLE',
      quantity: '30',
      updatedAt: '2025-07-25T10:00:00Z',
    },
    // SS-AIR-WHT-44 — ACTIVE, 15 units
    'var-urban-002': {
      merchantId: 'urban',
      variantId: 'var-urban-002',
      state: 'AVAILABLE',
      quantity: '15',
      updatedAt: '2025-07-25T10:00:00Z',
    },
    // UC-CANVAS-WHT-41 — ACTIVE, absent → "0"
  },

  classic: {
    // AK-KAFTAN-RED-M — ACTIVE, 7 units
    'var-classic-001': {
      merchantId: 'classic',
      variantId: 'var-classic-001',
      state: 'AVAILABLE',
      quantity: '7',
      updatedAt: '2025-06-10T09:00:00Z',
    },
  },

  disabled: {},
  'manage-only': {},
  'staff-read-only': {},
  'staff-manage-only': {},
  'roles-read-only': {},
  'roles-manage-only': {},
  'catalogue-manage-only': {},
}

// ---------------------------------------------------------------------------
// MOCK HOLDS FIXTURE
// ---------------------------------------------------------------------------

const fixFutureDate = new Date(Date.now() + 86400000 * 7).toISOString() // Next week
const fixPastDate = new Date(Date.now() - 86400000 * 2).toISOString()   // 2 days ago

export const MOCK_MERCHANT_HOLDS_FIXTURE: Record<string, Record<string, StockHoldPreview[]>> = {
  dstyle: {
    // A) var-dstyle-002: No active holds, but some history
    'var-dstyle-002': [
      { id: 'hold-1', merchantId: 'dstyle', variantId: 'var-dstyle-002', status: 'RELEASED', quantity: '5', expiresAt: fixFutureDate, createdAt: fixPastDate, releasedAt: fixPastDate, expiredAt: null },
      { id: 'hold-2', merchantId: 'dstyle', variantId: 'var-dstyle-002', status: 'EXPIRED', quantity: '2', expiresAt: fixPastDate, createdAt: fixPastDate, releasedAt: null, expiredAt: fixPastDate }
    ],
    // B) var-dstyle-003: Active holds summing to 6
    'var-dstyle-003': [
      { id: 'hold-3', merchantId: 'dstyle', variantId: 'var-dstyle-003', status: 'ACTIVE', quantity: '4', expiresAt: fixFutureDate, createdAt: fixPastDate, releasedAt: null, expiredAt: null },
      { id: 'hold-4', merchantId: 'dstyle', variantId: 'var-dstyle-003', status: 'ACTIVE', quantity: '2', expiresAt: fixFutureDate, createdAt: fixPastDate, releasedAt: null, expiredAt: null }
    ],
    // C) var-dstyle-010: Active holds summing to 10
    'var-dstyle-010': [
      { id: 'hold-5', merchantId: 'dstyle', variantId: 'var-dstyle-010', status: 'ACTIVE', quantity: '10', expiresAt: fixFutureDate, createdAt: fixPastDate, releasedAt: null, expiredAt: null }
    ]
  }
}

// ---------------------------------------------------------------------------
// MOCK LEDGER FIXTURES
// ---------------------------------------------------------------------------

const generateFixtureId = (suffix: string) => `imov-fix-${suffix}`

export const MOCK_MERCHANT_LEDGER_FIXTURE: Record<string, Record<string, InventoryLedgerEntryPreview[]>> = {
  dstyle: {
    'var-dstyle-002': [
      {
        id: generateFixtureId('ds002-1'), merchantId: 'dstyle', variantId: 'var-dstyle-002',
        movementType: 'RECEIPT', quantity: '9', fromState: null, toState: 'AVAILABLE',
        balanceBefore: '0', balanceAfter: '9', note: 'Opening stock', createdAt: '2025-07-28T10:00:00Z',
        idempotencyKey: 'fix-ds002', requestHash: 'fix'
      }
    ],
    'var-dstyle-003': [
      {
        id: generateFixtureId('ds003-1'), merchantId: 'dstyle', variantId: 'var-dstyle-003',
        movementType: 'RECEIPT', quantity: '24', fromState: null, toState: 'AVAILABLE',
        balanceBefore: '0', balanceAfter: '24', note: 'Opening stock', createdAt: '2025-07-28T10:00:00Z',
        idempotencyKey: 'fix-ds003', requestHash: 'fix'
      }
    ],
    'var-dstyle-010': [
      {
        id: generateFixtureId('ds010-1'), merchantId: 'dstyle', variantId: 'var-dstyle-010',
        movementType: 'RECEIPT', quantity: '18', fromState: null, toState: 'AVAILABLE',
        balanceBefore: '0', balanceAfter: '18', note: 'Opening stock', createdAt: '2025-07-15T09:30:00Z',
        idempotencyKey: 'fix-ds010', requestHash: 'fix'
      }
    ],
    'var-dstyle-030': [
      {
        id: generateFixtureId('ds030-1'), merchantId: 'dstyle', variantId: 'var-dstyle-030',
        movementType: 'RECEIPT', quantity: '12', fromState: null, toState: 'AVAILABLE',
        balanceBefore: '0', balanceAfter: '12', note: 'Opening stock', createdAt: '2025-07-20T11:00:00Z',
        idempotencyKey: 'fix-ds030', requestHash: 'fix'
      }
    ],
    'var-dstyle-050': [
      {
        id: generateFixtureId('ds050-1'), merchantId: 'dstyle', variantId: 'var-dstyle-050',
        movementType: 'RECEIPT', quantity: '3', fromState: null, toState: 'AVAILABLE',
        balanceBefore: '0', balanceAfter: '3', note: 'Opening stock', createdAt: '2025-01-20T14:00:00Z',
        idempotencyKey: 'fix-ds050', requestHash: 'fix'
      }
    ],
    'var-dstyle-001': [
      {
        id: generateFixtureId('ds001-2'), merchantId: 'dstyle', variantId: 'var-dstyle-001',
        movementType: 'ADJUSTMENT_OUT', quantity: '5', fromState: 'AVAILABLE', toState: null,
        balanceBefore: '5', balanceAfter: '0', note: 'Discarded damaged stock', createdAt: '2025-05-01T08:00:00Z',
        idempotencyKey: 'fix-ds001-out', requestHash: 'fix'
      },
      {
        id: generateFixtureId('ds001-1'), merchantId: 'dstyle', variantId: 'var-dstyle-001',
        movementType: 'RECEIPT', quantity: '5', fromState: null, toState: 'AVAILABLE',
        balanceBefore: '0', balanceAfter: '5', note: 'Initial test batch', createdAt: '2025-04-10T11:00:00Z',
        idempotencyKey: 'fix-ds001-in', requestHash: 'fix'
      }
    ]
  },
  urban: {
    'var-urban-001': [
      {
        id: generateFixtureId('urb001-1'), merchantId: 'urban', variantId: 'var-urban-001',
        movementType: 'RECEIPT', quantity: '30', fromState: null, toState: 'AVAILABLE',
        balanceBefore: '0', balanceAfter: '30', note: 'Opening stock', createdAt: '2025-07-25T10:00:00Z',
        idempotencyKey: 'fix-urb001', requestHash: 'fix'
      }
    ],
    'var-urban-002': [
      {
        id: generateFixtureId('urb002-1'), merchantId: 'urban', variantId: 'var-urban-002',
        movementType: 'RECEIPT', quantity: '15', fromState: null, toState: 'AVAILABLE',
        balanceBefore: '0', balanceAfter: '15', note: 'Opening stock', createdAt: '2025-07-25T10:00:00Z',
        idempotencyKey: 'fix-urb002', requestHash: 'fix'
      }
    ]
  },
  classic: {
    'var-classic-001': [
      {
        id: generateFixtureId('cls001-1'), merchantId: 'classic', variantId: 'var-classic-001',
        movementType: 'RECEIPT', quantity: '7', fromState: null, toState: 'AVAILABLE',
        balanceBefore: '0', balanceAfter: '7', note: 'Opening stock', createdAt: '2025-06-10T09:00:00Z',
        idempotencyKey: 'fix-cls001', requestHash: 'fix'
      }
    ]
  },
  disabled: {},
  'manage-only': {},
  'staff-read-only': {},
  'staff-manage-only': {},
  'roles-read-only': {},
  'roles-manage-only': {},
  'catalogue-manage-only': {},
  'catalogue-price-only': {},
}

// ---------------------------------------------------------------------------
// ID generator (for future F5.2 movement records)
// ---------------------------------------------------------------------------

export function generateInventoryMovementId(): string {
  return `imov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ---------------------------------------------------------------------------
// getInventoryAvailability
//
// Returns physical, held, and sellable quantities.
// Dynamically recalculates effective EXPIRED holds.
// ---------------------------------------------------------------------------

export function getVariantEffectiveHolds(
  merchantId: string,
  variantId: string,
  holdOverrides: Record<string, Record<string, StockHoldPreview[]>>,
  nowTime?: number
): StockHoldPublicPreview[] {
  const baseHolds = MOCK_MERCHANT_HOLDS_FIXTURE[merchantId]?.[variantId] || []
  const sessionHolds = holdOverrides[merchantId]?.[variantId] || []

  // Session holds with same ID override base holds
  const merged = new Map<string, StockHoldPreview>()
  for (const h of baseHolds) merged.set(h.id, h)
  for (const h of sessionHolds) merged.set(h.id, h)

  const now = nowTime ?? new Date().getTime()

  return Array.from(merged.values())
    .map(h => {
      // Effective expiry
      if (h.status === 'ACTIVE' && new Date(h.expiresAt).getTime() <= now) {
        return { ...h, status: 'EXPIRED' as StockHoldStatus, expiredAt: h.expiresAt }
      }
      return h
    })
    .map(({ idempotencyKey, requestHash, orderManaged, ...publicEntry }) => publicEntry)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getInventoryAvailability(
  merchantId: string,
  variantId: string,
  balanceMap: Record<string, InventoryBalancePreview>,
  holdOverrides: Record<string, Record<string, StockHoldPreview[]>>,
  nowTime?: number
): { physicalQuantity: string, heldQuantity: string, sellableQuantity: string } {
  const balance = balanceMap[variantId]
  let physical = '0'
  if (balance && isNonNegativeIntegerQuantity(balance.quantity)) {
    physical = balance.quantity
  }

  const holds = getVariantEffectiveHolds(merchantId, variantId, holdOverrides, nowTime)
  const activeHolds = holds.filter(h => h.status === 'ACTIVE')

  let heldN = BigInt(0)
  for (const h of activeHolds) {
    heldN += BigInt(h.quantity)
  }

  const physicalN = BigInt(physical)
  let sellableN = physicalN - heldN
  if (sellableN < BigInt(0)) sellableN = BigInt(0) // Safeguard

  return {
    physicalQuantity: physical,
    heldQuantity: heldN.toString(),
    sellableQuantity: sellableN.toString()
  }
}

// ---------------------------------------------------------------------------
// getVariantLedger
//
// Combines static fixtures and session overrides. Sorts newest-first.
// Returns the Public projection (redacting idempotency keys).
// ---------------------------------------------------------------------------

export function getVariantLedger(
  merchantId: string,
  variantId: string,
  ledgerOverrides: Record<string, Record<string, InventoryLedgerEntryPreview[]>>
): InventoryLedgerEntryPublicPreview[] {
  const baseLedger = MOCK_MERCHANT_LEDGER_FIXTURE[merchantId]?.[variantId] || []
  const sessionLedger = ledgerOverrides[merchantId]?.[variantId] || []

  // Combine
  const combined = [...sessionLedger, ...baseLedger]

  // Sort newest first: createdAt DESC, then id DESC
  combined.sort((a, b) => {
    const timeCmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    if (timeCmp !== 0) return timeCmp
    return b.id.localeCompare(a.id)
  })

  // Redact internal fields
  return combined.map((entry) => {
    const { idempotencyKey, requestHash, ...publicEntry } = entry
    return publicEntry
  })
}

// ---------------------------------------------------------------------------
// isNonNegativeIntegerQuantity
//
// Validates that a string is a non-negative integer quantity.
// Valid: "0", "1", "24", "1000000"
// Invalid: "-1", "1.5", "abc", ""
// ---------------------------------------------------------------------------

export function isNonNegativeIntegerQuantity(value: string): boolean {
  if (!value || value === '') return false
  if (!/^\d+$/.test(value)) return false
  // Reject leading zeros for multi-digit (e.g. "007") — canonical form only
  // BUT "0" itself is valid
  if (value.length > 1 && value.startsWith('0')) return false
  return true
}

// ---------------------------------------------------------------------------
// formatQuantity
//
// BigInt-safe quantity formatter.
// Adds grouping separators for large numbers.
// Input: string. Output: string. NEVER normalizes to Number for storage.
// ---------------------------------------------------------------------------

export function formatQuantity(value: string): string {
  if (!value || value === '') return '0'
  try {
    const n = BigInt(value)
    // Number used only for Intl display — no arithmetic on stored value
    return new Intl.NumberFormat('en-UG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(n))
  } catch {
    return value
  }
}

// ---------------------------------------------------------------------------
// buildInventoryList
//
// Joins variantList + productList + balanceMap into InventoryListItemPreview[].
// Includes ALL variants (zero-balance if no fixture).
// Enforces merchant isolation — only includes variants whose productId resolves
// to a product in productList (same merchant).
// ---------------------------------------------------------------------------

export function buildInventoryList(
  merchantId: string,
  variantList: ProductVariantPreview[],
  productList: ProductPreview[],
  balanceMap: Record<string, InventoryBalancePreview>,
  holdOverrides: Record<string, Record<string, StockHoldPreview[]>> = {}
): InventoryListItemPreview[] {
  const productMap = new Map(productList.map((p) => [p.id, p]))
  const items: InventoryListItemPreview[] = []

  for (const variant of variantList) {
    const product = productMap.get(variant.productId)
    if (!product) continue // Merchant isolation: orphan variant ignored safely
    const balance = balanceMap[variant.id]
    const avail = getInventoryAvailability(merchantId, variant.id, balanceMap, holdOverrides)
    items.push({
      variant,
      product,
      physicalQuantity: avail.physicalQuantity,
      heldQuantity: avail.heldQuantity,
      sellableQuantity: avail.sellableQuantity,
      updatedAt: balance?.updatedAt,
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// filterAndSortInventory
//
// Applies AND-combined filters then sorts deterministically:
//   Product name ASC → SKU ASC → Variant ID ASC
//
// Search covers: product name, SKU, barcode, size, colour (case-insensitive).
// productId filter: exact match to product.id.
// variantStatus filter: exact match to variant.status.
// ---------------------------------------------------------------------------

export function filterAndSortInventory(
  items: InventoryListItemPreview[],
  filters: InventoryListFilters,
): InventoryListItemPreview[] {
  const { search, productId, variantStatus } = filters
  const q = search.trim().toLowerCase()

  let result = items

  // Search filter — AND with other filters
  if (q) {
    result = result.filter(({ variant, product }) => {
      const fields = [
        product.name,
        variant.sku,
        variant.barcode ?? '',
        variant.size ?? '',
        variant.colour ?? '',
      ]
      return fields.some((f) => f.toLowerCase().includes(q))
    })
  }

  // Product filter
  if (productId !== 'all') {
    result = result.filter(({ variant }) => variant.productId === productId)
  }

  // Variant status filter
  if (variantStatus !== 'all') {
    result = result.filter(({ variant }) => variant.status === variantStatus)
  }

  // Deterministic sort: product name ASC → SKU ASC → variant ID ASC
  result = [...result].sort((a, b) => {
    const nameCmp = a.product.name.localeCompare(b.product.name)
    if (nameCmp !== 0) return nameCmp
    const skuCmp = a.variant.sku.localeCompare(b.variant.sku)
    if (skuCmp !== 0) return skuCmp
    return a.variant.id.localeCompare(b.variant.id)
  })

  return result
}

// ---------------------------------------------------------------------------
// paginateInventory
//
// Server-pagination shaped pagination for the inventory list.
// Clamps page to valid range safely.
// ---------------------------------------------------------------------------

export function paginateInventory(
  items: InventoryListItemPreview[],
  page: number,
  pageSize: number,
): { items: InventoryListItemPreview[]; pagination: PaginationInfo } {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  const end = Math.min(start + pageSize, total)

  return {
    items: items.slice(start, end),
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
  }
}

// ---------------------------------------------------------------------------
// F5.2 Mock Command Helper
// ---------------------------------------------------------------------------

/**
 * Generates a stable request fingerprint for idempotency conflict detection.
 */
function hashMovementRequest(req: MockMovementRequest): string {
  // Simple deterministic serialization for preview
  return `v1|${req.variantId}|${req.movementType}|${req.quantity}|${req.note || ''}`
}

/**
 * Authoritative mock state mutator.
 * Handles validation, idempotency, safe math, and produces the atomic update.
 */
export function applyMockInventoryMovement(
  req: MockMovementRequest,
  currentBalanceMap: Record<string, InventoryBalancePreview>,
  currentLedgerMap: Record<string, InventoryLedgerEntryPreview[]>,
): MockMovementResult {
  const { merchantId, variantId, movementType, quantity, note, idempotencyKey } = req

  // 1. Validate Idempotency-Key
  if (!idempotencyKey || idempotencyKey.length < 1 || idempotencyKey.length > 128) {
    return { success: false, error: 'Invalid Idempotency-Key' }
  }

  const requestHash = hashMovementRequest(req)
  const existingLedger = currentLedgerMap[variantId] || []

  // Check existing records for idempotency (merchant-scoped)
  const duplicate = existingLedger.find((entry) =>
    entry.merchantId === merchantId && entry.idempotencyKey === idempotencyKey
  )

  if (duplicate) {
    if (duplicate.requestHash === requestHash) {
      return { success: true, replayed: true, movement: duplicate } // Exact replay
    }
    return { success: false, conflict: true, error: 'Conflict: Idempotency-Key already used with different payload' }
  }

  // 2. Validate Quantity
  if (!isNonNegativeIntegerQuantity(quantity) || quantity === '0') {
    return { success: false, error: 'Quantity must be a positive integer' }
  }

  // 3. Validate Note
  if (movementType !== 'RECEIPT' && (!note || note.trim() === '')) {
    return { success: false, error: 'A note is required for adjustments' }
  }

  // 4. Safely read current balance
  // Since mock ledger in F5.2 acts on physical (AVAILABLE), we just read physical.
  let balanceBefore = '0'
  if (currentBalanceMap[variantId] && isNonNegativeIntegerQuantity(currentBalanceMap[variantId].quantity)) {
    balanceBefore = currentBalanceMap[variantId].quantity
  }

  // 5. Calculate new balance
  let balanceAfter: string
  let fromState: InventoryState | null = null
  let toState: InventoryState | null = null

  try {
    const beforeN = BigInt(balanceBefore)
    const qtyN = BigInt(quantity)

    if (movementType === 'RECEIPT') {
      fromState = null
      toState = 'AVAILABLE'
      balanceAfter = (beforeN + qtyN).toString()
    } else if (movementType === 'ADJUSTMENT_IN') {
      fromState = null
      toState = 'AVAILABLE'
      balanceAfter = (beforeN + qtyN).toString()
    } else if (movementType === 'ADJUSTMENT_OUT') {
      fromState = 'AVAILABLE'
      toState = null
      if (beforeN < qtyN) {
        return { success: false, error: 'You can\'t remove more stock than is currently available.' }
      }
      balanceAfter = (beforeN - qtyN).toString()
    } else {
      return { success: false, error: 'Unsupported movement type' }
    }
  } catch {
    return { success: false, error: 'Arithmetic error' }
  }

  // 6. Create records
  const now = new Date().toISOString()

  const newBalance: InventoryBalancePreview = {
    merchantId,
    variantId,
    state: 'AVAILABLE',
    quantity: balanceAfter,
    updatedAt: now,
  }

  const newMovement: InventoryLedgerEntryPreview = {
    id: generateInventoryMovementId(),
    merchantId,
    variantId,
    movementType,
    quantity,
    fromState,
    toState,
    balanceBefore,
    balanceAfter,
    note: note ? note.trim() : null,
    createdAt: now,
    idempotencyKey,
    requestHash,
  }

  return {
    success: true,
    balance: newBalance,
    movement: newMovement,
  }
}

// ---------------------------------------------------------------------------
// F5.4 Stock Holds Mock Commands
// ---------------------------------------------------------------------------

export type MockCreateHoldRequest = {
  merchantId: string
  variantId: string
  quantity: string
  expiresAt: string
  idempotencyKey: string
}

export type MockCreateHoldResult = {
  success: boolean
  error?: string
  conflict?: boolean
  hold?: StockHoldPreview
}

export function createMockHold(
  req: MockCreateHoldRequest,
  balanceMap: Record<string, InventoryBalancePreview>,
  holdOverrides: Record<string, Record<string, StockHoldPreview[]>>
): MockCreateHoldResult {
  const { merchantId, variantId, quantity, expiresAt, idempotencyKey } = req

  if (!idempotencyKey) return { success: false, error: 'Invalid Idempotency-Key' }
  if (!isNonNegativeIntegerQuantity(quantity) || quantity === '0') {
    return { success: false, error: 'Quantity must be a positive integer' }
  }

  // Idempotency check (unredacted internal holds)
  const baseHolds = MOCK_MERCHANT_HOLDS_FIXTURE[merchantId]?.[variantId] || []
  const sessionHolds = holdOverrides[merchantId]?.[variantId] || []
  const allRawHolds = [...sessionHolds, ...baseHolds]
  const duplicate = allRawHolds.find(h => h.idempotencyKey === idempotencyKey)
  if (duplicate) {
    return { success: true, hold: duplicate }
  }

  const avail = getInventoryAvailability(merchantId, variantId, balanceMap, holdOverrides)
  if (BigInt(avail.sellableQuantity) < BigInt(quantity)) {
    return {
      success: false,
      error: `Not enough stock available to hold. Only ${avail.sellableQuantity} units are currently available to sell.`,
    }
  }

  const hold: StockHoldPreview = {
    id: `hold-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    merchantId,
    variantId,
    status: 'ACTIVE',
    quantity,
    expiresAt,
    createdAt: new Date().toISOString(),
    releasedAt: null,
    expiredAt: null,
    idempotencyKey
  }

  return { success: true, hold }
}

export function updateMockHoldExpiry(
  merchantId: string,
  variantId: string,
  holdId: string,
  newExpiresAt: string,
  holdOverrides: Record<string, Record<string, StockHoldPreview[]>>
): MockCreateHoldResult {
  const existing = [...(MOCK_MERCHANT_HOLDS_FIXTURE[merchantId]?.[variantId] ?? []), ...(holdOverrides[merchantId]?.[variantId] ?? [])]
  const hold = existing.find(h => h.id === holdId)
  if (!hold) return { success: false, error: 'Hold not found' }
  if (hold.orderManaged) return { success: false, conflict: true, error: 'This stock hold is controlled by an order and cannot be changed here.' }
  if (hold.status !== 'ACTIVE') return { success: false, error: 'Hold is not active' }
  if (new Date(newExpiresAt).getTime() <= Date.now()) {
    return { success: false, error: 'Expiry must be in the future' }
  }

  const updated: StockHoldPreview = { ...hold, expiresAt: newExpiresAt }
  return { success: true, hold: updated }
}

export function releaseMockHold(
  merchantId: string,
  variantId: string,
  holdId: string,
  holdOverrides: Record<string, Record<string, StockHoldPreview[]>>
): MockCreateHoldResult {
  const existing = [...(MOCK_MERCHANT_HOLDS_FIXTURE[merchantId]?.[variantId] ?? []), ...(holdOverrides[merchantId]?.[variantId] ?? [])]
  const hold = existing.find(h => h.id === holdId)
  if (!hold) return { success: false, error: 'Hold not found' }
  if (hold.orderManaged) return { success: false, conflict: true, error: 'This stock hold is controlled by an order and cannot be changed here.' }
  if (hold.status !== 'ACTIVE') return { success: false, error: 'Hold is not active' }

  const updated: StockHoldPreview = {
    ...hold,
    status: 'RELEASED',
    releasedAt: new Date().toISOString()
  }
  return { success: true, hold: updated }
}
