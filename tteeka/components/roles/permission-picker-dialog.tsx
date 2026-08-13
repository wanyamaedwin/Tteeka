'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  PERMISSION_GROUP_LABELS,
  getPermissionsByGroup,
  type PermissionMetadata,
} from '@/lib/permissions'
import type { RolePreview } from '@/lib/mock-staff'

// ---------------------------------------------------------------------------
// PermissionPickerDialog
//
// Full permission management UI for an existing Role.
//
// Rules:
//   • Exactly 13 ACTIVE catalog permissions shown in groups.
//   • Every permission is independent — NO auto-selection chains.
//   • Desired-state semantics: saving replaces the full permissionKeys array.
//   • Historical deprecated permissions kept informational-only.
//   • Disabled roles: show subtle note that permissions activate on reactivation.
// ---------------------------------------------------------------------------

type PermissionPickerDialogProps = {
  open: boolean
  role: RolePreview
  submitting?: boolean
  permissions?: readonly PermissionMetadata[]
  onSave: (newKeys: string[]) => void
  onCancel: () => void
}

export function PermissionPickerDialog({
  open,
  role,
  submitting,
  permissions = PERMISSION_CATALOG,
  onSave,
  onCancel,
}: PermissionPickerDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Selected set — initialised to current role's permissionKeys
  const catalogKeys = new Set(permissions.map((permission) => permission.key))
  const [selected, setSelected] = useState<Set<string>>(
    new Set(role.permissionKeys.filter((key) => catalogKeys.has(key))),
  )

  // Re-sync when role changes
  useEffect(() => {
    const keys = new Set(permissions.map((permission) => permission.key))
    setSelected(new Set(role.permissionKeys.filter((key) => keys.has(key))))
  }, [permissions, role.id, role.permissionKeys])

  // Compute diff
  const added = permissions.filter(
    (p) => selected.has(p.key) && !role.permissionKeys.includes(p.key),
  )
  const removed = permissions.filter(
    (p) => !selected.has(p.key) && role.permissionKeys.includes(p.key),
  )
  const deprecatedAssigned = role.permissionKeys.filter((key) => !catalogKeys.has(key))
  const hasChanges = added.length > 0 || removed.length > 0 || deprecatedAssigned.length > 0

  // Historical deprecated keys — assigned to role but NOT in current catalog

  // Confirm step
  const [confirming, setConfirming] = useState(false)

  function handleToggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleNext() {
    if (!hasChanges) { onSave(Array.from(selected)); return }
    setConfirming(true)
  }

  function handleConfirm() {
    // Desired-state: only catalog keys in selected + discard deprecated unless kept
    onSave(Array.from(selected))
  }

  // Escape / focus trap
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (confirming) setConfirming(false)
        else onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, confirming, onCancel])

  if (!open) return null

  const isDisabledRole = role.status === 'DISABLED'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perm-dialog-title"
    >
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={onCancel} />
      <div
        ref={panelRef}
        className="relative flex w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-2xl"
        style={{ maxHeight: 'min(92vh, 700px)' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 id="perm-dialog-title" className="font-semibold">
              {confirming ? 'Confirm permission changes' : 'Manage permissions'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{role.name}</p>
            {isDisabledRole && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                This role is disabled — permissions will apply when the role is reactivated.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Important notice */}
        {!confirming && (
          <div className="shrink-0 border-b border-border bg-secondary/30 px-6 py-2.5 text-xs text-muted-foreground">
            Permissions are independent. Selecting a manage permission does <strong>not</strong> automatically grant the corresponding view permission.
          </div>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {confirming ? (
            // ── Diff review ───────────────────────────────────────────────
            <div className="space-y-5 text-sm">
              {added.length > 0 && (
                <div>
                  <p className="mb-2 font-semibold text-accent-foreground">Added</p>
                  <ul className="space-y-1.5">
                    {added.map((p) => (
                      <li key={p.key} className="flex items-start gap-2 text-muted-foreground">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-foreground" />
                        <span>
                          <span className="font-medium text-foreground">{p.label}</span>
                          <code className="ml-2 text-xs opacity-60">{p.key}</code>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {removed.length > 0 && (
                <div>
                  <p className="mb-2 font-semibold text-destructive">Removed</p>
                  <ul className="space-y-1.5">
                    {removed.map((p) => (
                      <li key={p.key} className="flex items-start gap-2 text-muted-foreground">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
                        <span>
                          <span className="font-medium text-foreground">{p.label}</span>
                          <code className="ml-2 text-xs opacity-60">{p.key}</code>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selected.size === 0 && !hasChanges && (
                <p className="italic text-muted-foreground">No permissions will be assigned. The role will have no access.</p>
              )}
              {selected.size === 0 && hasChanges && (
                <p className="italic text-muted-foreground">All permissions will be removed. The role will have no access.</p>
              )}
            </div>
          ) : (
            // ── Permission checklist ───────────────────────────────────────
            <div className="space-y-6">
              {PERMISSION_GROUPS.map((group) => {
                const perms = getPermissionsByGroup(group, permissions)
                if (perms.length === 0) return null
                return (
                  <div key={group}>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {PERMISSION_GROUP_LABELS[group]}
                    </h3>
                    <div className="space-y-1">
                      {perms.map((perm) => {
                        const checked = selected.has(perm.key)
                        return (
                          <label
                            key={perm.key}
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-secondary/60',
                              checked && 'bg-accent/15',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggle(perm.key)}
                              disabled={submitting}
                              className="mt-0.5 size-4 shrink-0 rounded accent-primary"
                              aria-describedby={`perm-desc-${perm.key.replace(/\./g, '-')}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium leading-5">{perm.label}</span>
                              <span
                                id={`perm-desc-${perm.key.replace(/\./g, '-')}`}
                                className="mt-0.5 block text-xs text-muted-foreground leading-4"
                              >
                                {perm.description}
                              </span>
                              <code className="mt-1 block text-xs text-muted-foreground/60 font-mono">
                                {perm.key}
                              </code>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Historical/deprecated permissions — informational only */}
              {deprecatedAssigned.length > 0 && (
                <div className="border-t border-border pt-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Historical assignments (deprecated)
                  </h3>
                  <div className="space-y-1">
                    {deprecatedAssigned.map((key) => (
                      <div
                        key={key}
                        className="flex items-start gap-3 rounded-xl px-3 py-3 opacity-60"
                      >
                        <input type="checkbox" checked disabled className="mt-0.5 size-4 shrink-0 rounded" aria-label={`${key} (deprecated permission, cannot be reassigned)`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium line-through">Deprecated permission</span>
                          <code className="mt-0.5 block text-xs text-destructive font-mono">{key}</code>
                          <span className="mt-0.5 block text-xs text-muted-foreground">This permission is no longer part of the catalogue. Saving will remove it.</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-between sm:items-center">
          <span className="text-xs text-muted-foreground">
            {selected.size} permission{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {confirming ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-secondary disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? (
                    <><Loader2 className="size-4 animate-spin" />Saving…</>
                  ) : 'Update permissions'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={submitting}
                  className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={submitting || !hasChanges}
                  className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  {hasChanges ? 'Review changes' : 'No changes'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
