'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getVariantLabel, type ProductVariantPreview } from '@/lib/mock-variants'

// ---------------------------------------------------------------------------
// VariantStatusConfirmDialog
//
// Confirmation dialogs for Variant lifecycle transitions:
//   ACTIVE → INACTIVE (Mark inactive)
//   ACTIVE/INACTIVE → ARCHIVED (Archive)
//   ARCHIVED → INACTIVE (Restore as inactive — NOT ACTIVE, price required)
//
// No hard delete. No ARCHIVED → ACTIVE activation bypass.
// ---------------------------------------------------------------------------

type VariantLifecycleAction = 'mark-inactive' | 'archive' | 'restore-as-inactive'

type VariantStatusConfirmDialogProps = {
  open: boolean
  variant: ProductVariantPreview
  action: VariantLifecycleAction
  submitting?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const ACTION_META: Record<VariantLifecycleAction, {
  title: (label: string) => string
  body: string
  confirmLabel: string
  destructive: boolean
}> = {
  'mark-inactive': {
    title: (label) => `Mark ${label} inactive?`,
    body: 'This variant will be set to inactive. A current price is required before it can be activated again.',
    confirmLabel: 'Mark inactive',
    destructive: false,
  },
  archive: {
    title: (label) => `Archive this variant?`,
    body: 'The variant will remain in Tteeka and its identity will be preserved. It can be restored at any time.',
    confirmLabel: 'Archive variant',
    destructive: true,
  },
  'restore-as-inactive': {
    title: (label) => `Restore ${label}?`,
    body: 'The variant will be restored as inactive. A current price must be set before it can be activated.',
    confirmLabel: 'Restore as inactive',
    destructive: false,
  },
}

export function VariantStatusConfirmDialog({
  open,
  variant,
  action,
  submitting,
  onConfirm,
  onCancel,
}: VariantStatusConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const label = getVariantLabel(variant)
  const meta = ACTION_META[action]

  useEffect(() => {
    if (open) setTimeout(() => cancelRef.current?.focus(), 30)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="variant-confirm-title" aria-describedby="variant-confirm-desc">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button type="button" onClick={onCancel} disabled={submitting} aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-50">
          <X className="size-4" />
        </button>

        <div className="mb-4 flex items-start gap-3">
          <span className={cn(
            'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',
            meta.destructive ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground',
          )}>
            <AlertTriangle className="size-4" />
          </span>
          <div>
            <h2 id="variant-confirm-title" className="font-semibold leading-snug">{meta.title(label)}</h2>
            <p id="variant-confirm-desc" className="mt-1.5 text-sm leading-6 text-muted-foreground">{meta.body}</p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={submitting}
            className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={submitting}
            className={cn(
              'h-10 rounded-lg px-4 text-sm font-semibold text-white transition-colors disabled:opacity-50',
              meta.destructive ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90',
            )}>
            {submitting ? `${meta.confirmLabel}…` : meta.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
