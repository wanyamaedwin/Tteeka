// ---------------------------------------------------------------------------
// lib/mock-variants.ts
//
// Centralized F4.2 Product Variant preview data.
//
// Architecture:
//   • ProductVariantPreview — the exact sellable identity (SKU, barcode, size, colour, status)
//   • MOCK_MERCHANT_VARIANTS_FIXTURE — per-Merchant initial variant data
//
// Relationship:
//   ProductVariantPreview.productId → ProductPreview.id
//   ProductVariantPreview.merchantId — used for merchant-wide SKU/barcode uniqueness
//
// What a Variant IS (F4.2):
//   id, merchantId, productId, sku, barcode, size, colour, status, createdAt, updatedAt
//
// What a Variant is NOT yet (F4.3 / F5):
//   sellingPrice, costPrice, currency, price history,
//   stock quantity, available quantity, inventory ledger
//
// KEY RULES:
//   • SKU is REQUIRED. Trimmed and canonicalized to UPPERCASE before storage.
//   • Barcode is OPTIONAL. Treated as a STRING — leading zeros preserved. Never Number.
//   • SKU uniqueness: PER MERCHANT (across all Products, all statuses).
//   • Barcode uniqueness: PER MERCHANT (if non-null, across all Products, all statuses).
//   • New Variants start INACTIVE — activation requires a current price (F4.3).
//   • Product and Variant statuses are INDEPENDENT.
//   • No hard delete — lifecycle only: ACTIVE, INACTIVE, ARCHIVED.
//   • Restore from ARCHIVED returns to INACTIVE (not ACTIVE — price still required).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VariantStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'

export type ProductVariantPreview = {
  id: string
  merchantId: string
  productId: string
  /** Required. Canonical uppercase. Merchant-unique across all Products and statuses. */
  sku: string
  /** Optional. Preserved as string — leading zeros intact. Merchant-unique if non-null. */
  barcode: string | null
  /** Optional free-form size. No Size taxonomy. */
  size: string | null
  /** Optional free-form colour. No Colour taxonomy. */
  colour: string | null
  status: VariantStatus
  createdAt: string
  updatedAt: string
}

export type VariantFormValues = {
  sku: string
  barcode: string
  size: string
  colour: string
}

export type VariantLookupResult = {
  variant: ProductVariantPreview
  productId: string
  productName: string
} | null

// ---------------------------------------------------------------------------
// SKU canonicalization — mirrors backend behavior
// Trim outer whitespace, then convert to uppercase.
// ---------------------------------------------------------------------------

export function canonicalizeSku(raw: string): string {
  return raw.trim().toUpperCase()
}

// ---------------------------------------------------------------------------
// Barcode canonicalization — mirrors backend behavior
// Trim outer whitespace only. Case-preserved. Leading zeros preserved.
// Blank string → null.
// NEVER convert to Number.
// ---------------------------------------------------------------------------

export function canonicalizeBarcode(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

// ---------------------------------------------------------------------------
// Generate a unique Variant ID
// ---------------------------------------------------------------------------

export function generateVariantId(): string {
  return `var-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ---------------------------------------------------------------------------
// Variant label — presentational only. Never stored as domain data.
// "M / White", "L / Black", "Standard variant"
// ---------------------------------------------------------------------------

export function getVariantLabel(variant: ProductVariantPreview): string {
  const parts = [variant.size, variant.colour].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : 'Standard variant'
}

// ---------------------------------------------------------------------------
// Per-Merchant initial variant fixtures
//
// Includes:
//   - Variants with all fields
//   - one with no barcode
//   - one with no size
//   - one with no colour
//   - one with neither size nor colour
//   - one ARCHIVED Variant
//   - ACTIVE, INACTIVE statuses
//
// Ordered by SKU ASC, then id ASC (mirrors backend deterministic ordering).
//
// SKU uniqueness: per Merchant. Same SKU cannot appear in another product
// within the same Merchant's fixture. Different Merchants may reuse SKUs.
// ---------------------------------------------------------------------------

export const MOCK_MERCHANT_VARIANTS_FIXTURE: Record<string, ProductVariantPreview[]> = {
  dstyle: [
    // ── Classic Oxford Shirt (prod-dstyle-001) ──────────────────────────────
    {
      id: 'var-dstyle-001',
      merchantId: 'dstyle',
      productId: 'prod-dstyle-001',
      sku: 'DS-OXF-BLK-M',
      barcode: null,                    // No barcode — tests nullable barcode UX
      size: 'M',
      colour: 'Black',
      status: 'INACTIVE',
      createdAt: '2025-03-10T09:00:00Z',
      updatedAt: '2025-03-10T09:00:00Z',
    },
    {
      id: 'var-dstyle-002',
      merchantId: 'dstyle',
      productId: 'prod-dstyle-001',
      sku: 'DS-OXF-WHT-L',
      barcode: '600123450002',
      size: 'L',
      colour: 'White',
      status: 'ACTIVE',
      createdAt: '2025-03-10T09:05:00Z',
      updatedAt: '2025-06-01T10:00:00Z',
    },
    {
      id: 'var-dstyle-003',
      merchantId: 'dstyle',
      productId: 'prod-dstyle-001',
      sku: 'DS-OXF-WHT-M',
      barcode: '600123450001',
      size: 'M',
      colour: 'White',
      status: 'ACTIVE',
      createdAt: '2025-03-10T09:10:00Z',
      updatedAt: '2025-06-01T10:00:00Z',
    },
    // ── Premium Polo Shirt (prod-dstyle-005) ────────────────────────────────
    {
      id: 'var-dstyle-010',
      merchantId: 'dstyle',
      productId: 'prod-dstyle-005',
      sku: 'DS-POLO-BLK-L',
      barcode: '600123450010',
      size: 'L',
      colour: 'Black',
      status: 'ACTIVE',
      createdAt: '2025-04-05T09:00:00Z',
      updatedAt: '2025-07-10T12:00:00Z',
    },
    // ── Classic Chino Trousers (prod-dstyle-002) ─────────────────────────────
    {
      id: 'var-dstyle-020',
      merchantId: 'dstyle',
      productId: 'prod-dstyle-002',
      sku: 'UF-CHN-KHK-32',
      barcode: '600123450020',
      size: '32',
      colour: 'Khaki',
      status: 'ACTIVE',
      createdAt: '2025-03-15T08:00:00Z',
      updatedAt: '2025-07-01T08:45:00Z',
    },
    {
      id: 'var-dstyle-021',
      merchantId: 'dstyle',
      productId: 'prod-dstyle-002',
      sku: 'UF-CHN-NVY-34',
      barcode: '600123450021',
      size: '34',                       // size only, no colour set for test
      colour: null,                     // No colour — tests nullable colour UX
      status: 'INACTIVE',
      createdAt: '2025-03-15T08:05:00Z',
      updatedAt: '2025-03-15T08:05:00Z',
    },
    // ── Slim Fit Cargo Shorts (prod-dstyle-006) ──────────────────────────────
    {
      id: 'var-dstyle-030',
      merchantId: 'dstyle',
      productId: 'prod-dstyle-006',
      sku: 'NL-CARGO-S',
      barcode: '600123450030',
      size: null,                       // No size — tests nullable size UX
      colour: 'Olive',
      status: 'ACTIVE',
      createdAt: '2025-05-12T10:00:00Z',
      updatedAt: '2025-07-22T09:15:00Z',
    },
    // ── Stretch Formal Trousers (prod-dstyle-007) ────────────────────────────
    {
      id: 'var-dstyle-040',
      merchantId: 'dstyle',
      productId: 'prod-dstyle-007',
      sku: 'FORMAL-STRETCH-STD',
      barcode: null,
      size: null,                       // No size AND no colour — "Standard variant"
      colour: null,
      status: 'INACTIVE',
      createdAt: '2025-06-05T08:00:00Z',
      updatedAt: '2025-06-05T08:00:00Z',
    },
    // ── Legacy Denim Jacket (prod-dstyle-003) — ARCHIVED Variant ─────────────
    {
      id: 'var-dstyle-050',
      merchantId: 'dstyle',
      productId: 'prod-dstyle-003',
      sku: 'NL-DENIM-M-BLU',
      barcode: '600123450050',
      size: 'M',
      colour: 'Blue',
      status: 'ARCHIVED',              // ARCHIVED Variant
      createdAt: '2024-08-15T08:00:00Z',
      updatedAt: '2025-01-20T14:00:00Z',
    },
  ],

  urban: [
    {
      id: 'var-urban-001',
      merchantId: 'urban',
      productId: 'prod-urban-001',
      sku: 'SS-AIR-BLK-42',
      barcode: '700234560001',
      size: '42',
      colour: 'Black',
      status: 'ACTIVE',
      createdAt: '2025-01-20T08:00:00Z',
      updatedAt: '2025-06-20T11:00:00Z',
    },
    {
      id: 'var-urban-002',
      merchantId: 'urban',
      productId: 'prod-urban-001',
      sku: 'SS-AIR-WHT-44',
      barcode: '700234560002',
      size: '44',
      colour: 'White',
      status: 'ACTIVE',
      createdAt: '2025-01-20T08:05:00Z',
      updatedAt: '2025-06-20T11:00:00Z',
    },
    {
      id: 'var-urban-003',
      merchantId: 'urban',
      productId: 'prod-urban-002',
      sku: 'UC-CANVAS-WHT-41',
      barcode: '700234560010',
      size: '41',
      colour: 'White',
      status: 'ACTIVE',
      createdAt: '2025-01-25T09:00:00Z',
      updatedAt: '2025-07-05T13:30:00Z',
    },
  ],

  classic: [
    {
      id: 'var-classic-001',
      merchantId: 'classic',
      productId: 'prod-classic-001',
      sku: 'AK-KAFTAN-RED-M',
      barcode: '800345670001',
      size: 'M',
      colour: 'Red',
      status: 'ACTIVE',
      createdAt: '2025-03-15T09:00:00Z',
      updatedAt: '2025-06-01T10:00:00Z',
    },
  ],

  disabled: [],
  'manage-only': [],
  'staff-read-only': [],
  'staff-manage-only': [],
  'roles-read-only': [],
  'roles-manage-only': [],
  'catalogue-manage-only': [],
  'catalogue-price-only': [],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get all variants for a specific product within a merchant's variant list.
 * Ordered: SKU ASC, then id ASC.
 */
export function getVariantsForProduct(
  allVariants: ProductVariantPreview[],
  productId: string,
): ProductVariantPreview[] {
  return allVariants
    .filter((v) => v.productId === productId)
    .sort((a, b) => {
      const skuCmp = a.sku.localeCompare(b.sku)
      if (skuCmp !== 0) return skuCmp
      return a.id.localeCompare(b.id)
    })
}

/**
 * Get variant count for a specific product within a merchant's variant list.
 * Derived — never stored on ProductPreview.
 */
export function getVariantCount(
  allVariants: ProductVariantPreview[],
  productId: string,
): number {
  return allVariants.filter((v) => v.productId === productId).length
}

/**
 * Check if a SKU is already in use by another variant in the same merchant.
 * Canonicalizes input before comparing.
 * excludeVariantId: the variant being edited (excluded from check).
 * Checks ACTIVE, INACTIVE, and ARCHIVED variants.
 */
export function isSKUTaken(
  allVariants: ProductVariantPreview[],
  rawSku: string,
  excludeVariantId?: string,
): boolean {
  const canonical = canonicalizeSku(rawSku)
  return allVariants.some(
    (v) => v.sku === canonical && v.id !== excludeVariantId,
  )
}

/**
 * Check if a barcode is already in use by another variant in the same merchant.
 * Checks ACTIVE, INACTIVE, and ARCHIVED variants.
 */
export function isBarcodeTaken(
  allVariants: ProductVariantPreview[],
  barcode: string | null,
  excludeVariantId?: string,
): boolean {
  if (!barcode) return false
  return allVariants.some(
    (v) => v.barcode !== null && v.barcode === barcode && v.id !== excludeVariantId,
  )
}

/**
 * Exact SKU lookup — merchant-scoped.
 * Canonicalizes input. Returns ACTIVE, INACTIVE, and ARCHIVED variants.
 * Never searches other merchants.
 */
export function lookupBySku(
  allVariants: ProductVariantPreview[],
  rawSku: string,
): ProductVariantPreview | undefined {
  const canonical = canonicalizeSku(rawSku)
  return allVariants.find((v) => v.sku === canonical)
}

/**
 * Exact barcode lookup — merchant-scoped.
 * Trimmed, case-preserved string comparison. Never converts to Number.
 * Returns ACTIVE, INACTIVE, and ARCHIVED variants.
 */
export function lookupByBarcode(
  allVariants: ProductVariantPreview[],
  rawBarcode: string,
): ProductVariantPreview | undefined {
  const trimmed = rawBarcode.trim()
  if (!trimmed) return undefined
  return allVariants.find((v) => v.barcode !== null && v.barcode === trimmed)
}
