'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, Tag, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  lookupBySku,
  lookupByBarcode,
  getVariantLabel,
  type ProductVariantPreview,
} from '@/lib/mock-variants'
import type { ProductPreview } from '@/lib/mock-catalogue'
import { MoneyDisplay } from './money-display'
import { type VariantCurrentPricePreview } from '@/lib/mock-pricing'
import { VariantStatusBadge } from './variant-list'

// ---------------------------------------------------------------------------
// VariantLookupDialog
//
// Exact SKU or barcode lookup scoped to the current Merchant.
// Requires catalogue.read — manage-only users must not access this.
//
// SKU:     canonicalized to uppercase before matching.
// Barcode: trimmed, case-preserved, compared as string (no Number conversion).
//
// Searches ACTIVE, INACTIVE, and ARCHIVED variants.
// Never searches other Merchants.
// ---------------------------------------------------------------------------

type VariantLookupDialogProps = {
  open: boolean
  allMerchantVariants: ProductVariantPreview[]
  allMerchantProducts: ProductPreview[]
  /** variantId → current price. Absent = unpriced. */
  currentPriceMap: Record<string, VariantCurrentPricePreview>
  /** Whether current user has catalogue.read permission. */
  canRead: boolean
  onClose: () => void
}

export function VariantLookupDialog({
  open,
  allMerchantVariants,
  allMerchantProducts,
  currentPriceMap,
  canRead,
  onClose,
}: VariantLookupDialogProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ variant: ProductVariantPreview; product: ProductPreview | null } | null | 'not-found'>('not-found')
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResult('not-found')
      setSearched(false)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    setSearched(true)

    // Try SKU first (canonical uppercase), then barcode (exact string match)
    const bySkuVariant = lookupBySku(allMerchantVariants, q)
    const found = bySkuVariant ?? lookupByBarcode(allMerchantVariants, q)

    if (!found) {
      setResult(null)
      return
    }

    const product = allMerchantProducts.find((p) => p.id === found.productId) ?? null
    setResult({ variant: found, product })
  }

  function handleViewVariant() {
    if (!result || result === 'not-found') return
    const { variant } = result
    router.push(`/app/catalogue/products/${variant.productId}/variants`)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lookup-title"
    >
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={onClose} />
      <div className="relative flex w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-md sm:rounded-2xl"
        style={{ maxHeight: 'min(96vh, 560px)' }}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 id="lookup-title" className="font-semibold">Find variant</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="size-4" />
          </button>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="flex shrink-0 flex-col gap-3 px-6 py-4">
          <div>
            <label htmlFor="lookup-input" className="mb-1.5 block text-sm font-semibold">SKU or barcode</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                id="lookup-input"
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearched(false) }}
                placeholder="e.g. DS-OXF-WHT-M or 600123450001"
                aria-describedby="lookup-hint"
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 font-mono text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <p id="lookup-hint" className="mt-1.5 text-xs text-muted-foreground">
              Enter the exact SKU or barcode. SKU lookup is case-insensitive.
            </p>
          </div>
          <button type="submit" disabled={!query.trim()}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            Search
          </button>
        </form>

        {/* Results area */}
        {searched && (
          <div className="shrink-0 border-t border-border px-6 py-4">
            {result === null ? (
              /* No result */
              <div className="flex flex-col items-center py-4 text-center">
                <p className="text-sm font-semibold">No variant found with that SKU or barcode.</p>
                <p className="mt-1 text-xs text-muted-foreground">Try checking for typos or a different format.</p>
              </div>
            ) : result !== 'not-found' ? (
              /* Found */
              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
                    result.variant.status === 'ACTIVE' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground',
                  )}>
                    <Tag className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {result.product && (
                      <p className="text-xs text-muted-foreground">{result.product.name}</p>
                    )}
                    <p className="font-semibold">{getVariantLabel(result.variant)}</p>
                    <p className="mt-0.5 font-mono text-sm text-muted-foreground">{result.variant.sku}</p>
                    {result.variant.barcode && (
                      <p className="font-mono text-xs text-muted-foreground">Barcode: {result.variant.barcode}</p>
                    )}
                    {/* Selling price — visible when canRead. Cost NEVER shown in lookup. */}
                    {canRead && (
                      <div className="mt-1 text-sm">
                        {currentPriceMap[result.variant.id] ? (
                          <MoneyDisplay
                            amount={currentPriceMap[result.variant.id].sellingPrice}
                            currency={currentPriceMap[result.variant.id].currency}
                            className="font-semibold tabular-nums"
                          />
                        ) : (
                          <span className="italic text-xs text-muted-foreground">Not priced yet</span>
                        )}
                      </div>
                    )}
                    <div className="mt-1.5">
                      <VariantStatusBadge status={result.variant.status} />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleViewVariant}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  View variant <ArrowRight className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
