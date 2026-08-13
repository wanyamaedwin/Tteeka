'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// RoleStatusConfirmDialog
//
// Confirmation for disabling or reactivating a Role.
// Messaging explains that staff assignments and permission links are retained.
// ---------------------------------------------------------------------------

type RoleStatusConfirmDialogProps = {
  open: boolean
  roleName: string
  action: 'disable' | 'reactivate'
  assignedStaffCount?: number
  submitting?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function RoleStatusConfirmDialog({
  open,
  roleName,
  action,
  assignedStaffCount,
  submitting,
  onConfirm,
  onCancel,
}: RoleStatusConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const isDisable = action === 'disable'

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => cancelRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = panelRef.current
    if (!el) return
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      if (e.key === 'Tab') {
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus() } }
        else { if (document.activeElement === last) { e.preventDefault(); first?.focus() } }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-status-title"
      aria-describedby="role-status-desc"
    >
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={onCancel} />
      <div ref={panelRef} className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-50"
        >
          <X className="size-4" />
        </button>

        <div className="mb-4 flex items-start gap-3">
          <span className={cn(
            'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',
            isDisable ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground',
          )}>
            <AlertTriangle className="size-4" />
          </span>
          <div>
            <h2 id="role-status-title" className="font-semibold leading-snug">
              {isDisable ? `Disable ${roleName}?` : `Reactivate ${roleName}?`}
            </h2>
            <p id="role-status-desc" className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {isDisable ? (
                <>
                  Staff assigned to this role will stop receiving its permissions while the role is disabled.
                  {assignedStaffCount !== undefined && assignedStaffCount > 0 && (
                    <> <span className="font-semibold text-foreground">{assignedStaffCount} staff member{assignedStaffCount !== 1 ? 's' : ''}</span> {assignedStaffCount !== 1 ? 'are' : 'is'} currently assigned to this role.</>
                  )}
                  {' '}Existing staff assignments and permission links will be kept.
                </>
              ) : (
                <>
                  The role will become active again. All previously assigned staff members and permissions will be restored.
                  {assignedStaffCount !== undefined && assignedStaffCount > 0 && (
                    <> <span className="font-semibold text-foreground">{assignedStaffCount} staff member{assignedStaffCount !== 1 ? 's' : ''}</span> will regain this role's permissions.</>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={cn(
              'h-10 rounded-lg px-4 text-sm font-semibold text-white transition-colors disabled:opacity-50',
              isDisable ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90',
            )}
          >
            {submitting
              ? isDisable ? 'Disabling…' : 'Reactivating…'
              : isDisable ? 'Disable role' : 'Reactivate role'}
          </button>
        </div>
      </div>
    </div>
  )
}
