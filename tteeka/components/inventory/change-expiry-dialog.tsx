'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StockHoldPublicPreview } from '@/lib/mock-inventory'

type ChangeExpiryDialogProps = {
  open: boolean
  hold: StockHoldPublicPreview | null
  onClose: () => void
  onSubmit: (holdId: string, expiresAt: string) => Promise<void>
}

export function ChangeExpiryDialog({ open, hold, onClose, onSubmit }: ChangeExpiryDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && hold) {
      setMounted(true)
      setExpiresAt(new Date(hold.expiresAt).toISOString().slice(0, 16))
    } else if (!open) {
      const timer = setTimeout(() => {
        setMounted(false)
        setSubmitting(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open, hold])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open && !submitting) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, submitting])

  if (!mounted && !open) return null
  if (!hold) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expiresAt) return

    setSubmitting(true)
    const dateStr = new Date(expiresAt).toISOString()

    try {
      await onSubmit(hold.id, dateStr)
      onClose()
    } catch (err) {
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
          'fixed left-[50%] top-[50%] z-[60] w-full max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-2xl border border-border bg-card shadow-2xl transition-all duration-300',
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-expiry-title"
      >
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border p-6">
            <h2 id="change-expiry-title" className="text-lg font-semibold">Change Expiry</h2>
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
              disabled={submitting || !expiresAt}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
