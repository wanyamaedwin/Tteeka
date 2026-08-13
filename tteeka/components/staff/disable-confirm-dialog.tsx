'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// DisableConfirmDialog
//
// Confirmation modal for disabling or reactivating a staff membership.
// Roles are always retained — messaging reflects this.
// ---------------------------------------------------------------------------

type DisableConfirmDialogProps = {
  open: boolean
  /** Name to display, falls back to 'this person' */
  staffName?: string
  /** 'disable' | 'reactivate' */
  action: 'disable' | 'reactivate'
  /** Whether the viewer is disabling their OWN membership */
  isSelf?: boolean
  submitting?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DisableConfirmDialog({
  open,
  staffName,
  action,
  isSelf,
  submitting,
  onConfirm,
  onCancel,
}: DisableConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const displayName = staffName ?? 'this person'
  const isDisable = action === 'disable'

  // Focus cancel (safe default) when opened
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => cancelRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // Focus trap + Escape
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
      aria-labelledby="disable-dialog-title"
      aria-describedby="disable-dialog-desc"
    >
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={onCancel} />
      <div ref={panelRef} className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
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
            <h2 id="disable-dialog-title" className="font-semibold leading-snug">
              {isDisable
                ? `Disable access for ${displayName}?`
                : `Reactivate access for ${displayName}?`}
            </h2>
            <p id="disable-dialog-desc" className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {isDisable ? (
                isSelf ? (
                  <>
                    <span className="font-semibold text-destructive">You are disabling your own access to this business.</span>{' '}
                    You will no longer be able to access this workspace. Your assigned roles will be kept and will become effective again if access is reactivated.
                  </>
                ) : (
                  <>
                    {staffName ? <><span className="font-semibold">{staffName}</span> will</> : 'They will'} no longer be able to access this business. Their assigned roles will be kept and will become effective again if access is reactivated.
                  </>
                )
              ) : (
                <>
                  {staffName ? <><span className="font-semibold">{staffName}</span> will</> : 'They will'} regain access to this business with their previously assigned roles.
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
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-50"
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
              : isDisable ? 'Disable access' : 'Reactivate access'}
          </button>
        </div>
      </div>
    </div>
  )
}
