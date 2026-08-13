'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaginationInfo } from '@/lib/mock-catalogue'

// ---------------------------------------------------------------------------
// PaginationControls
//
// Server-pagination shaped pagination control.
// Page state mirrors backend shape: { page, pageSize, total, totalPages }
// Max pageSize: 100 (mirrors backend maximum).
// Default pageSize options: 10, 20, 50
// ---------------------------------------------------------------------------

type PaginationControlsProps = {
  pagination: PaginationInfo
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  /** Defaults to "product" */
  itemName?: string
}

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const

export function PaginationControls({
  pagination,
  onPageChange,
  onPageSizeChange,
  itemName = 'product',
}: PaginationControlsProps) {
  const { page, pageSize, total, totalPages } = pagination

  if (total === 0) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      {/* Summary */}
      <p className="text-sm text-muted-foreground">
        Showing {start}–{end} of {total} {itemName}{total !== 1 ? 's' : ''}
      </p>

      <div className="flex items-center gap-3">
        {/* Page size selector */}
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground" htmlFor="page-size-select">
          Per page:
          <select
            id="page-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Products per page"
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {/* Page navigation */}
        <div className="flex items-center gap-1" role="navigation" aria-label="Pagination">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="size-4" />
          </button>

          <span className="flex items-center gap-1 px-2 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{page}</span>
            <span>/</span>
            <span>{totalPages}</span>
          </span>

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
