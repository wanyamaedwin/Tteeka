'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StockHoldPublicPreview } from '@/lib/mock-inventory'

type ReleaseHoldDialogProps = {
  open: boolean
  hold: StockHoldPublicPreview | null
  onClose: () => void
  onSubmit: (holdId: string) => Promise<void>
}

export function ReleaseHoldDialog({ open, hold, onClose, onSubmit }: ReleaseHoldDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
    } else {
      const timer = setTimeout(() => {
        setMounted(false)
        setSubmitting(false)
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
  if (!hold) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setSubmitting(true)

    try {
      await onSubmit(hold.id)
      onClose()
    } catch (err) {
      setSubmitting(false)
    }
  }

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
        aria-labelledby="release-hold-title"
      >
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border p-6">
            <h2 id="release-hold-title" className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Release this stock hold?
            </h2>
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

          <div className="p-6">
            <p className="text-sm text-muted-foreground">
              The held units will immediately become available to sell again.
            </p>
          </div>

          <div className="flex justify-end gap-3 p-6 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50"
            >
              Keep Hold
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {submitting ? 'Releasing...' : 'Release Stock'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
