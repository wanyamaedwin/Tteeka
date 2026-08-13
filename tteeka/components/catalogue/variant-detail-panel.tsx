'use client'

import { useEffect, useRef } from 'react'
import { Tag, Pencil, Power, ArchiveRestore, RotateCcw, X, Info, DollarSign, History, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getVariantLabel, type ProductVariantPreview } from '@/lib/mock-variants'
import { type VariantCurrentPricePreview } from '@/lib/mock-pricing'
import { MoneyDisplay } from './money-display'
import { VariantStatusBadge } from './variant-list'

// ---------------------------------------------------------------------------
// VariantDetailPanel — F4.3 updated
//
// Slide-in detail panel for a Product Variant.
//
// Identity section: Product name, Variant label, SKU, Barcode, Size, Colour, Status.
//
// Pricing section (F4.3):
//   • catalogue.read only:        Selling price (or "Not priced yet"). No cost/history/actions.
//   • catalogue.price.manage:     Selling price, Cost price, Currency, Last updated.
//                                  Actions: Set price / Change price, View price history.
//   • Cost is NEVER in the DOM for read-only users (not hidden, not in data attrs).
//
// Lifecycle actions (canManage = catalogue.manage):
//   • ACTIVE: Mark inactive, Archive
//   • INACTIVE + priced: Activate variant, Archive
//   • INACTIVE + unpriced: Archive only; informative message
//   • ARCHIVED: Restore as inactive
//
// Activation: INACTIVE → ACTIVE requires current price + catalogue.manage.
// Pricing alone does NOT activate (no auto-activation).
// ---------------------------------------------------------------------------

type VariantDetailPanelProps = {
  open: boolean
  variant: ProductVariantPreview
  productName: string
  /** catalogue.read */
  canRead: boolean
  /** catalogue.manage */
  canManage: boolean
  /** PRICING_MANAGE — catalogue.price.manage */
  canPriceManage: boolean
  /** catalogue.settings.read — for Business Settings link in detail */
  canReadSettings?: boolean
  currentPrice: VariantCurrentPricePreview | null
  onClose: () => void
  onEdit: (v: ProductVariantPreview) => void
  onMarkInactive: (v: ProductVariantPreview) => void
  onArchive: (v: ProductVariantPreview) => void
  onRestore: (v: ProductVariantPreview) => void
  /** Activate INACTIVE → ACTIVE. Only called when priced + canManage. */
  onActivate: (v: ProductVariantPreview) => void
  /** Open Set Price form */
  onSetPrice: () => void
  /** Open Change Price form */
  onChangePrice: () => void
  /** Open Price History panel */
  onViewHistory: () => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return iso }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all font-medium">{value}</span>
    </div>
  )
}

export function VariantDetailPanel({
  open,
  variant,
  productName,
  canRead,
  canManage,
  canPriceManage,
  canReadSettings,
  currentPrice,
  onClose,
  onEdit,
  onMarkInactive,
  onArchive,
  onRestore,
  onActivate,
  onSetPrice,
  onChangePrice,
  onViewHistory,
}: VariantDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const label = getVariantLabel(variant)
  const isPriced = !!currentPrice
  const isInactive = variant.status === 'INACTIVE'
  const isActive = variant.status === 'ACTIVE'
  const isArchived = variant.status === 'ARCHIVED'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[1px] lg:hidden" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="variant-detail-title"
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-2xl sm:w-[480px]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className={cn(
              'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
              variant.status === 'ACTIVE' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground',
            )}>
              <Tag className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{productName}</p>
              <h2 id="variant-detail-title" className="font-semibold leading-tight">{label}</h2>
              <VariantStatusBadge status={variant.status} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close variant detail"
            className="ml-2 shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Identity section ────────────────────────────────────────────── */}
          <div className="divide-y divide-border rounded-xl border border-border bg-secondary/20 px-4">
            <MetaRow label="SKU" value={
              <span className="font-mono font-semibold">{variant.sku}</span>
            } />
            <MetaRow label="Barcode" value={
              variant.barcode
                ? <span className="font-mono">{variant.barcode}</span>
                : <span className="italic text-muted-foreground">Not provided</span>
            } />
            <MetaRow label="Size" value={
              variant.size ?? <span className="italic text-muted-foreground">Not specified</span>
            } />
            <MetaRow label="Colour" value={
              variant.colour ?? <span className="italic text-muted-foreground">Not specified</span>
            } />
            <MetaRow label="Status" value={<VariantStatusBadge status={variant.status} />} />
            <MetaRow label="Created" value={formatDate(variant.createdAt)} />
            <MetaRow label="Updated" value={formatDate(variant.updatedAt)} />
          </div>

          {/* ── Pricing section — F4.3 ──────────────────────────────────────── */}
          {canRead && (
            <section aria-labelledby="variant-pricing-heading">
              <div className="mb-3 flex items-center justify-between">
                <h3 id="variant-pricing-heading" className="flex items-center gap-2 text-sm font-semibold">
                  <DollarSign className="size-4 text-muted-foreground" aria-hidden="true" />
                  Pricing
                </h3>
                {/* Price actions — price.manage only */}
                {canPriceManage && (
                  <div className="flex items-center gap-2">
                    {isPriced ? (
                      <>
                        <button
                          type="button"
                          onClick={onChangePrice}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-border hover:bg-secondary transition-colors"
                        >
                          Change price
                        </button>
                        <button
                          type="button"
                          onClick={onViewHistory}
                          aria-label="View price history"
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary transition-colors"
                        >
                          <History className="size-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={onSetPrice}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Set price
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="divide-y divide-border rounded-xl border border-border bg-secondary/20 px-4">
                {/* Selling price — catalogue.read may see */}
                <MetaRow label="Selling price" value={
                  isPriced ? (
                    <MoneyDisplay
                      amount={currentPrice!.sellingPrice}
                      currency={currentPrice!.currency}
                      className="font-semibold tabular-nums"
                    />
                  ) : (
                    <span className="italic text-muted-foreground">Not priced yet</span>
                  )
                } />

                {/* Cost price — price.manage only. NOT rendered for read-only users. */}
                {canPriceManage && (
                  <MetaRow label="Cost price" value={
                    !isPriced ? (
                      <span className="italic text-muted-foreground">Not set</span>
                    ) : currentPrice!.costPrice === null ? (
                      <span className="italic text-muted-foreground">Not recorded</span>
                    ) : (
                      <MoneyDisplay
                        amount={currentPrice!.costPrice}
                        currency={currentPrice!.currency}
                        className="tabular-nums text-muted-foreground"
                      />
                    )
                  } />
                )}

                {/* Currency — visible to all who can read */}
                {isPriced && (
                  <MetaRow label="Currency" value={
                    <span className="font-mono font-semibold">{currentPrice!.currency}</span>
                  } />
                )}

                {/* Last updated — price.manage only */}
                {canPriceManage && isPriced && (
                  <MetaRow label="Last updated" value={
                    <span className="text-muted-foreground">{formatDateTime(currentPrice!.updatedAt)}</span>
                  } />
                )}
              </div>

              {/* View history button — price.manage only */}
              {canPriceManage && isPriced && (
                <button
                  type="button"
                  onClick={onViewHistory}
                  className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
                >
                  <History className="size-4" aria-hidden="true" />
                  View price history
                </button>
              )}

              {/* Price-set message when user has price.manage but not catalogue.manage */}
              {canPriceManage && !canManage && isPriced && isInactive && (
                <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-border bg-secondary/30 p-4">
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm leading-5 text-muted-foreground">
                    This variant now has a price. A user with catalogue management access can activate it.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── Activation messaging — catalogue.manage ──────────────────────── */}
          {canManage && isInactive && !isPriced && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div className="text-sm leading-5">
                <p className="font-semibold text-amber-800 dark:text-amber-300">Price required to activate</p>
                <p className="mt-1 text-amber-700 dark:text-amber-400">
                  Set a price before activating this variant.
                </p>
                {canPriceManage && (
                  <button
                    type="button"
                    onClick={onSetPrice}
                    className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                  >
                    Set price
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Archived notice */}
          {isArchived && (
            <div className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/30 p-4">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm leading-5 text-muted-foreground">
                This variant is archived. Restore it as inactive to make it available again.
                {isPriced && ' Its pricing is preserved.'}
              </p>
            </div>
          )}

          {/* View-only indicator */}
          {!canManage && (
            <p className="rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-xs text-muted-foreground">
              View only — you do not have permission to edit this variant.
            </p>
          )}
        </div>

        {/* Footer actions — manage only */}
        {canManage && (
          <div className="shrink-0 space-y-2 border-t border-border px-6 py-4">
            <button type="button" onClick={() => onEdit(variant)}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary">
              <Pencil className="size-4" />
              Edit variant
            </button>

            {isActive && (
              <>
                <button type="button" onClick={() => onMarkInactive(variant)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary">
                  <Power className="size-4" />
                  Mark inactive
                </button>
                <button type="button" onClick={() => onArchive(variant)}
                  className="flex w-full items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10">
                  <ArchiveRestore className="size-4" />
                  Archive variant
                </button>
              </>
            )}

            {isInactive && (
              <>
                {isPriced ? (
                  <button
                    type="button"
                    onClick={() => onActivate(variant)}
                    className="flex w-full items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                  >
                    <Power className="size-4" />
                    Activate variant
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground opacity-50"
                    title="Set a price before activating"
                  >
                    <Power className="size-4" />
                    Activate variant
                  </button>
                )}
                <button type="button" onClick={() => onArchive(variant)}
                  className="flex w-full items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10">
                  <ArchiveRestore className="size-4" />
                  Archive variant
                </button>
              </>
            )}

            {isArchived && (
              <button type="button" onClick={() => onRestore(variant)}
                className="flex w-full items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                <RotateCcw className="size-4" />
                Restore as inactive
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
