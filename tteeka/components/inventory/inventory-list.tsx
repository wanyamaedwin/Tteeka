'use client'

import { cn } from '@/lib/utils'
import { Package, ExternalLink } from 'lucide-react'
import type { InventoryListItemPreview } from '@/lib/mock-inventory'
import { formatQuantity } from '@/lib/mock-inventory'
import { getVariantLabel } from '@/lib/mock-variants'

// ---------------------------------------------------------------------------
// InventoryList
//
// Desktop: polished operational table.
// Mobile: structured inventory cards.
//
// Columns: Product | Variant | SKU | Barcode | Status | Available | Actions
//
// Quantity rules:
//   - Display: "24 available" (large, bold, easy to scan)
//   - Zero: "0 available" (NOT "Out of stock" — F5.1 no derived stock status)
//   - No negative quantities (fixture helpers guarantee this)
//   - No price column. No cost column. No valuation.
//   - No low-stock label. No reorder point.
//
// No mutation actions in F5.1.
// ---------------------------------------------------------------------------

type InventoryListProps = {
  items: InventoryListItemPreview[]
  canRead: boolean
  onSelect: (item: InventoryListItemPreview) => void
}

// ---------------------------------------------------------------------------
// Variant Status Badge
// ---------------------------------------------------------------------------

function VariantStatusBadge({ status }: { status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        status === 'ACTIVE' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        status === 'INACTIVE' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        status === 'ARCHIVED' && 'bg-secondary text-muted-foreground',
      )}
    >
      {status === 'ACTIVE' ? 'Active' : status === 'INACTIVE' ? 'Inactive' : 'Archived'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Quantity display component — BigInt-safe, easy to scan
// ---------------------------------------------------------------------------

function QuantityDisplay({
  quantity,
  className,
}: {
  quantity: string
  className?: string
}) {
  const formatted = formatQuantity(quantity)
  return (
    <span className={cn('tabular-nums', className)} aria-label={`${formatted} available`}>
      {formatted}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Desktop Row
// ---------------------------------------------------------------------------

function DesktopRow({
  item,
  onSelect,
}: {
  item: InventoryListItemPreview
  onSelect: () => void
}) {
  const label = getVariantLabel(item.variant)
  const isZeroSellable = item.sellableQuantity === '0'

  return (
    <tr
      className="group cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary/40"
      onClick={onSelect}
      aria-label={`${item.product.name} – ${label}, ${formatQuantity(item.sellableQuantity)} sellable`}
    >
      {/* Product */}
      <td className="py-4 pl-6 pr-3">
        <span className="font-semibold text-foreground">{item.product.name}</span>
      </td>

      {/* Variant */}
      <td className="px-3 py-4">
        <span className="text-sm text-muted-foreground">{label}</span>
      </td>

      {/* SKU */}
      <td className="px-3 py-4">
        <span className="font-mono text-sm text-foreground">{item.variant.sku}</span>
      </td>

      {/* Barcode */}
      <td className="px-3 py-4">
        {item.variant.barcode ? (
          <span className="font-mono text-sm text-muted-foreground">{item.variant.barcode}</span>
        ) : (
          <span className="text-xs italic text-muted-foreground/60">—</span>
        )}
      </td>

      {/* Variant status */}
      <td className="px-3 py-4">
        <VariantStatusBadge status={item.variant.status} />
      </td>

      {/* Physical Stock */}
      <td className="px-3 py-4">
        <QuantityDisplay quantity={item.physicalQuantity} className="text-sm text-foreground font-medium" />
      </td>

      {/* Held */}
      <td className="px-3 py-4">
        <QuantityDisplay quantity={item.heldQuantity} className="text-sm text-muted-foreground" />
      </td>

      {/* Sellable Now */}
      <td className="px-3 py-4">
        <div className="flex items-baseline gap-1.5">
          <QuantityDisplay
            quantity={item.sellableQuantity}
            className={cn(
              'text-lg font-bold',
              isZeroSellable ? 'text-destructive/80' : 'text-emerald-600 dark:text-emerald-400',
            )}
          />
        </div>
      </td>

      {/* Actions */}
      <td className="py-4 pl-3 pr-6 text-right">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect() }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-secondary hover:text-foreground"
          aria-label={`View inventory details for ${item.variant.sku}`}
        >
          View
          <ExternalLink className="size-3" aria-hidden="true" />
        </button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Mobile Card
// ---------------------------------------------------------------------------

function MobileCard({
  item,
  onSelect,
}: {
  item: InventoryListItemPreview
  onSelect: () => void
}) {
  const label = getVariantLabel(item.variant)
  const isZeroSellable = item.sellableQuantity === '0'
  const isNoPhysical = item.physicalQuantity === '0'

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full border-b border-border px-5 py-5 text-left transition-colors last:border-0 hover:bg-secondary/40"
      aria-label={`${item.product.name} – ${label}`}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold text-muted-foreground">
          {item.product.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">{item.product.name}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-xs text-muted-foreground">{item.variant.sku}</p>
          {item.variant.barcode && (
            <p className="font-mono text-xs text-muted-foreground/70">
              {item.variant.barcode}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <VariantStatusBadge status={item.variant.status} />
          </div>
        </div>

        {/* Quantities — right aligned, easy to scan */}
        <div className="shrink-0 text-right flex flex-col items-end">
          <QuantityDisplay
            quantity={item.sellableQuantity}
            className={cn(
              'text-xl font-bold leading-none',
              isZeroSellable ? 'text-destructive/80' : 'text-emerald-600 dark:text-emerald-400',
            )}
          />
          <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mt-1 mb-2">Sellable Now</p>

          <div className="flex flex-col gap-0.5 text-right text-xs">
            <span className="text-muted-foreground">
              Physical: <span className="font-semibold text-foreground">{item.physicalQuantity}</span>
            </span>
            <span className="text-muted-foreground">
              Held: <span className="font-semibold text-foreground">{item.heldQuantity}</span>
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// InventoryList (main export)
// ---------------------------------------------------------------------------

export function InventoryList({ items, canRead, onSelect }: InventoryListProps) {
  if (!canRead || items.length === 0) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Desktop Table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full caption-bottom text-sm" role="grid" aria-label="Inventory availability">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th scope="col" className="py-3 pl-6 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Product
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Variant
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                SKU
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Barcode
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground" title="All units physically available at the shop.">
                Physical Stock
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground" title="Units temporarily reserved and not available for another customer.">
                Held
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground" title="What you can safely promise or sell right now.">
                Sellable Now
              </th>
              <th scope="col" className="py-3 pl-3 pr-6 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <DesktopRow
                key={item.variant.id}
                item={item}
                onSelect={() => onSelect(item)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="divide-y divide-border md:hidden">
        {items.map((item) => (
          <MobileCard
            key={item.variant.id}
            item={item}
            onSelect={() => onSelect(item)}
          />
        ))}
      </div>
    </div>
  )
}

// Re-export for use in other components
export { VariantStatusBadge as InventoryVariantStatusBadge, QuantityDisplay }
