'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { X, PackagePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InventoryListItemPreview } from '@/lib/mock-inventory'
import { getVariantLabel } from '@/lib/mock-variants'
import { formatQuantity } from '@/lib/mock-inventory'

// ---------------------------------------------------------------------------
// ReceiveStockDialog
//
// Modal (desktop) / Full-height sheet (mobile) for receiving stock.
//
// Rules:
// - Quantity is required, integer > 0, digits only.
// - Note is optional.
// - Generates a single idempotency key per mount/submit cycle.
// - Shows safe BigInt projection of new AVAILABLE.
// ---------------------------------------------------------------------------

type ReceiveStockDialogProps = {
  open: boolean
  item: InventoryListItemPreview | null
  onClose: () => void
  onSubmit: (quantity: string, note: string, idempotencyKey: string) => Promise<void>
}

export function ReceiveStockDialog({
  open,
  item,
  onClose,
  onSubmit,
}: ReceiveStockDialogProps) {
  const [mounted, setMounted] = useState(false)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item || !quantity || quantity === '0' || isSubmitting) return

    setIsSubmitting(true)
    try {
      await onSubmit(quantity, note, idempotencyKeyRef.current)
      onClose()
    } catch (err) {
      setIsSubmitting(false)
    }
  }

  if (!mounted && !open) return null
  if (!item) return null

  const label = getVariantLabel(item.variant)
  const currentAvailable = item.physicalQuantity

  let projectedAvailable = currentAvailable
  try {
    if (quantity && quantity !== '0') {
      projectedAvailable = (BigInt(currentAvailable) + BigInt(quantity)).toString()
    }
  } catch {
    // Arithmetic error fallback
  }

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
        aria-labelledby="receive-stock-title"
      >
        <form onSubmit={handleSubmit} className="flex min-h-[50vh] flex-col sm:min-h-full">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
            <h2 id="receive-stock-title" className="flex items-center gap-2 text-lg font-semibold">
              <PackagePlus className="size-5" />
              Receive stock
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
              <p className="mt-1 font-mono text-sm text-muted-foreground">SKU: {item.variant.sku}</p>
            </div>

            {/* Inputs */}
            <div className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="receive-quantity" className="text-sm font-semibold">
                  Quantity received
                </label>
                <input
                  id="receive-quantity"
                  type="text"
                  inputMode="numeric"
                  value={quantity}
                  onChange={handleQuantityChange}
                  disabled={isSubmitting}
                  placeholder="0"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="receive-note" className="text-sm font-semibold">
                  Note <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="receive-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="e.g. Supplier delivery, Restock"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">
                  Optional reference or explanation for this receipt.
                </p>
              </div>
            </div>

            {/* Preview Math */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <h4 className="mb-3 text-sm font-semibold">Projected Balance</h4>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Physical stock</span>
                <span className="tabular-nums">{formatQuantity(currentAvailable)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-emerald-600 dark:text-emerald-400">
                <span>Receiving</span>
                <span className="tabular-nums">+{formatQuantity(quantity || '0')}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 font-semibold">
                <span>New physical stock</span>
                <span className="tabular-nums">{formatQuantity(projectedAvailable)}</span>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-border bg-card p-4 sm:px-6">
            <button
              type="submit"
              disabled={!quantity || quantity === '0' || isSubmitting}
              className="h-11 w-full rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? 'Receiving...' : 'Receive stock'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
