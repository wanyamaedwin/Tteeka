'use client'

// ---------------------------------------------------------------------------
// components/catalogue/variant-price-form.tsx
//
// F4.3 Set Price / Change Price dialog (desktop) and full-height sheet (mobile).
//
// Permissions required by caller:
//   catalogue.price.manage (PRICING_MANAGE) — caller gates this form.
//
// Rules:
//   • Currency is READ-ONLY — snapshotted from current Merchant business settings.
//   • Selling price is REQUIRED, integer > 0.
//   • Cost price is OPTIONAL, integer >= 0. Blank → null.
//   • Dirty state: Save disabled if nothing changed for existing price.
//   • Identical update (same amounts + same currency): caller treats as no-op.
//   • Currency-change warning: shown when existing price currency ≠ current Merchant currency.
//   • No float input, no comma input, no Number coercion.
//   • F4.3 only: no discount, tax, UOM, profit/margin fields.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, AlertTriangle, Info, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MoneyInput } from './money-input'
import {
  validateSellingPrice,
  validateCostPrice,
  isPriceIdentical,
  canonicalizePriceString,
  type VariantCurrentPricePreview,
  type PriceFormValues,
} from '@/lib/mock-pricing'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type VariantPriceFormProps = {
  open: boolean
  /** 'set' = initial price (unpriced Variant). 'change' = update existing price. */
  mode: 'set' | 'change'
  /** Existing current price — only for mode='change'. */
  existing?: VariantCurrentPricePreview | null
  /** Variant label for display ("M / White", "Standard variant"). */
  variantLabel: string
  /** Current Merchant business currency code (e.g. "UGX"). Snapshotted on save. */
  merchantCurrency: string
  /** Full currency label (e.g. "UGX — Ugandan Shilling"). */
  merchantCurrencyLabel: string
  /** Whether the user has settings read access (to show Business Settings link). */
  canReadSettings?: boolean
  onSave: (sellingPrice: string, costPrice: string | null) => Promise<void>
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VariantPriceForm({
  open,
  mode,
  existing,
  variantLabel,
  merchantCurrency,
  merchantCurrencyLabel,
  canReadSettings,
  onSave,
  onCancel,
}: VariantPriceFormProps) {
  // ── Form state ────────────────────────────────────────────────────────────
  const [sellingPrice, setSellingPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [sellingError, setSellingError] = useState<string | null>(null)
  const [costError, setCostError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const firstInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // ── Prefill on open ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    if (mode === 'change' && existing) {
      setSellingPrice(existing.sellingPrice)
      setCostPrice(existing.costPrice ?? '')
    } else {
      setSellingPrice('')
      setCostPrice('')
    }
    setSellingError(null)
    setCostError(null)
    setSubmitting(false)
    setTimeout(() => firstInputRef.current?.focus(), 50)
  }, [open, mode, existing])

  // ── Keyboard escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  // ── Currency change warning ───────────────────────────────────────────────
  const showCurrencyChangeWarning =
    mode === 'change' &&
    existing != null &&
    existing.currency !== merchantCurrency

  // ── Dirty / identical detection ───────────────────────────────────────────
  const isIdentical =
    mode === 'change' &&
    existing != null &&
    isPriceIdentical(existing, sellingPrice, costPrice, merchantCurrency)

  const isDirty =
    mode === 'set'
      ? sellingPrice.trim() !== ''
      : !isIdentical

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): boolean {
    const sErr = validateSellingPrice(sellingPrice)
    const cErr = validateCostPrice(costPrice)
    setSellingError(sErr)
    setCostError(cErr)
    return !sErr && !cErr
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    if (isIdentical) return // no-op guard

    const canonical = canonicalizePriceString(sellingPrice)
    const canonicalCost = costPrice.trim() === '' ? null : canonicalizePriceString(costPrice.trim())

    setSubmitting(true)
    try {
      await onSave(canonical, canonicalCost)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Save button state ─────────────────────────────────────────────────────
  const saveDisabled = submitting || !isDirty || isIdentical

  // ── Labels ────────────────────────────────────────────────────────────────
  const title = mode === 'set' ? 'Set price' : 'Change price'
  const saveLabel = mode === 'set' ? 'Set price' : 'Update price'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onCancel}
      />

      {/* Panel — full-height sheet on mobile, centered dialog on desktop */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-form-title"
        className={cn(
          'fixed z-50 flex flex-col bg-card shadow-2xl',
          // Mobile: full-height sheet from bottom
          'bottom-0 left-0 right-0 max-h-[96vh] rounded-t-2xl border border-border',
          // Desktop: centered modal
          'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-[440px] sm:rounded-2xl',
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <DollarSign className="size-4" />
            </span>
            <div>
              <h2 id="price-form-title" className="font-semibold">{title}</h2>
              <p className="text-xs text-muted-foreground">{variantLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close price form"
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <form
          id="price-form"
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5"
          noValidate
        >
          {/* Currency change warning */}
          {showCurrencyChangeWarning && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div className="text-sm leading-5">
                <p className="font-semibold text-amber-800 dark:text-amber-300">Business currency changed</p>
                <p className="mt-1 text-amber-700 dark:text-amber-400">
                  Your business currency is now <strong>{merchantCurrency}</strong>.
                  Saving this price update will create a new {merchantCurrency} price snapshot.
                  The existing {existing?.currency} price history will remain unchanged.
                </p>
                <p className="mt-1 font-medium text-amber-700 dark:text-amber-400">
                  Enter the new amount in {merchantCurrency} — no conversion is performed.
                </p>
              </div>
            </div>
          )}

          {/* Selling price */}
          <MoneyInput
            ref={firstInputRef}
            id="price-form-selling"
            label="Selling price"
            value={sellingPrice}
            onChange={(v) => { setSellingPrice(v); setSellingError(null) }}
            currency={merchantCurrency}
            hint="Enter the whole number amount (e.g. 85000). No decimals."
            error={sellingError}
            required
            placeholder="85000"
          />

          {/* Cost price */}
          <MoneyInput
            id="price-form-cost"
            label="Cost price"
            value={costPrice}
            onChange={(v) => { setCostPrice(v); setCostError(null) }}
            currency={merchantCurrency}
            hint="Optional. Leave blank if not tracking cost. Enter 0 for zero cost."
            error={costError}
            placeholder="Optional"
          />

          {/* Currency info row */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="text-sm leading-5 text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">Currency: </span>
                {merchantCurrencyLabel}
              </p>
              <p className="mt-1">
                Prices are saved using the business currency configured in Business Settings.
              </p>
              {canReadSettings && (
                <a
                  href="/app/business/settings"
                  className="mt-1 inline-block font-semibold text-primary hover:underline"
                  tabIndex={0}
                >
                  Business settings ↗
                </a>
              )}
            </div>
          </div>

          {/* Identical update notice */}
          {isIdentical && mode === 'change' && (
            <p className="text-sm text-muted-foreground" role="status">
              The price values are unchanged. Modify at least one field to save an update.
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex shrink-0 gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-10 flex-1 rounded-lg border border-border px-4 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="price-form"
            disabled={saveDisabled}
            aria-disabled={saveDisabled}
            className="h-10 flex-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </>
  )
}
