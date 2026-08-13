'use client'

import { Search, X } from 'lucide-react'
import type { ProductPreview } from '@/lib/mock-catalogue'
import type { InventoryListFilters } from '@/lib/mock-inventory'
import type { VariantStatus } from '@/lib/mock-variants'

// ---------------------------------------------------------------------------
// InventoryToolbar
//
// Search + filter controls for the Inventory list.
// Search covers: product name, SKU, barcode, size, colour.
// Product filter: All products | specific product (current merchant only).
// Variant status filter: All | ACTIVE | INACTIVE | ARCHIVED.
// Filters combine with AND semantics.
// ---------------------------------------------------------------------------

type InventoryToolbarProps = {
  filters: InventoryListFilters
  productList: ProductPreview[]
  onFilterChange: (patch: Partial<InventoryListFilters>) => void
  onClearFilters: () => void
}

const VARIANT_STATUS_OPTIONS: { value: VariantStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'ARCHIVED', label: 'Archived' },
]

export function InventoryToolbar({
  filters,
  productList,
  onFilterChange,
  onClearFilters,
}: InventoryToolbarProps) {
  const hasFilters =
    filters.search.trim() !== '' ||
    filters.productId !== 'all' ||
    filters.variantStatus !== 'all'

  return (
    <div className="mb-5 space-y-3">
      {/* Row 1: Search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="inventory-search"
          type="search"
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
          placeholder="Search by product name, SKU, barcode, size or colour…"
          aria-label="Search inventory"
          className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </div>

      {/* Row 2: Product + Status + State badge + Clear */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Product filter */}
        <select
          id="inventory-product-filter"
          value={filters.productId}
          onChange={(e) => onFilterChange({ productId: e.target.value })}
          aria-label="Filter by product"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
        >
          <option value="all">All products</option>
          {productList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Variant status filter */}
        <select
          id="inventory-status-filter"
          value={filters.variantStatus}
          onChange={(e) => onFilterChange({ variantStatus: e.target.value as VariantStatus | 'all' })}
          aria-label="Filter by variant status"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
        >
          {VARIANT_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Inventory state label — restrained static affordance */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          AVAILABLE only
        </span>

        {/* Clear filters */}
        {hasFilters && (
          <button
            type="button"
            id="inventory-clear-filters"
            onClick={onClearFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3" aria-hidden="true" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
