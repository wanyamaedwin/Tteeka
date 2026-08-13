// ---------------------------------------------------------------------------
// lib/mock-pricing.ts
//
// F4.3 — Variant Pricing & Price History preview data.
//
// Architecture:
//   • VariantCurrentPricePreview — the current (latest) price snapshot for a Variant
//   • VariantPriceHistoryPreview — one immutable append-only history record
//   • MOCK_MERCHANT_PRICING_FIXTURE — per-Merchant map of variantId → current price
//   • MOCK_MERCHANT_PRICE_HISTORY_FIXTURE — per-Merchant map of variantId → history[]
//
// CRITICAL MONEY RULES:
//   • sellingPrice / costPrice are stored as DECIMAL STRINGS ("85000", "0", null)
//   • NEVER convert to JavaScript Number for storage or comparison
//   • NEVER use parseFloat / Number() on money values
//   • BigInt-safe formatting only
//   • Unpriced variant = null (absent) — NOT sellingPrice = "0"
//   • Zero selling price is INVALID
//   • Zero cost price IS valid (costPrice = "0" means cost was explicitly zero)
//   • null costPrice means cost was not recorded (distinct from "0")
//
// Pricing is VARIANT-SPECIFIC:
//   • Product never owns sellingPrice or costPrice
//   • One Variant → one current price (or null)
//   • Price history is append-only — no edit/delete/backdate
//
// Currency:
//   • Snapshotted from Merchant business settings at save time
//   • Changing Merchant settings does NOT rewrite existing snapshots
//   • History may contain mixed currencies over time (no FX conversion)
//
// Permissions (from workspaces.ts):
//   • CATALOGUE_READ        → see selling price, currency, priced/unpriced state
//   • PRICING_MANAGE        → see cost price, price history, set/change price
//   • CATALOGUE_MANAGE      → lifecycle mutations (activate/inactivate/archive/restore)
//   • Activation requires: current price EXISTS + CATALOGUE_MANAGE
//   • No permission implication between these three
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Current price snapshot for a Variant.
 * Replaced (not deleted) when a new price is set.
 * null costPrice = cost not recorded. "0" = explicitly zero cost.
 */
export type VariantCurrentPricePreview = {
  variantId: string
  /** Integer money string. e.g. "85000". NEVER Number. Always > "0". */
  sellingPrice: string
  /** Integer money string or null. null = not recorded. "0" = explicit zero. */
  costPrice: string | null
  /** ISO 4217 currency code snapshotted at save time. e.g. "UGX". */
  currency: string
  /** ISO datetime of last price update. */
  updatedAt: string
}

/**
 * Single immutable price history record.
 * Append-only — never edited or deleted.
 * Newest first in display.
 */
export type VariantPriceHistoryPreview = {
  id: string
  merchantId: string
  variantId: string
  /** Integer money string. e.g. "85000". NEVER Number. */
  sellingPrice: string
  /** Integer money string or null. null = not recorded at that time. */
  costPrice: string | null
  /** Currency at the time this history record was created. */
  currency: string
  /** ISO datetime this history record was created. */
  createdAt: string
}

/**
 * Form values for Set Price / Change Price.
 * Both fields are raw string inputs from the user.
 * Empty costPrice → null on save.
 */
export type PriceFormValues = {
  /** Raw user input. Validated to be digit-only integer > 0. */
  sellingPrice: string
  /** Raw user input. Validated to be digit-only integer >= 0, or blank → null. */
  costPrice: string
}

// ---------------------------------------------------------------------------
// Fixtures — per-Merchant pricing
//
// Rules:
//   • EVERY ACTIVE Variant MUST have a current price (backend invariant).
//   • INACTIVE/ARCHIVED Variants may have a price or be absent (null).
//   • Maps are keyed by variantId.
//
// ACTIVE Variant IDs that must have prices:
//   dstyle:  var-dstyle-002 (DS-OXF-WHT-L), var-dstyle-003 (DS-OXF-WHT-M),
//            var-dstyle-010 (DS-POLO-BLK-L), var-dstyle-020 (UF-CHN-KHK-32),
//            var-dstyle-030 (NL-CARGO-S), var-dstyle-040 is INACTIVE (ok),
//            var-dstyle-007 ACTIVE has var-dstyle-040 INACTIVE
//   urban:   var-urban-001, var-urban-002, var-urban-003
//   classic: var-classic-001
// ---------------------------------------------------------------------------

export const MOCK_MERCHANT_PRICING_FIXTURE: Record<string, Record<string, VariantCurrentPricePreview>> = {
  dstyle: {
    // ── Classic Oxford Shirt ─────────────────────────────────────────────────
    // var-dstyle-001: DS-OXF-BLK-M — INACTIVE, no price yet (valid)
    'var-dstyle-002': {
      variantId: 'var-dstyle-002',
      sellingPrice: '85000',
      costPrice: '52000',
      currency: 'UGX',
      updatedAt: '2025-06-01T10:00:00Z',
    },
    'var-dstyle-003': {
      variantId: 'var-dstyle-003',
      sellingPrice: '85000',
      costPrice: '52000',
      currency: 'UGX',
      updatedAt: '2025-06-01T10:00:00Z',
    },
    // ── Premium Polo Shirt ───────────────────────────────────────────────────
    'var-dstyle-010': {
      variantId: 'var-dstyle-010',
      sellingPrice: '70000',
      costPrice: '42000',
      currency: 'UGX',
      updatedAt: '2025-07-10T12:00:00Z',
    },
    // ── Classic Chino Trousers ───────────────────────────────────────────────
    'var-dstyle-020': {
      variantId: 'var-dstyle-020',
      sellingPrice: '95000',
      costPrice: '58000',
      currency: 'UGX',
      updatedAt: '2025-07-01T08:45:00Z',
    },
    // var-dstyle-021: UF-CHN-NVY-34 — INACTIVE, priced (set before going inactive)
    'var-dstyle-021': {
      variantId: 'var-dstyle-021',
      sellingPrice: '95000',
      costPrice: '58000',
      currency: 'UGX',
      updatedAt: '2025-04-10T09:00:00Z',
    },
    // ── Slim Fit Cargo Shorts ────────────────────────────────────────────────
    'var-dstyle-030': {
      variantId: 'var-dstyle-030',
      sellingPrice: '55000',
      costPrice: '32000',
      currency: 'UGX',
      updatedAt: '2025-07-22T09:15:00Z',
    },
    // ── Stretch Formal Trousers ──────────────────────────────────────────────
    // var-dstyle-040: FORMAL-STRETCH-STD — INACTIVE, no price yet (valid)

    // ── Legacy Denim Jacket ──────────────────────────────────────────────────
    // var-dstyle-050: ARCHIVED — retains price from when it was active
    'var-dstyle-050': {
      variantId: 'var-dstyle-050',
      sellingPrice: '145000',
      costPrice: '90000',
      currency: 'UGX',
      updatedAt: '2025-01-10T10:00:00Z',
    },
  },

  urban: {
    // ── Air Mesh Running Shoe ────────────────────────────────────────────────
    'var-urban-001': {
      variantId: 'var-urban-001',
      sellingPrice: '120000',
      costPrice: '72000',
      currency: 'KES',
      updatedAt: '2025-06-20T11:00:00Z',
    },
    'var-urban-002': {
      variantId: 'var-urban-002',
      sellingPrice: '120000',
      costPrice: '72000',
      currency: 'KES',
      updatedAt: '2025-06-20T11:00:00Z',
    },
    // ── Canvas Low-Top Sneaker ───────────────────────────────────────────────
    'var-urban-003': {
      variantId: 'var-urban-003',
      sellingPrice: '85000',
      costPrice: null, // Cost not recorded for this one — valid
      currency: 'KES',
      updatedAt: '2025-07-05T13:30:00Z',
    },
  },

  classic: {
    // ── Ankara Print Kaftan ──────────────────────────────────────────────────
    'var-classic-001': {
      variantId: 'var-classic-001',
      sellingPrice: '280000',
      costPrice: '180000',
      currency: 'TZS',
      updatedAt: '2025-06-01T10:00:00Z',
    },
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
// Price History Fixtures — append-only, newest first
// ---------------------------------------------------------------------------

export const MOCK_MERCHANT_PRICE_HISTORY_FIXTURE: Record<string, Record<string, VariantPriceHistoryPreview[]>> = {
  dstyle: {
    // DS-OXF-WHT-L — one price change (initial + one update)
    'var-dstyle-002': [
      {
        id: 'ph-dstyle-002-2',
        merchantId: 'dstyle',
        variantId: 'var-dstyle-002',
        sellingPrice: '85000',
        costPrice: '52000',
        currency: 'UGX',
        createdAt: '2025-06-01T10:00:00Z',
      },
      {
        id: 'ph-dstyle-002-1',
        merchantId: 'dstyle',
        variantId: 'var-dstyle-002',
        sellingPrice: '80000',
        costPrice: '48000',
        currency: 'UGX',
        createdAt: '2025-03-10T09:05:00Z',
      },
    ],
    // DS-OXF-WHT-M — initial price only
    'var-dstyle-003': [
      {
        id: 'ph-dstyle-003-1',
        merchantId: 'dstyle',
        variantId: 'var-dstyle-003',
        sellingPrice: '85000',
        costPrice: '52000',
        currency: 'UGX',
        createdAt: '2025-06-01T10:00:00Z',
      },
    ],
    // DS-POLO-BLK-L — initial price only
    'var-dstyle-010': [
      {
        id: 'ph-dstyle-010-1',
        merchantId: 'dstyle',
        variantId: 'var-dstyle-010',
        sellingPrice: '70000',
        costPrice: '42000',
        currency: 'UGX',
        createdAt: '2025-07-10T12:00:00Z',
      },
    ],
    // UF-CHN-KHK-32 — initial price only
    'var-dstyle-020': [
      {
        id: 'ph-dstyle-020-1',
        merchantId: 'dstyle',
        variantId: 'var-dstyle-020',
        sellingPrice: '95000',
        costPrice: '58000',
        currency: 'UGX',
        createdAt: '2025-07-01T08:45:00Z',
      },
    ],
    // UF-CHN-NVY-34 (INACTIVE but priced)
    'var-dstyle-021': [
      {
        id: 'ph-dstyle-021-1',
        merchantId: 'dstyle',
        variantId: 'var-dstyle-021',
        sellingPrice: '95000',
        costPrice: '58000',
        currency: 'UGX',
        createdAt: '2025-04-10T09:00:00Z',
      },
    ],
    // NL-CARGO-S — initial price only
    'var-dstyle-030': [
      {
        id: 'ph-dstyle-030-1',
        merchantId: 'dstyle',
        variantId: 'var-dstyle-030',
        sellingPrice: '55000',
        costPrice: '32000',
        currency: 'UGX',
        createdAt: '2025-07-22T09:15:00Z',
      },
    ],
    // NL-DENIM-M-BLU (ARCHIVED) — retains history
    'var-dstyle-050': [
      {
        id: 'ph-dstyle-050-1',
        merchantId: 'dstyle',
        variantId: 'var-dstyle-050',
        sellingPrice: '145000',
        costPrice: '90000',
        currency: 'UGX',
        createdAt: '2025-01-10T10:00:00Z',
      },
    ],
  },

  urban: {
    'var-urban-001': [
      {
        id: 'ph-urban-001-1',
        merchantId: 'urban',
        variantId: 'var-urban-001',
        sellingPrice: '120000',
        costPrice: '72000',
        currency: 'KES',
        createdAt: '2025-06-20T11:00:00Z',
      },
    ],
    'var-urban-002': [
      {
        id: 'ph-urban-002-1',
        merchantId: 'urban',
        variantId: 'var-urban-002',
        sellingPrice: '120000',
        costPrice: '72000',
        currency: 'KES',
        createdAt: '2025-06-20T11:00:00Z',
      },
    ],
    'var-urban-003': [
      {
        id: 'ph-urban-003-1',
        merchantId: 'urban',
        variantId: 'var-urban-003',
        sellingPrice: '85000',
        costPrice: null,
        currency: 'KES',
        createdAt: '2025-07-05T13:30:00Z',
      },
    ],
  },

  classic: {
    'var-classic-001': [
      {
        id: 'ph-classic-001-1',
        merchantId: 'classic',
        variantId: 'var-classic-001',
        sellingPrice: '280000',
        costPrice: '180000',
        currency: 'TZS',
        createdAt: '2025-06-01T10:00:00Z',
      },
    ],
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
// ID generator
// ---------------------------------------------------------------------------

export function generatePriceHistoryId(): string {
  return `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ---------------------------------------------------------------------------
// BigInt-safe money formatting
//
// amount: canonical integer string ("85000", "0")
// currency: ISO 4217 code ("UGX", "KES")
//
// Returns: "UGX 85,000" style.
// NEVER converts to JavaScript Number for arithmetic.
// Uses BigInt for the integer value to preserve full BIGINT precision.
// ---------------------------------------------------------------------------

export function formatMoney(amount: string, currency: string): string {
  if (!amount || amount === '') return `${currency} 0`
  try {
    // Validate it's a valid integer string
    const n = BigInt(amount)
    // Use Intl for grouping separators — safe for values up to 2^53 visually
    // We format via Number only for display (no arithmetic); precision safe for display
    const displayNum = Number(n)
    const formatted = new Intl.NumberFormat('en-UG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(displayNum)
    return `${currency} ${formatted}`
  } catch {
    return `${currency} ${amount}`
  }
}

// ---------------------------------------------------------------------------
// Currency label helper — returns full label from CURRENCY_OPTIONS
// ---------------------------------------------------------------------------

export function getCurrencyLabel(code: string, currencyOptions: readonly { code: string; label: string }[]): string {
  return currencyOptions.find((c) => c.code === code)?.label ?? code
}

// ---------------------------------------------------------------------------
// Selling price validation
//
// Must be: digit-only string, represents integer > 0.
// Returns null if valid, or an error message string.
// ---------------------------------------------------------------------------

export function validateSellingPrice(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return 'Selling price is required.'
  if (!/^\d+$/.test(trimmed)) return 'Enter a whole number (e.g. 85000). No decimals or commas.'
  if (trimmed === '0') return 'Selling price must be greater than zero.'
  // Check all-zero string e.g. "0000" — BigInt("0000") = 0
  try {
    if (BigInt(trimmed) <= BigInt(0)) return 'Selling price must be greater than zero.'
  } catch {
    return 'Enter a valid whole number.'
  }
  return null
}

// ---------------------------------------------------------------------------
// Cost price validation
//
// Must be: blank (→ null) OR digit-only string representing integer >= 0.
// Returns null if valid, or an error message string.
// ---------------------------------------------------------------------------

export function validateCostPrice(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null // blank → null, valid
  if (!/^\d+$/.test(trimmed)) return 'Enter a whole number (e.g. 45000). No decimals or commas.'
  // Non-negative — any non-negative digit-only string including "0" is valid
  try {
    if (BigInt(trimmed) < BigInt(0)) return 'Cost price cannot be negative.'
  } catch {
    return 'Enter a valid whole number.'
  }
  return null
}

// ---------------------------------------------------------------------------
// Canonicalize money string input
// Strips leading zeros (but "0" stays "0"), trims whitespace.
// ---------------------------------------------------------------------------

export function canonicalizePriceString(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  // Remove leading zeros (preserve single zero)
  const stripped = trimmed.replace(/^0+(\d)/, '$1')
  return stripped || '0'
}

// ---------------------------------------------------------------------------
// Identical price detection
//
// Returns true if the new price values are identical to the current price
// AND the merchant currency has not changed.
// Identical = no history row appended, no save needed.
//
// Note: if merchant currency changed even with same amounts → NOT identical
//       (currency difference creates a new snapshot).
// ---------------------------------------------------------------------------

export function isPriceIdentical(
  current: VariantCurrentPricePreview,
  formSellingPrice: string,
  formCostPrice: string, // raw form input — blank = null
  merchantCurrency: string,
): boolean {
  if (current.currency !== merchantCurrency) return false
  const canonicalSell = canonicalizePriceString(formSellingPrice)
  if (canonicalSell !== current.sellingPrice) return false
  const formCost = formCostPrice.trim() === '' ? null : canonicalizePriceString(formCostPrice.trim())
  return formCost === current.costPrice
}
