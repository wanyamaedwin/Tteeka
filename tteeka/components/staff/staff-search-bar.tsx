'use client'

import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MockRoleRecord } from '@/lib/mock-staff'

// ---------------------------------------------------------------------------
// StaffFilters — the search/filter toolbar above the staff list
// ---------------------------------------------------------------------------

export type StatusFilter = 'all' | 'ACTIVE' | 'DISABLED'

export type StaffFilters = {
  search: string
  status: StatusFilter
  roleId: string | 'all' | 'none'
}

type StaffSearchBarProps = {
  filters: StaffFilters
  roles: MockRoleRecord[]
  onChange: (filters: StaffFilters) => void
}

export function StaffSearchBar({ filters, roles, onChange }: StaffSearchBarProps) {
  function set<K extends keyof StaffFilters>(key: K, value: StaffFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  const hasActiveFilter =
    filters.search.trim() !== '' ||
    filters.status !== 'all' ||
    filters.roleId !== 'all'

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id="staff-search"
          type="search"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search name, phone or email…"
          aria-label="Search staff"
          className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => set('search', '')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Status filter */}
      <select
        id="staff-status-filter"
        value={filters.status}
        onChange={(e) => set('status', e.target.value as StatusFilter)}
        aria-label="Filter by membership status"
        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 sm:w-44"
      >
        <option value="all">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="DISABLED">Disabled</option>
      </select>

      {/* Role filter */}
      <select
        id="staff-role-filter"
        value={filters.roleId}
        onChange={(e) => set('roleId', e.target.value)}
        aria-label="Filter by role"
        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 sm:w-52"
      >
        <option value="all">All roles</option>
        <option value="none">No role assigned</option>
        {roles
          .filter((r) => r.status === 'ACTIVE')
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
      </select>

      {/* Clear all filters */}
      {hasActiveFilter && (
        <button
          type="button"
          onClick={() => onChange({ search: '', status: 'all', roleId: 'all' })}
          className="h-10 shrink-0 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  )
}
