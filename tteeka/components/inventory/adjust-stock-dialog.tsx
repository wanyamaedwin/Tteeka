'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { X, ArrowRightLeft, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InventoryListItemPreview, InventoryMovementType } from '@/lib/mock-inventory'
import { getVariantLabel } from '@/lib/mock-variants'
import { formatQuantity } from '@/lib/mock-inventory'

// ---------------------------------------------------------------------------
// AdjustStockDialog
//
// Modal (desktop) / Full-height sheet (mobile) for adjusting stock.
// Covers both ADJUSTMENT_IN and ADJUSTMENT_OUT.
//
// Rules:
// - Note is REQUIRED.
// - ADJUSTMENT_OUT prevents balanceAfter < 0.
// - Generates a single idempotency key per mount/submit cycle.
// ---------------------------------------------------------------------------

type AdjustStockDialogProps = {
  open: boolean
  item: InventoryListItemPreview | null
  onClose: () => void
  onSubmit: (type: InventoryMovementType, quantity: string, note: string, idempotencyKey: string) => Promise<void>
}

export function AdjustStockDialog({
  open,
  item,
  onClose,
  onSubmit,
}: AdjustStockDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const idempotencyKeyRef = useRef<string>('')

  // Generate key on open
  useEffect(() => {
    if (open) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        idempotencyKeyRef.current = crypto.randomUUID()
      } else {
        idempotencyKeyRef.current = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      }
      setMounted(true)
    } else {
      const timer = setTimeout(() => {
        setMounted(false)
        setDirection('add')
        setQuantity('')
        setNote('')
        setIsSubmitting(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open && !isSubmitting) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, isSubmitting])

  const handleQuantityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Digits only
    const val = e.target.value.replace(/\D/g, '')
    // Remove leading zeros unless it's just "0"
    const cleaned = val.replace(/^0+/, '') || (val === '0' ? '0' : '')
    setQuantity(cleaned)
  }, [])

  const currentAvailable = item?.physicalQuantity || '0'

  let projectedAvailable = currentAvailable
  let isNegativeStock = false

  try {
    const currentN = BigInt(currentAvailable)
    const qtyN = BigInt(quantity || '0')

    if (direction === 'add') {
      projectedAvailable = (currentN + qtyN).toString()
    } else {
      if (currentN < qtyN) {
        isNegativeStock = true
        projectedAvailable = '0' // clamped for display
      } else {
        projectedAvailable = (currentN - qtyN).toString()
      }
    }
  } catch {
    // Arithmetic error fallback
  }

  const isFormValid =
    quantity &&
    quantity !== '0' &&
    note.trim().length > 0 &&
    !isNegativeStock &&
    !isSubmitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item || !isFormValid) return

    setIsSubmitting(true)
    const type = direction === 'add' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT'
    try {
      await onSubmit(type, quantity, note, idempotencyKeyRef.current)
      onClose()
    } catch (err) {
      setIsSubmitting(false)
    }
  }

  if (!mounted && !open) return null
  if (!item) return null

  const label = getVariantLabel(item.variant)

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={() => !isSubmitting && onClose()}
        aria-hidden="true"
      />

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 w-full overflow-y-auto rounded-t-2xl border-t border-border bg-card shadow-2xl transition-transform duration-300 ease-in-out sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0',
          open ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-stock-title"
      >
        <form onSubmit={handleSubmit} className="flex min-h-[60vh] flex-col sm:min-h-full">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
            <h2 id="adjust-stock-title" className="flex items-center gap-2 text-lg font-semibold">
              <ArrowRightLeft className="size-5 text-muted-foreground" />
              Adjust stock
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 space-y-8 p-6">
            {/* Context Header */}
            <div>
              <p className="text-sm font-semibold text-muted-foreground">{item.product.name}</p>
              <h3 className="mt-1 font-serif text-3xl font-bold">{label}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Use adjustments to correct the available quantity when the recorded stock does not match the real stock.
              </p>
            </div>

            {/* Inputs */}
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-semibold">Adjustment direction</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDirection('add')}
                    className={cn(
                      'rounded-xl border p-3 text-center text-sm font-semibold transition-colors',
                      direction === 'add'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/50 dark:text-emerald-400'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    Add stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('remove')}
                    className={cn(
                      'rounded-xl border p-3 text-center text-sm font-semibold transition-colors',
                      direction === 'remove'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-rose-500/50 dark:text-rose-400'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    Remove stock
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="adjust-quantity" className="text-sm font-semibold">
                  Quantity to {direction === 'add' ? 'add' : 'remove'}
                </label>
                <input
                  id="adjust-quantity"
                  type="text"
                  inputMode="numeric"
                  value={quantity}
                  onChange={handleQuantityChange}
                  disabled={isSubmitting}
                  placeholder="0"
                  className={cn(
                    "h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/30 disabled:opacity-50",
                    isNegativeStock ? "border-destructive focus:border-destructive" : "border-input focus:border-ring"
                  )}
                  required
                />
                {isNegativeStock && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-destructive mt-2">
                    <AlertTriangle className="size-3.5" />
                    You can't remove more stock than is currently available.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="adjust-note" className="text-sm font-semibold">
                  Reason <span className="font-normal text-muted-foreground">(required)</span>
                </label>
                <input
                  id="adjust-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="e.g. Stock count correction"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
                  required
                />
              </div>
            </div>

            {/* Preview Math */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <h4 className="mb-3 text-sm font-semibold">Projected Balance</h4>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current available</span>
                <span className="tabular-nums">{formatQuantity(currentAvailable)}</span>
              </div>
              <div className={cn(
                "mt-2 flex items-center justify-between text-sm",
                direction === 'add' ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}>
                <span>{direction === 'add' ? 'Adding' : 'Removing'}</span>
                <span className="tabular-nums">
                  {direction === 'add' ? '+' : '-'}{formatQuantity(quantity || '0')}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 font-semibold">
                <span>New available</span>
                <span className="tabular-nums">{formatQuantity(projectedAvailable)}</span>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-border bg-card p-4 sm:px-6">
            <button
              type="submit"
              disabled={!isFormValid}
              className="h-11 w-full rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? 'Adjusting...' : 'Adjust stock'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
