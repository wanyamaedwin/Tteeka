'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export function OrderLifecycleDialog({
  open,
  action,
  pending,
  confirmed = false,
  onCancel,
  onConfirm,
}: {
  open: boolean
  action: 'abandon' | 'cancel'
  pending: boolean
  confirmed?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) window.setTimeout(() => cancel.current?.focus(), 20)
  }, [open])
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, pending, onCancel])
  if (!open) return null
  const abandon = action === 'abandon'
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="order-life-title" aria-describedby="order-life-desc" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/30" aria-hidden onClick={pending ? undefined : onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button type="button" onClick={onCancel} disabled={pending} aria-label="Close dialog" className="absolute right-4 top-4 rounded-lg p-2"><X className="size-4" /></button>
        <div className="flex gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-4" /></span>
          <div>
            <h2 id="order-life-title" className="font-semibold">{abandon ? 'Abandon this draft?' : confirmed ? 'Cancel this confirmed order?' : 'Cancel this order?'}</h2>
            <p id="order-life-desc" className="mt-2 text-sm leading-6 text-muted-foreground">{abandon ? 'Use when the enquiry or potential sale is no longer being pursued. The Order remains in history.' : confirmed ? 'Any stock still actively held for this order will be released. Physical stock remains unchanged.' : 'The merchant is intentionally cancelling this Order. It will remain in history.'}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} type="button" onClick={onCancel} disabled={pending} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold">Keep order</button>
          <button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending} className="h-10 rounded-lg bg-destructive px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Saving...' : abandon ? 'Abandon draft' : 'Cancel Order'}</button>
        </div>
      </div>
    </div>
  )
}
