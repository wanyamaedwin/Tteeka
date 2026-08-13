'use client'

import { useState } from 'react'
import { MoreHorizontal, AlertCircle, Clock, X, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StockHoldPublicPreview, StockHoldStatus } from '@/lib/mock-inventory'
import { formatQuantity } from '@/lib/mock-inventory'

type FilterOption = 'All' | 'Active' | 'Released' | 'Expired'

type StockHoldsListProps = {
  holds: StockHoldPublicPreview[]
  canManage: boolean
  onRelease: (hold: StockHoldPublicPreview) => void
  onChangeExpiry: (hold: StockHoldPublicPreview) => void
}

function HoldStatusBadge({ status }: { status: StockHoldStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        status === 'ACTIVE' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        status === 'RELEASED' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        status === 'EXPIRED' && 'bg-secondary text-muted-foreground',
      )}
    >
      {status === 'ACTIVE' ? 'Active' : status === 'RELEASED' ? 'Released' : 'Expired'}
    </span>
  )
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const diffHours = diff / (1000 * 60 * 60)

  if (diffHours > 0 && diffHours < 24) {
    if (diffHours < 1) return 'in less than an hour'
    return `in ${Math.floor(diffHours)} hours`
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function StockHoldsList({ holds, canManage, onRelease, onChangeExpiry }: StockHoldsListProps) {
  const [filter, setFilter] = useState<FilterOption>('All')
  const [selectedHold, setSelectedHold] = useState<StockHoldPublicPreview | null>(null)

  const filteredHolds = holds.filter(h => filter === 'All' || h.status.toUpperCase() === filter.toUpperCase())

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Stock Holds</h4>
        <div className="flex space-x-1 rounded-lg bg-secondary/50 p-1">
          {(['All', 'Active', 'Released', 'Expired'] as FilterOption[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                filter === f
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:bg-background/50'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filteredHolds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Clock className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-semibold">No {filter === 'All' ? 'stock holds' : `${filter.toLowerCase()} holds`} yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Held stock will appear here when units are temporarily reserved.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHolds.map(hold => {
            const isManagedByOrder = false // Stub for order linkage check

            return (
              <div
                key={hold.id}
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/40"
              >
                <div className="flex items-start justify-between">
                  <div
                    className="space-y-1 cursor-pointer flex-1"
                    onClick={() => setSelectedHold(hold)}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-bold tabular-nums">{formatQuantity(hold.quantity)}</span>
                      <span className="text-sm text-muted-foreground">units held</span>
                      <HoldStatusBadge status={hold.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {hold.status === 'ACTIVE' ? (
                        <span>Expires {formatRelativeTime(hold.expiresAt)}</span>
                      ) : hold.status === 'EXPIRED' ? (
                        <span>Expired: {new Date(hold.expiredAt || hold.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      ) : (
                        <span>Released: {new Date(hold.releasedAt || '').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setSelectedHold(hold)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      title="View details"
                      aria-label="View hold details"
                    >
                      <Info className="size-4" />
                    </button>

                    {canManage && hold.status === 'ACTIVE' && (
                      <>
                        {isManagedByOrder ? (
                          <div className="group relative">
                            <AlertCircle className="size-4 text-muted-foreground" />
                            <div className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-56 opacity-0 transition-opacity group-hover:opacity-100 bg-popover text-popover-foreground text-xs p-2 rounded shadow-md border border-border">
                              This stock hold is controlled by an order and cannot be changed here.
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 sm:flex-row">
                            <button
                              onClick={() => onChangeExpiry(hold)}
                              className="rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary"
                            >
                              Change Expiry
                            </button>
                            <button
                              onClick={() => onRelease(hold)}
                              className="rounded border border-border px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
                            >
                              Release Hold
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Hold Detail Dialog */}
      {selectedHold && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm"
            onClick={() => setSelectedHold(null)}
            aria-hidden="true"
          />
          <div
            className="fixed left-[50%] top-[50%] z-[70] w-full max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hold-detail-title"
          >
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h3 id="hold-detail-title" className="font-semibold text-lg">Stock Hold Details</h3>
              <button
                type="button"
                onClick={() => setSelectedHold(null)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-border/50">
                <dt className="text-muted-foreground">Status</dt>
                <dd><HoldStatusBadge status={selectedHold.status} /></dd>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <dt className="text-muted-foreground">Quantity</dt>
                <dd className="font-bold tabular-nums">{formatQuantity(selectedHold.quantity)} units</dd>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="tabular-nums">{new Date(selectedHold.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <dt className="text-muted-foreground">Expires</dt>
                <dd className="tabular-nums">{new Date(selectedHold.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
              </div>
              {selectedHold.releasedAt && (
                <div className="flex justify-between py-1 border-b border-border/50">
                  <dt className="text-muted-foreground">Released At</dt>
                  <dd className="tabular-nums">{new Date(selectedHold.releasedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
                </div>
              )}
              {selectedHold.expiredAt && (
                <div className="flex justify-between py-1 border-b border-border/50">
                  <dt className="text-muted-foreground">Expired At</dt>
                  <dd className="tabular-nums">{new Date(selectedHold.expiredAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
                </div>
              )}
            </dl>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedHold(null)}
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/80"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
