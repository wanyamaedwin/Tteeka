'use client'

import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { ProductListFilters, ProductStatus } from '@/lib/mock-catalogue'

// ---------------------------------------------------------------------------
// ProductToolbar
//
// Desktop: single organized toolbar with Search, Status, Category, Brand filters.
// Mobile: compact layout with clear filters button.
//
// Filters combine using AND semantics.
// Category and Brand options are derived dynamically from current merchant data.
// ---------------------------------------------------------------------------

type ProductToolbarProps = {
  filters: ProductListFilters
  categories: string[]
  brands: string[]
  onFilterChange: (patch: Partial<ProductListFilters>) => void
  onClearFilters: () => void
}

export function ProductToolbar({
  filters,
  categories,
  brands,
  onFilterChange,
  onClearFilters,
}: ProductToolbarProps) {
  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.status !== 'all' ||
    filters.category !== 'all' ||
    filters.brand !== 'all'

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="product-search-input"
            type="search"
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            placeholder="Search products by name, category, brand…"
            aria-label="Search products"
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:items-center">
          {/* Status filter */}
          <select
            id="product-status-filter"
            value={filters.status}
            onChange={(e) => onFilterChange({ status: e.target.value as ProductStatus | 'all' })}
            aria-label="Filter by status"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            <option value="all">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </select>

          {/* Category filter */}
          <select
            id="product-category-filter"
            value={filters.category}
            onChange={(e) => onFilterChange({ category: e.target.value })}
            aria-label="Filter by category"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Brand filter */}
          <select
            id="product-brand-filter"
            value={filters.brand}
            onChange={(e) => onFilterChange({ brand: e.target.value })}
            aria-label="Filter by brand"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            <option value="all">All brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
