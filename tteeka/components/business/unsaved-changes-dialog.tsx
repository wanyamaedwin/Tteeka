'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// UnsavedChangesDialog
//
// A modal confirmation dialog shown when a user with unsaved edits attempts
// to navigate away, switch workspace, or cancel editing.
//
// Props:
//   open        — controls visibility
//   onKeep      — user wants to keep editing (closes dialog, no change)
//   onDiscard   — user confirms discard (caller proceeds with navigation)
//   description — optional custom body text
// ---------------------------------------------------------------------------

type UnsavedChangesDialogProps = {
  open: boolean
  onKeep: () => void
  onDiscard: () => void
  description?: string
}

export function UnsavedChangesDialog({
  open,
  onKeep,
  onDiscard,
  description = "Your changes haven't been saved.",
}: UnsavedChangesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const keepBtnRef = useRef<HTMLButtonElement>(null)

  // Focus "Keep editing" when opened — safer default
  useEffect(() => {
    if (open) {
      // Small delay to let render complete
      const t = setTimeout(() => keepBtnRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // Trap focus inside dialog
  useEffect(() => {
    if (!open) return
    const el = dialogRef.current
    if (!el) return
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onKeep() }
      if (e.key === 'Tab') {
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus() } }
        else { if (document.activeElement === last) { e.preventDefault(); first?.focus() } }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onKeep])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-dialog-title"
      aria-describedby="unsaved-dialog-desc"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={onKeep}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        {/* Close */}
        <button
          type="button"
          onClick={onKeep}
          aria-label="Close dialog, keep editing"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        {/* Icon + heading */}
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <AlertTriangle className="size-4" />
          </span>
          <div>
            <h2 id="unsaved-dialog-title" className="font-semibold leading-snug">
              Discard unsaved changes?
            </h2>
            <p id="unsaved-dialog-desc" className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={keepBtnRef}
            type="button"
            onClick={onKeep}
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold transition-colors hover:bg-secondary"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="h-10 rounded-lg bg-destructive px-4 text-sm font-semibold text-white transition-colors hover:bg-destructive/90"
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>
  )
}
