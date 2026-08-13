'use client'

// ---------------------------------------------------------------------------
// components/catalogue/variant-price-history-panel.tsx
//
// F4.3 Price History side panel (desktop) / full-height sheet (mobile).
//
// Requires: catalogue.price.manage (PRICING_MANAGE) — caller gates this panel.
//
// Rules:
//   • Append-only history — NO edit/delete/backdate controls.
//   • Ordered newest first (fixture and mutator both ensure this).
//   • Cost price shown (caller has price.manage permission).
//   • null cost → "Cost not recorded" (distinct from "0").
//   • "0" cost → formatted as "UGX 0" (was explicitly recorded as zero).
//   • Mixed currencies across history entries are expected/normal.
//   • No FX conversion. No profit/margin. No inventory.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react'
import { X, History, Clock } from 'lucide-react'
import { MoneyDisplay } from './money-display'
import { formatMoney, type VariantPriceHistoryPreview } from '@/lib/mock-pricing'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type VariantPriceHistoryPanelProps = {
  open: boolean
  variantLabel: string
  productName: string
  /** Ordered newest first. */
  history: VariantPriceHistoryPreview[]
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Helper — format datetime
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VariantPriceHistoryPanel({
  open,
  variantLabel,
  productName,
  history,
  onClose,
}: VariantPriceHistoryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop — visible on mobile/medium, hidden on large where it slides beside detail */}
      <div
        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[1px] lg:hidden"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-history-title"
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-2xl sm:w-[440px]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
              <History className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{productName}</p>
              <h2 id="price-history-title" className="font-semibold leading-tight">Price history</h2>
              <p className="text-xs text-muted-foreground truncate">{variantLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close price history"
            className="ml-2 shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* Immutability notice */}
          <p className="mb-4 text-xs text-muted-foreground">
            Price history is append-only and cannot be edited or deleted. Newest first.
          </p>

          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="mb-3 size-8 text-muted-foreground/50" aria-hidden="true" />
              <p className="font-semibold text-muted-foreground">No price history yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Price history will appear here once a price is set.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-3" aria-label="Price history records, newest first">
              {history.map((record, idx) => (
                <li
                  key={record.id}
                  className="rounded-xl border border-border bg-secondary/20 px-4 py-4"
                >
                  {/* Latest badge */}
                  {idx === 0 && (
                    <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-accent/70 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                      Latest
                    </span>
                  )}

                  {/* Selling price */}
                  <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Selling</span>
                    <span className="font-semibold tabular-nums">
                      <MoneyDisplay amount={record.sellingPrice} currency={record.currency} />
                    </span>

                    {/* Cost price — null vs "0" are semantically different */}
                    <span className="text-muted-foreground">Cost</span>
                    <span className="tabular-nums text-muted-foreground">
                      {record.costPrice === null ? (
                        <span className="italic">Cost not recorded</span>
                      ) : (
                        <MoneyDisplay amount={record.costPrice} currency={record.currency} />
                      )}
                    </span>

                    <span className="text-muted-foreground">Currency</span>
                    <span className="font-mono font-semibold">{record.currency}</span>
                  </div>

                  {/* Timestamp */}
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3 shrink-0" aria-hidden="true" />
                    <time dateTime={record.createdAt}>{formatDateTime(record.createdAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  )
}
