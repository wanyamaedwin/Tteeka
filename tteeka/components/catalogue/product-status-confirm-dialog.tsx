'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProductPreview, ProductStatus } from '@/lib/mock-catalogue'

// ---------------------------------------------------------------------------
// ProductStatusConfirmDialog
//
// Confirmation for status lifecycle transitions:
//   ACTIVE → INACTIVE (Mark inactive — lighter)
//   ACTIVE/INACTIVE → ARCHIVED (Archive product — full confirmation)
//   ARCHIVED → ACTIVE (Restore product)
//   INACTIVE → ACTIVE (Reactivate product)
//
// No hard delete. No destructive action removes product data.
// ---------------------------------------------------------------------------

type LifecycleAction =
  | 'mark-inactive'
  | 'reactivate'
  | 'archive'
  | 'restore'

type ProductStatusConfirmDialogProps = {
  open: boolean
  product: ProductPreview
  action: LifecycleAction
  submitting?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const ACTION_META: Record<
  LifecycleAction,
  {
    title: (name: string) => string
    body: string
    confirmLabel: string
    destructive: boolean
  }
> = {
  'mark-inactive': {
    title: (name) => `Mark ${name} inactive?`,
    body: 'This keeps the product in your catalogue but marks it as inactive. You can reactivate it at any time.',
    confirmLabel: 'Mark inactive',
    destructive: false,
  },
  reactivate: {
    title: (name) => `Reactivate ${name}?`,
    body: 'The product will be set to active and will appear as available in your catalogue.',
    confirmLabel: 'Reactivate',
    destructive: false,
  },
  archive: {
    title: (name) => `Archive ${name}?`,
    body: 'The product will remain in Tteeka and can be restored at any time. Archiving does not remove any catalogue information.',
    confirmLabel: 'Archive product',
    destructive: true,
  },
  restore: {
    title: (name) => `Restore ${name}?`,
    body: 'The product will be set to active and will appear as available in your catalogue again.',
    confirmLabel: 'Restore product',
    destructive: false,
  },
}

export function ProductStatusConfirmDialog({
  open,
  product,
  action,
  submitting,
  onConfirm,
  onCancel,
}: ProductStatusConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const meta = ACTION_META[action]

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => cancelRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-status-title"
      aria-describedby="product-status-desc"
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onCancel}
      />
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
            meta.destructive
              ? 'bg-destructive/10 text-destructive'
              : 'bg-accent text-accent-foreground',
          )}>
            <AlertTriangle className="size-4" />
          </span>
          <div>
            <h2 id="product-status-title" className="font-semibold leading-snug">
              {meta.title(product.name)}
            </h2>
            <p id="product-status-desc" className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {meta.body}
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
              meta.destructive
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-primary hover:bg-primary/90',
            )}
          >
            {submitting
              ? `${meta.confirmLabel.replace(/^(\w)/, (c) => c)}…`
              : meta.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
