// ---------------------------------------------------------------------------
// lib/mock-catalogue.ts
//
// Centralized F4.1 Product Catalogue preview data.
//
// Architecture:
//   • ProductPreview — Product aggregate (descriptive catalogue info only)
//   • MOCK_MERCHANT_PRODUCTS_FIXTURE — per-Merchant initial product data
//
// What a Product IS (F4.1):
//   id, name, description, category, brand, status, createdAt, updatedAt
//
// What a Product is NOT (F4.2+):
//   SKU, barcode, size, colour, price, costPrice, stock quantity, variants
//
// F4.2 will attach ProductVariants via productId — do not embed them here.
// The MerchantWorkspaceProvider owns mutable session state derived from these.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'

export type ProductPreview = {
  id: string
  merchantId: string
  name: string
  description?: string | null
  /** Free-form category text — no Category CRUD */
  category?: string | null
  /** Free-form brand text — no Brand CRUD */
  brand?: string | null
  status: ProductStatus
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Filter / pagination types
// ---------------------------------------------------------------------------

export type ProductListFilters = {
  search: string
  status: ProductStatus | 'all'
  category: string | 'all'
  brand: string | 'all'
}

export type PaginationState = {
  page: number
  pageSize: number
}

export type PaginationInfo = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// ---------------------------------------------------------------------------
// Per-Merchant initial product fixtures
//
// Includes:
//   - products with all fields
//   - one product with no description
//   - one product with no category
//   - one product with no brand
//   - ACTIVE, INACTIVE, ARCHIVED statuses
//
// Ordered by name ASC then id ASC (deterministic — mirrors backend ordering).
// ---------------------------------------------------------------------------

export const MOCK_MERCHANT_PRODUCTS_FIXTURE: Record<string, ProductPreview[]> = {
  dstyle: [
    {
      id: 'prod-dstyle-001',
      merchantId: 'dstyle',
      name: 'Classic Oxford Shirt',
      description: 'A timeless Oxford shirt crafted from premium 100% cotton. Features a button-down collar, chest pocket, and a relaxed regular fit suitable for both casual and semi-formal occasions.',
      category: "Men's Shirts",
      brand: 'Dstyle',
      status: 'ACTIVE',
      createdAt: '2025-03-01T09:00:00Z',
      updatedAt: '2025-06-15T11:30:00Z',
    },
    {
      id: 'prod-dstyle-002',
      merchantId: 'dstyle',
      name: 'Classic Chino Trousers',
      description: 'Tailored chino trousers in a slim-fit cut. Made from a cotton-twill blend for comfort and durability. Available in multiple colours.',
      category: 'Trousers',
      brand: 'Urban Form',
      status: 'ACTIVE',
      createdAt: '2025-03-05T10:00:00Z',
      updatedAt: '2025-07-01T08:45:00Z',
    },
    {
      id: 'prod-dstyle-003',
      merchantId: 'dstyle',
      name: 'Legacy Denim Jacket',
      description: 'A vintage-inspired denim jacket with a structured fit. Features button front closure, chest and side pockets.',
      category: 'Jackets',
      brand: 'Northline',
      status: 'ARCHIVED',
      createdAt: '2024-08-10T08:00:00Z',
      updatedAt: '2025-01-20T14:00:00Z',
    },
    {
      id: 'prod-dstyle-004',
      merchantId: 'dstyle',
      name: 'Linen Summer Shirt',
      description: 'Lightweight linen shirt perfect for warm weather. Features a spread collar, long sleeves that can be rolled up, and a relaxed silhouette.',
      category: "Men's Shirts",
      brand: 'Dstyle',
      status: 'INACTIVE',
      createdAt: '2025-02-14T11:00:00Z',
      updatedAt: '2025-05-30T16:00:00Z',
    },
    {
      id: 'prod-dstyle-005',
      merchantId: 'dstyle',
      name: 'Premium Polo Shirt',
      // No description — tests nullable description UX
      description: null,
      category: "Men's Shirts",
      brand: 'Dstyle',
      status: 'ACTIVE',
      createdAt: '2025-04-01T09:30:00Z',
      updatedAt: '2025-07-10T12:00:00Z',
    },
    {
      id: 'prod-dstyle-006',
      merchantId: 'dstyle',
      name: 'Slim Fit Cargo Shorts',
      description: 'Versatile cargo shorts with a slim fit and multiple utility pockets. Ideal for outdoor and casual wear.',
      // No category — tests nullable category UX
      category: null,
      brand: 'Northline',
      status: 'ACTIVE',
      createdAt: '2025-05-10T10:00:00Z',
      updatedAt: '2025-07-22T09:15:00Z',
    },
    {
      id: 'prod-dstyle-007',
      merchantId: 'dstyle',
      name: 'Stretch Formal Trousers',
      description: 'Smart formal trousers with a slim-tapered cut. Features four-way stretch fabric for all-day comfort in office environments.',
      category: 'Trousers',
      // No brand — tests nullable brand UX
      brand: null,
      status: 'ACTIVE',
      createdAt: '2025-06-01T08:00:00Z',
      updatedAt: '2025-08-01T10:00:00Z',
    },
  ],

  urban: [
    {
      id: 'prod-urban-001',
      merchantId: 'urban',
      name: 'Air Mesh Running Shoe',
      description: 'Lightweight running shoe with breathable mesh upper and cushioned midsole. Designed for daily training runs.',
      category: 'Running',
      brand: 'SwiftStep',
      status: 'ACTIVE',
      createdAt: '2025-01-15T08:00:00Z',
      updatedAt: '2025-06-20T11:00:00Z',
    },
    {
      id: 'prod-urban-002',
      merchantId: 'urban',
      name: 'Canvas Low-Top Sneaker',
      description: 'Classic canvas sneaker with a vulcanised rubber sole. A versatile everyday shoe in a clean low-top silhouette.',
      category: 'Casual',
      brand: 'UrbanCore',
      status: 'ACTIVE',
      createdAt: '2025-01-20T09:00:00Z',
      updatedAt: '2025-07-05T13:30:00Z',
    },
    {
      id: 'prod-urban-003',
      merchantId: 'urban',
      name: 'Leather Oxford Formal',
      description: 'Hand-stitched leather Oxford shoe with a Goodyear-welted construction for long-lasting durability.',
      category: 'Formal',
      brand: 'StepCraft',
      status: 'ACTIVE',
      createdAt: '2025-02-01T10:00:00Z',
      updatedAt: '2025-07-18T08:00:00Z',
    },
    {
      id: 'prod-urban-004',
      merchantId: 'urban',
      name: 'Retro High-Top Basketball',
      description: 'Retro-style basketball shoe with high ankle support and a chunky sole.',
      category: 'Basketball',
      brand: 'UrbanCore',
      status: 'INACTIVE',
      createdAt: '2024-12-01T08:00:00Z',
      updatedAt: '2025-04-15T09:00:00Z',
    },
  ],

  classic: [
    {
      id: 'prod-classic-001',
      merchantId: 'classic',
      name: 'Ankara Print Kaftan',
      description: 'Vibrant Ankara print kaftan in a relaxed A-line silhouette. Suitable for formal and festive occasions.',
      category: 'Traditional Wear',
      brand: 'AfriKloth',
      status: 'ACTIVE',
      createdAt: '2025-03-10T09:00:00Z',
      updatedAt: '2025-06-01T10:00:00Z',
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
// Helpers
// ---------------------------------------------------------------------------

/** Generate a simple unique product ID */
export function generateProductId(): string {
  return `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Returns unique categories from a product list (case-preserved, sorted).
 * Excludes null/empty values.
 */
export function getUniqueCategories(products: ProductPreview[]): string[] {
  const cats = new Set<string>()
  for (const p of products) {
    if (p.category) cats.add(p.category)
  }
  return Array.from(cats).sort()
}

/**
 * Returns unique brands from a product list (case-preserved, sorted).
 * Excludes null/empty values.
 */
export function getUniqueBrands(products: ProductPreview[]): string[] {
  const brands = new Set<string>()
  for (const p of products) {
    if (p.brand) brands.add(p.brand)
  }
  return Array.from(brands).sort()
}

/**
 * Apply filters and search to a product list.
 * Filters combine using AND semantics.
 * Search is case-insensitive containment across name, description, category, brand.
 * Ordering: name ASC, then id ASC (mirrors backend deterministic ordering).
 */
export function filterAndSortProducts(
  products: ProductPreview[],
  filters: ProductListFilters,
): ProductPreview[] {
  let list = [...products]

  // Search
  const q = filters.search.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (p.brand ?? '').toLowerCase().includes(q),
    )
  }

  // Status filter
  if (filters.status !== 'all') {
    list = list.filter((p) => p.status === filters.status)
  }

  // Category filter (case-insensitive)
  if (filters.category !== 'all') {
    list = list.filter(
      (p) => (p.category ?? '').toLowerCase() === filters.category.toLowerCase(),
    )
  }

  // Brand filter (case-insensitive)
  if (filters.brand !== 'all') {
    list = list.filter(
      (p) => (p.brand ?? '').toLowerCase() === filters.brand.toLowerCase(),
    )
  }

  // Deterministic ordering: name ASC, id ASC
  list.sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name)
    if (nameCompare !== 0) return nameCompare
    return a.id.localeCompare(b.id)
  })

  return list
}

/**
 * Paginates a list. Returns items for current page and pagination metadata.
 * Safely clamps page to valid range.
 */
export function paginateList<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; pagination: PaginationInfo } {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  const end = start + pageSize
  return {
    items: items.slice(start, end),
    pagination: { page: safePage, pageSize, total, totalPages },
  }
}
