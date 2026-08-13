'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, ExternalLink, CalendarDays, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InventoryListItemPreview } from '@/lib/mock-inventory'
import { getVariantLabel } from '@/lib/mock-variants'
import { InventoryVariantStatusBadge, QuantityDisplay } from './inventory-list'
import { useStockHolds, useStockHoldMutations } from '@/lib/hooks/use-stock-holds'
import { StockHoldsList } from './stock-holds-list'
import { useMerchantWorkspace } from '../merchant-workspace-provider'

// ---------------------------------------------------------------------------
// InventoryDetailPanel
//
// Desktop: right slide-in sheet.
// Mobile: full-height sheet.
//
// Displays the selected InventoryListItemPreview.
// Includes a "View variant" link if the user has catalogue.read.
// Shows the AVAILABLE quantity prominently.
// Does NOT show stock movement actions or ledger (F5.1 constraint).
// ---------------------------------------------------------------------------

type InventoryDetailPanelProps = {
  open: boolean
  item: InventoryListItemPreview
  /** If true, shows the "View variant" navigation link */
  canReadCatalogue: boolean
  canManage: boolean
  onClose: () => void
  onReceive: (item: InventoryListItemPreview) => void
  onAdjust: (item: InventoryListItemPreview) => void
  onHold: (item: InventoryListItemPreview) => void
  onChangeExpiry?: (hold: import('@/lib/mock-inventory').StockHoldPublicPreview) => void
  onReleaseHold?: (hold: import('@/lib/mock-inventory').StockHoldPublicPreview) => void
}

export function InventoryDetailPanel({
  open,
  item,
  canReadCatalogue,
  canManage,
  onClose,
  onReceive,
  onAdjust,
  onHold,
  onChangeExpiry,
  onReleaseHold,
}: InventoryDetailPanelProps) {
  const [mounted, setMounted] = useState(false)

  const { workspace } = useMerchantWorkspace()
  const { holds } = useStockHolds(workspace.id, item.variant.id)

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Mount animation trigger
  useEffect(() => {
    if (open) setMounted(true)
    else {
      const timer = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  if (!mounted && !open) return null

  const label = getVariantLabel(item.variant)
  const isZero = item.sellableQuantity === '0'

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-in-out sm:max-w-md',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-detail-title"
      >
        <div className="flex min-h-full flex-col">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
            <h2 id="inventory-detail-title" className="text-lg font-semibold">
              Inventory details
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Close panel"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 p-6">
            {/* Context Header */}
            <div className="mb-8">
              <p className="text-sm font-semibold text-muted-foreground">{item.product.name}</p>
              <h3 className="mt-1 font-serif text-3xl font-bold">{label}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <InventoryVariantStatusBadge status={item.variant.status} />
              </div>
            </div>

            {/* Inventory Balance Card */}
            <div className="mb-8 overflow-hidden rounded-2xl border border-border bg-secondary/20">
              <div className="border-b border-border px-6 py-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Current Balance</h4>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    SELLABLE NOW
                  </span>
                </div>
              </div>
              <div className="px-6 py-8">
                <div className="flex items-baseline gap-2">
                  <QuantityDisplay
                    quantity={item.sellableQuantity}
                    className={cn(
                      'text-5xl font-bold tracking-tight',
                      item.sellableQuantity === '0' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                    )}
                  />
                  <span className="text-sm font-semibold text-muted-foreground">units</span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Physical Stock</p>
                    <p className="mt-1 text-lg font-semibold">{item.physicalQuantity}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Held</p>
                    <p className="mt-1 text-lg font-semibold">{item.heldQuantity}</p>
                  </div>
                </div>
                {item.updatedAt && (
                  <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    Last updated {new Date(item.updatedAt).toLocaleDateString(undefined, {
                      dateStyle: 'medium',
                    })}
                  </p>
                )}
              </div>
            </div>

            {/* Identity Grid */}
            <div className="space-y-4">
              <h4 className="font-semibold">Variant Identity</h4>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <dt className="text-xs font-medium text-muted-foreground">SKU</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold">{item.variant.sku}</dd>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <dt className="text-xs font-medium text-muted-foreground">Barcode</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold">
                    {item.variant.barcode || <span className="italic text-muted-foreground/70">Not specified</span>}
                  </dd>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <dt className="text-xs font-medium text-muted-foreground">Size</dt>
                  <dd className="mt-1 text-sm font-semibold">
                    {item.variant.size || <span className="italic text-muted-foreground/70">Not specified</span>}
                  </dd>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <dt className="text-xs font-medium text-muted-foreground">Colour</dt>
                  <dd className="mt-1 text-sm font-semibold">
                    {item.variant.colour || <span className="italic text-muted-foreground/70">Not specified</span>}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Stock Holds */}
            <div className="mt-8 border-t border-border pt-8">
              <StockHoldsList
                holds={holds}
                canManage={canManage}
                onChangeExpiry={(hold) => onChangeExpiry?.(hold)}
                onRelease={(hold) => onReleaseHold?.(hold)}
              />
            </div>

            {/* Actions (Manage Only) */}
            {canManage && (
              <div className="mt-8 space-y-3 border-t border-border pt-6">
                <h4 className="font-semibold text-sm">Actions</h4>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => onReceive(item)}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Receive
                  </button>
                  <button
                    type="button"
                    onClick={() => onHold(item)}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-secondary px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/80"
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    onClick={() => onAdjust(item)}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-semibold hover:bg-secondary hover:text-foreground"
                  >
                    Adjust
                  </button>
                </div>
              </div>
            )}

            {/* Navigation (Optional) */}
            <div className="mt-8 border-t border-border pt-6 space-y-3">
              <Link
                href={`/app/inventory/${item.variant.id}/ledger`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm font-semibold transition-colors hover:bg-secondary"
              >
                <span>View ledger</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>

              {canReadCatalogue && (
                <Link
                  href={`/app/catalogue/products/${item.product.id}/variants`}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm font-semibold transition-colors hover:bg-secondary"
                >
                  <span>View variant details</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
