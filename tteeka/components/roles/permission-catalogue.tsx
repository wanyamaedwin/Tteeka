'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  PERMISSION_GROUP_LABELS,
  getPermissionsByGroup,
  type PermissionGroup,
} from '@/lib/permissions'

// ---------------------------------------------------------------------------
// PermissionCatalogue
//
// Read-only display of the exact 13 current ACTIVE permission keys.
// No CRUD. Permission definitions are code-owned by the backend.
// ---------------------------------------------------------------------------

export function PermissionCatalogue() {
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const filtered = q
    ? PERMISSION_CATALOG.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
    : null

  const hasResults = filtered === null || filtered.length > 0

  return (
    <div className="space-y-5">
      {/* Header + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Permission catalogue</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {PERMISSION_CATALOG.length} permissions are currently active. Permission definitions are managed by the system.
          </p>
        </div>
        <div className="relative sm:w-60">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="perm-catalogue-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search permissions…"
            aria-label="Search permission catalogue"
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
      </div>

      {!hasResults && (
        <p className="py-8 text-center text-sm text-muted-foreground italic">
          No permissions match your search.
        </p>
      )}

      {/* Grouped display */}
      {PERMISSION_GROUPS.map((group) => {
        const perms = filtered
          ? filtered.filter((p) => p.group === group)
          : getPermissionsByGroup(group)
        if (perms.length === 0) return null
        return (
          <div key={group}>
            <div className="mb-3 flex items-center gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {PERMISSION_GROUP_LABELS[group]}
              </h3>
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{perms.length}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {perms.map((perm) => (
                <div
                  key={perm.key}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <p className="text-sm font-semibold">{perm.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{perm.description}</p>
                  <code className="mt-2 block text-xs font-mono text-muted-foreground/70">{perm.key}</code>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
