'use client'

import { useEffect, useRef, useState } from 'react'
import { PackageCheck, X } from 'lucide-react'

function defaultExpiry() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function OrderConfirmDialog({
  open,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean
  pending: boolean
  error: string
  onCancel: () => void
  onConfirm: (expiresAt: string) => void
}) {
  const cancelButton = useRef<HTMLButtonElement>(null)
  const [expiry, setExpiry] = useState(defaultExpiry)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!open) return
    setExpiry(defaultExpiry())
    setLocalError('')
    window.setTimeout(() => cancelButton.current?.focus(), 20)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onCancel, pending])

  if (!open) return null
  const submit = () => {
    const parsed = new Date(expiry)
    if (!expiry || Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
      setLocalError('Choose a future date and time for the stock reservation.')
      return
    }
    setLocalError('')
    onConfirm(parsed.toISOString())
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-order-title"
      aria-describedby="confirm-order-description"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-foreground/30"
        aria-hidden
        onClick={pending ? undefined : onCancel}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          aria-label="Close confirmation dialog"
          className="absolute right-4 top-4 rounded-lg p-2"
        >
          <X className="size-4" />
        </button>
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <PackageCheck className="size-5" />
          </span>
          <div>
            <h2 id="confirm-order-title" className="font-semibold">
              Confirm this order?
            </h2>
            <p
              id="confirm-order-description"
              className="mt-2 text-sm leading-6 text-muted-foreground"
            >
              Confirming reserves all required stock atomically. Physical stock is
              not removed, and the order can no longer be edited as a draft.
            </p>
          </div>
        </div>
        <label className="mt-5 block text-sm font-semibold">
          Hold stock until
          <input
            type="datetime-local"
            value={expiry}
            min={defaultExpiry().slice(0, 10) + 'T00:00'}
            onChange={(event) => setExpiry(event.target.value)}
            disabled={pending}
            className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Stock remains held until this time or until the order is cancelled.
        </p>
        {(localError || error) && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {localError || error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelButton}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            aria-busy={pending}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? 'Confirming...' : 'Confirm Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
