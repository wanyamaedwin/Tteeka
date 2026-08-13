'use client'

import { Users, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// StaffEmptyState — two variants
//   • 'no-staff'    — merchant has no staff yet
//   • 'no-results'  — staff exist but filters yield no results
// ---------------------------------------------------------------------------

type StaffEmptyStateProps = {
  variant: 'no-staff' | 'no-results'
  canManage?: boolean
  onAddStaff?: () => void
  onClearFilters?: () => void
}

export function StaffEmptyState({
  variant,
  canManage,
  onAddStaff,
  onClearFilters,
}: StaffEmptyStateProps) {
  if (variant === 'no-results') {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
          <X className="size-5" />
        </span>
        <p className="font-semibold">No staff match your search or filters.</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Try adjusting your search term, status filter, or role filter.
        </p>
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
          >
            Clear filters
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
        <Users className="size-5" />
      </span>
      <p className="font-semibold">No staff members yet</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        No staff members have been added to this business.
      </p>
      {canManage && onAddStaff && (
        <button
          type="button"
          onClick={onAddStaff}
          className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Add staff
        </button>
      )}
    </div>
  )
}
