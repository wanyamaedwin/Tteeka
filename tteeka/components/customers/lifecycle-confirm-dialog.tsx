'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

type LifecycleTarget = 'customer' | 'delivery location'

export function LifecycleConfirmDialog({
  open,
  target,
  action,
  submitting,
  onConfirm,
  onCancel,
}: {
  open: boolean
  target: LifecycleTarget
  action: 'archive' | 'reactivate'
  submitting?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const archiving = action === 'archive'

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => cancelRef.current?.focus(), 20)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault()
        onCancel()
      }
      if (event.key !== 'Tab') return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel, submitting])

  if (!open) return null

  const title = `${archiving ? 'Archive' : 'Reactivate'} this ${target}?`
  const description = target === 'delivery location' && archiving
    ? 'It will remain in customer history but should no longer be used as an active delivery location.'
    : archiving
      ? 'The customer will remain in customer history, and their phone number will stay reserved.'
      : `This ${target} will become active again.`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="lifecycle-title" aria-describedby="lifecycle-description">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={submitting ? undefined : onCancel} />
      <div ref={panelRef} className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button type="button" onClick={onCancel} disabled={submitting} aria-label="Close dialog" className="absolute right-4 top-4 rounded-lg p-2 text-muted-foreground hover:bg-secondary disabled:opacity-50">
          <X className="size-4" />
        </button>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-4" /></span>
          <div>
            <h2 id="lifecycle-title" className="font-semibold">{title}</h2>
            <p id="lifecycle-description" className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={submitting} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-secondary disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={submitting} className="h-10 rounded-lg bg-destructive px-4 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50">
            {submitting ? `${archiving ? 'Archiving' : 'Reactivating'}…` : `${archiving ? 'Archive' : 'Reactivate'} ${target}`}
          </button>
        </div>
      </div>
    </div>
  )
}
