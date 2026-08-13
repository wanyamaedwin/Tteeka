'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  canonicalizeSku,
  canonicalizeBarcode,
  isSKUTaken,
  isBarcodeTaken,
  type ProductVariantPreview,
  type VariantFormValues,
} from '@/lib/mock-variants'

// ---------------------------------------------------------------------------
// VariantFormDialog — Add / Edit a Product Variant
//
// Add mode:
//   - Fields empty. Status NOT shown — new Variants always start INACTIVE.
//   - A new Variant requires a current price to become ACTIVE (F4.3).
//   - SKU is required. Canonicalized to UPPERCASE on save.
//   - Barcode is optional. Preserved as string — leading zeros intact.
//
// Edit mode:
//   - Pre-fills existing sku, barcode, size, colour.
//   - id, merchantId, productId, status, createdAt NOT editable here.
//   - Dirty-state tracking — Save disabled when unchanged.
//
// Uniqueness checks performed client-side against the full merchant variant list.
// ---------------------------------------------------------------------------

type VariantFormMode = 'add' | 'edit'

type VariantFormDialogProps = {
  open: boolean
  mode: VariantFormMode
  existing?: ProductVariantPreview      // required for edit
  allMerchantVariants: ProductVariantPreview[]   // for merchant-wide uniqueness check
  submitting?: boolean
  onSave: (values: VariantFormValues) => void
  onCancel: () => void
}

export function VariantFormDialog({
  open,
  mode,
  existing,
  allMerchantVariants,
  submitting,
  onSave,
  onCancel,
}: VariantFormDialogProps) {
  const skuRef = useRef<HTMLInputElement>(null)

  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [size, setSize] = useState('')
  const [colour, setColour] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset on open
  useEffect(() => {
    if (open) {
      setSku(mode === 'edit' ? (existing?.sku ?? '') : '')
      setBarcode(mode === 'edit' ? (existing?.barcode ?? '') : '')
      setSize(mode === 'edit' ? (existing?.size ?? '') : '')
      setColour(mode === 'edit' ? (existing?.colour ?? '') : '')
      setErrors({})
      setTimeout(() => skuRef.current?.focus(), 30)
    }
  }, [open, mode, existing?.sku, existing?.barcode, existing?.size, existing?.colour])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  // Canonical values
  const canonicalSku = canonicalizeSku(sku)
  const canonicalBarcode = canonicalizeBarcode(barcode)
  const trimmedSize = size.trim() || null
  const trimmedColour = colour.trim() || null

  // Dirty detection for edit mode
  const isDirty = mode === 'add'
    ? sku.trim() !== ''
    : canonicalSku !== (existing?.sku ?? '') ||
      (canonicalBarcode ?? '') !== (existing?.barcode ?? '') ||
      (trimmedSize ?? '') !== (existing?.size ?? '') ||
      (trimmedColour ?? '') !== (existing?.colour ?? '')

  function validate(): boolean {
    const errs: Record<string, string> = {}

    if (!canonicalSku) {
      errs.sku = 'SKU is required.'
    } else if (isSKUTaken(allMerchantVariants, canonicalSku, existing?.id)) {
      errs.sku = 'This SKU is already used by another variant.'
    }

    if (canonicalBarcode && isBarcodeTaken(allMerchantVariants, canonicalBarcode, existing?.id)) {
      errs.barcode = 'This barcode is already used by another variant.'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSave({ sku: canonicalSku, barcode: barcode, size: size, colour: colour })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="variant-form-title"
    >
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={onCancel} />
      <div className="relative flex w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-2xl"
        style={{ maxHeight: 'min(96vh, 680px)' }}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 id="variant-form-title" className="font-semibold">
            {mode === 'add' ? 'Add variant' : 'Edit variant'}
          </h2>
          <button type="button" onClick={onCancel} disabled={submitting} aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-50">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate id="variant-form" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {mode === 'add' && (
              <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                New variants start as <span className="font-semibold text-foreground">Inactive</span>. A current price must be set before a variant can be activated.
              </div>
            )}

            {/* SKU */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="variant-sku" className="text-sm font-semibold">
                SKU <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <input
                ref={skuRef}
                id="variant-sku"
                type="text"
                value={sku}
                onChange={(e) => { setSku(e.target.value); setErrors((prev) => ({ ...prev, sku: '' })) }}
                disabled={submitting}
                placeholder="e.g. DS-OXF-WHT-M"
                aria-required="true"
                aria-invalid={!!errors.sku}
                aria-describedby={errors.sku ? 'variant-sku-error' : 'variant-sku-hint'}
                className={cn(
                  'h-11 w-full rounded-lg border bg-background px-3.5 font-mono text-sm uppercase tracking-wide outline-none transition-colors focus:ring-2 focus:ring-ring/30',
                  errors.sku ? 'border-destructive' : 'border-input focus:border-ring',
                  submitting && 'opacity-60',
                )}
              />
              {errors.sku ? (
                <p id="variant-sku-error" role="alert" className="text-xs text-destructive">{errors.sku}</p>
              ) : (
                <p id="variant-sku-hint" className="text-xs text-muted-foreground">
                  A unique code for this variant. Will be saved in uppercase (e.g. DS-OXF-WHT-M).
                </p>
              )}
            </div>

            {/* Barcode */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="variant-barcode" className="text-sm font-semibold">
                Barcode <span className="text-muted-foreground font-normal text-xs">(optional)</span>
              </label>
              <input
                id="variant-barcode"
                type="text"
                inputMode="numeric"
                value={barcode}
                onChange={(e) => { setBarcode(e.target.value); setErrors((prev) => ({ ...prev, barcode: '' })) }}
                disabled={submitting}
                placeholder="e.g. 600123450001"
                aria-invalid={!!errors.barcode}
                aria-describedby={errors.barcode ? 'variant-barcode-error' : 'variant-barcode-hint'}
                className={cn(
                  'h-11 w-full rounded-lg border bg-background px-3.5 font-mono text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/30',
                  errors.barcode ? 'border-destructive' : 'border-input focus:border-ring',
                  submitting && 'opacity-60',
                )}
              />
              {errors.barcode ? (
                <p id="variant-barcode-error" role="alert" className="text-xs text-destructive">{errors.barcode}</p>
              ) : (
                <p id="variant-barcode-hint" className="text-xs text-muted-foreground">
                  Optional barcode. Stored exactly as entered — leading zeros are preserved.
                </p>
              )}
            </div>

            {/* Size / Colour row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="variant-size" className="text-sm font-semibold">
                  Size <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </label>
                <input
                  id="variant-size"
                  type="text"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. M, L, 42"
                  aria-describedby="variant-size-hint"
                  className={cn(
                    'h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30',
                    submitting && 'opacity-60',
                  )}
                />
                <p id="variant-size-hint" className="text-xs text-muted-foreground">Free-form label</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="variant-colour" className="text-sm font-semibold">
                  Colour <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </label>
                <input
                  id="variant-colour"
                  type="text"
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. White, Navy"
                  aria-describedby="variant-colour-hint"
                  className={cn(
                    'h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30',
                    submitting && 'opacity-60',
                  )}
                />
                <p id="variant-colour-hint" className="text-xs text-muted-foreground">Free-form label</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} disabled={submitting}
              className="h-11 rounded-lg border border-border px-5 text-sm font-semibold hover:bg-secondary disabled:opacity-50 sm:h-10">
              Cancel
            </button>
            <button type="submit" form="variant-form"
              disabled={!canonicalSku || (mode === 'edit' && !isDirty) || submitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 sm:h-10">
              {submitting
                ? <><Loader2 className="size-4 animate-spin" />{mode === 'add' ? 'Adding…' : 'Saving…'}</>
                : mode === 'add' ? 'Add variant' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
