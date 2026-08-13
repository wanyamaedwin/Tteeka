'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Calendar as CalendarIcon, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InventoryListItemPreview } from '@/lib/mock-inventory'

type HoldStockModalProps = {
  open: boolean
  item: InventoryListItemPreview | null
  onClose: () => void
  onSubmit: (quantity: string, expiresAt: string, idempotencyKey: string) => Promise<void>
}

export function HoldStockModal({ open, item, onClose, onSubmit }: HoldStockModalProps) {
  const [mounted, setMounted] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKeyRef = useRef<string>('')

  useEffect(() => {
    if (open) {
      setMounted(true)
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        idempotencyKeyRef.current = crypto.randomUUID()
      } else {
        idempotencyKeyRef.current = `hold_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      }
    } else {
      const timer = setTimeout(() => {
        setMounted(false)
        setQuantity('')
        setExpiresAt('')
        setSubmitting(false)
        idempotencyKeyRef.current = ''
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open && !submitting) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, submitting])

  if (!mounted && !open) return null
  if (!item) return null

  const sellable = BigInt(item.sellableQuantity || '0')
  const reqQty = BigInt(quantity || '0')
  const remaining = sellable - reqQty

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quantity || !expiresAt) return

    setSubmitting(true)
    const idempotencyKey = idempotencyKeyRef.current

    const dateStr = new Date(expiresAt).toISOString()

    try {
      await onSubmit(quantity, dateStr, idempotencyKey)
      setQuantity('')
      setExpiresAt('')
      onClose()
    } catch (err) {
      // Error handled by parent, idempotencyKeyRef remains stable for retry
      setSubmitting(false)
    }
  }

  const nowStr = new Date().toISOString().slice(0, 16)

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={() => !submitting && onClose()}
        aria-hidden="true"
      />

      <div
        className={cn(
          'fixed left-[50%] top-[50%] z-[60] w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300',
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hold-stock-title"
      >
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border p-6">
            <h2 id="hold-stock-title" className="text-lg font-semibold">Hold Stock</h2>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-4 rounded-xl border border-border bg-secondary/30 p-4">
              <div>
                <label className="text-sm font-semibold text-muted-foreground">Sellable now</label>
                <div className="text-2xl font-bold">{item.sellableQuantity}</div>
              </div>

              <div className="space-y-1">
                <label htmlFor="quantity" className="text-sm font-semibold">
                  Quantity to hold
                </label>
                <input
                  id="quantity"
                  type="number"
                  min="1"
                  step="1"
                  required
                  disabled={submitting}
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
                  placeholder="e.g. 4"
                />
              </div>

              {quantity && (
                <div className={cn("text-sm", remaining < 0 ? "text-destructive font-semibold" : "text-muted-foreground")}>
                  After hold: <span className="font-semibold">{remaining.toString()}</span> available to sell
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="expiresAt" className="text-sm font-semibold">
                Hold Until
              </label>
              <input
                id="expiresAt"
                type="datetime-local"
                min={nowStr}
                required
                disabled={submitting}
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !quantity || !expiresAt || remaining < 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {submitting ? 'Holding...' : 'Hold Stock'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
