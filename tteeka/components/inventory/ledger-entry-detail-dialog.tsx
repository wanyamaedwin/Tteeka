'use client'

import { useEffect, useState } from 'react'
import { X, ArrowRight, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InventoryLedgerEntryPublicPreview } from '@/lib/mock-inventory'
import { formatQuantity } from '@/lib/mock-inventory'

// ---------------------------------------------------------------------------
// LedgerEntryDetailDialog
//
// Read-only detail drawer for a specific ledger entry.
//
// Rules:
// - Implements strict immutability (no edit/save).
// - Displays exact balance string snapshots.
// - Redacted internal keys (they are omitted from PublicPreview anyway).
// ---------------------------------------------------------------------------

type LedgerEntryDetailDialogProps = {
  entry: InventoryLedgerEntryPublicPreview | null
  onClose: () => void
}

export function LedgerEntryDetailDialog({
  entry,
  onClose,
}: LedgerEntryDetailDialogProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (entry) {
      setMounted(true)
    } else {
      const timer = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(timer)
    }
  }, [entry])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && entry) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [entry, onClose])

  if (!mounted && !entry) return null

  // Resolve active data or fade out stale data
  const data = entry

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity duration-300',
          entry ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 w-full overflow-y-auto rounded-t-2xl border-t border-border bg-card shadow-2xl transition-transform duration-300 ease-in-out sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0',
          entry ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ledger-detail-title"
      >
        <div className="flex min-h-[50vh] flex-col sm:min-h-full">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
            <h2 id="ledger-detail-title" className="flex items-center gap-2 text-lg font-semibold">
              <Activity className="size-5" />
              Movement details
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          {data && (
            <div className="flex-1 space-y-8 p-6">
              {/* Primary Label */}
              <div>
                <h3 className="font-serif text-3xl font-bold">
                  {data.movementType === 'RECEIPT' && 'Stock received'}
                  {data.movementType === 'ADJUSTMENT_IN' && 'Stock added'}
                  {data.movementType === 'ADJUSTMENT_OUT' && 'Stock removed'}
                </h3>
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  ID: {data.id}
                </p>
                {data.movementType.startsWith('ADJUSTMENT') && (
                  <span className="mt-3 inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                    Adjustment
                  </span>
                )}
              </div>

              {/* Data Grid */}
              <div className="space-y-6">
                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-semibold text-muted-foreground">Date & time</dt>
                    <dd className="mt-1 text-sm">
                      {new Intl.DateTimeFormat('en-UG', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'Africa/Kampala',
                      }).format(new Date(data.createdAt))}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-sm font-semibold text-muted-foreground">Type</dt>
                    <dd className="mt-1 font-mono text-sm">{data.movementType}</dd>
                  </div>

                  <div>
                    <dt className="text-sm font-semibold text-muted-foreground">Quantity</dt>
                    <dd className={cn(
                      "mt-1 text-sm font-semibold tabular-nums",
                      data.movementType === 'ADJUSTMENT_OUT'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    )}>
                      {data.movementType === 'ADJUSTMENT_OUT' ? '-' : '+'}
                      {formatQuantity(data.quantity)}
                    </dd>
                  </div>

                  <div className="sm:col-span-2">
                    <dt className="text-sm font-semibold text-muted-foreground">Note</dt>
                    <dd className={cn(
                      "mt-1 text-sm",
                      !data.note && "italic text-muted-foreground"
                    )}>
                      {data.note || 'No note'}
                    </dd>
                  </div>
                </dl>

                {/* State Transition */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <h4 className="text-sm font-semibold">Balance Transition</h4>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Before</span>
                      <span className="font-semibold tabular-nums">{formatQuantity(data.balanceBefore)}</span>
                      <span className="text-xs text-muted-foreground">{data.fromState || '—'}</span>
                    </div>
                    <ArrowRight className="size-5 text-muted-foreground" />
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-muted-foreground">After</span>
                      <span className="font-semibold tabular-nums">{formatQuantity(data.balanceAfter)}</span>
                      <span className="text-xs text-muted-foreground">{data.toState || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
