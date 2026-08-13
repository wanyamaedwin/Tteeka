'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MockRoleRecord, StaffMemberPreview } from '@/lib/mock-staff'

// ---------------------------------------------------------------------------
// RoleAssignmentDialog
//
// Presents a checkbox list of ACTIVE roles for the current Merchant.
// Saving replaces the Membership's roleIds with the exact selected set
// (desired-state replacement semantics — matches backend PUT).
//
// DISABLED roles that are already assigned are shown as informational only
// (cannot be newly selected, but are visible to show historical assignment).
// ---------------------------------------------------------------------------

type RoleAssignmentDialogProps = {
  open: boolean
  member: StaffMemberPreview
  allRoles: MockRoleRecord[]
  submitting?: boolean
  onSave: (newRoleIds: string[]) => void
  onCancel: () => void
}

export function RoleAssignmentDialog({
  open,
  member,
  allRoles,
  submitting,
  onSave,
  onCancel,
}: RoleAssignmentDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Selected IDs — initialised to current membership roleIds
  const activeRoleIds = new Set(allRoles.filter((role) => role.status === 'ACTIVE').map(({ id }) => id))
  const [selected, setSelected] = useState<Set<string>>(
    new Set(member.roleIds.filter((id) => activeRoleIds.has(id))),
  )

  // Re-sync when member changes (e.g. different staff opened)
  useEffect(() => {
    const activeIds = new Set(allRoles.filter((role) => role.status === 'ACTIVE').map(({ id }) => id))
    setSelected(new Set(member.roleIds.filter((id) => activeIds.has(id))))
  }, [allRoles, member.membershipId, member.roleIds])

  const activeRoles = allRoles.filter((r) => r.status === 'ACTIVE')
  const disabledAssigned = allRoles.filter(
    (r) => r.status === 'DISABLED' && member.roleIds.includes(r.id),
  )

  // Compute diff for confirmation
  const added = activeRoles.filter((r) => selected.has(r.id) && !member.roleIds.includes(r.id))
  const removed = activeRoles.filter((r) => !selected.has(r.id) && member.roleIds.includes(r.id))
  const hasChanges = added.length > 0 || removed.length > 0

  // Confirm step
  const [confirming, setConfirming] = useState(false)

  function handleToggle(roleId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  function handleNext() {
    if (!hasChanges) { onSave(Array.from(selected)); return }
    setConfirming(true)
  }

  function handleConfirm() {
    onSave(Array.from(selected))
  }

  // Focus trap + Escape
  useEffect(() => {
    if (!open) return
    const el = panelRef.current
    if (!el) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); if (confirming) setConfirming(false); else onCancel() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, confirming, onCancel])

  if (!open) return null

  const displayName = member.name ?? member.phone
  const isDisabled = member.membershipStatus === 'DISABLED'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-dialog-title"
    >
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={onCancel} />
      <div
        ref={panelRef}
        className="relative flex w-full max-w-md flex-col rounded-2xl border border-border bg-card shadow-2xl"
        style={{ maxHeight: 'min(90vh, 600px)' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 id="role-dialog-title" className="font-semibold">
              {confirming ? 'Confirm role changes' : 'Manage roles'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{displayName}</p>
            {isDisabled && (
              <p className="mt-1 text-xs text-muted-foreground">
                These roles will apply when access is reactivated.
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

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {confirming ? (
            // ── Confirmation summary ─────────────────────────────────────
            <div className="space-y-4 text-sm">
              {added.length > 0 && (
                <div>
                  <p className="mb-2 font-semibold text-accent-foreground">Added</p>
                  <ul className="space-y-1.5">
                    {added.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-accent-foreground" />
                        {r.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {removed.length > 0 && (
                <div>
                  <p className="mb-2 font-semibold text-destructive">Removed</p>
                  <ul className="space-y-1.5">
                    {removed.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-destructive" />
                        {r.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selected.size === 0 && (
                <p className="text-muted-foreground italic">
                  All roles will be removed. The staff member will have no assigned roles.
                </p>
              )}
            </div>
          ) : (
            // ── Role checkbox list ───────────────────────────────────────
            <div className="space-y-1">
              {activeRoles.length === 0 && disabledAssigned.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground italic">
                  No roles have been created for this workspace yet.
                </p>
              )}

              {activeRoles.map((role) => {
                const checked = selected.has(role.id)
                return (
                  <label
                    key={role.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-secondary/60',
                      checked && 'bg-accent/20',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(role.id)}
                      disabled={submitting}
                      className="mt-0.5 size-4 rounded accent-primary"
                      aria-describedby={role.description ? `role-desc-${role.id}` : undefined}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{role.name}</span>
                      {role.description && (
                        <span id={`role-desc-${role.id}`} className="mt-0.5 block text-xs text-muted-foreground">
                          {role.description}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}

              {/* Disabled historical roles — informational, not selectable */}
              {disabledAssigned.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Historical assignments (disabled)
                  </p>
                  {disabledAssigned.map((role) => (
                    <div
                      key={role.id}
                      className="flex items-start gap-3 rounded-lg px-3 py-3 opacity-60"
                    >
                      <input type="checkbox" checked disabled className="mt-0.5 size-4 rounded" aria-label={`${role.name} (disabled role, cannot be reassigned)`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium line-through">{role.name}</span>
                        <span className="mt-0.5 block text-xs text-destructive">Role disabled — saving another assignment change removes this historical link</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
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
                ) : (
                  'Update roles'
                )}
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
                disabled={submitting}
                className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {hasChanges ? 'Review changes' : 'Save roles'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
