'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getVariantLabel, type ProductVariantPreview } from '@/lib/mock-variants'
import { MoneyDisplay } from './money-display'
import { type VariantCurrentPricePreview } from '@/lib/mock-pricing'

// ---------------------------------------------------------------------------
// VariantList
//
// Desktop table + mobile cards for Product Variants.
//
// Columns (Desktop): Variant (label), SKU, Barcode, Selling price, Status, Actions
//
// Selling price column:
//   • Visible when canRead = true (catalogue.read)
//   • Shows "UGX 85,000" if priced, "Not priced yet" if null
//   • Cost is NOT shown in the list (cost requires PRICING_MANAGE)
//
// "Standard variant" label shown when size AND colour are both null.
// This is presentational only — never stored as domain data.
//
// NO columns for: cost price, stock quantity, inventory.
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<ProductVariantPreview['status'], string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ARCHIVED: 'Archived',
}

const STATUS_COLOR: Record<ProductVariantPreview['status'], string> = {
  ACTIVE: 'bg-accent/70 text-accent-foreground',
  INACTIVE: 'bg-secondary text-muted-foreground',
  ARCHIVED: 'bg-destructive/10 text-destructive',
}

export function VariantStatusBadge({ status }: { status: ProductVariantPreview['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        STATUS_COLOR[status],
      )}
      aria-label={`Variant status: ${STATUS_LABEL[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  )
}

type VariantListProps = {
  variants: ProductVariantPreview[]
  canRead: boolean
  canManage: boolean
  canPriceManage: boolean
  /** variantId → current price. Absent = unpriced. */
  currentPriceMap: Record<string, VariantCurrentPricePreview>
  onSelect: (v: ProductVariantPreview) => void
  onEdit: (v: ProductVariantPreview) => void
  onMarkInactive: (v: ProductVariantPreview) => void
  onArchive: (v: ProductVariantPreview) => void
  onRestore: (v: ProductVariantPreview) => void
  onActivate: (v: ProductVariantPreview) => void
}

export function VariantList({
  variants,
  canRead,
  canManage,
  canPriceManage,
  currentPriceMap,
  onSelect,
  onEdit,
  onMarkInactive,
  onArchive,
  onRestore,
  onActivate,
}: VariantListProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-5 py-3.5">Variant</th>
                <th scope="col" className="px-5 py-3.5">SKU</th>
                <th scope="col" className="px-5 py-3.5">Barcode</th>
                {canRead && (
                  <th scope="col" className="px-5 py-3.5">Selling price</th>
                )}
                <th scope="col" className="px-5 py-3.5">Status</th>
                <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {variants.map((v) => (
                <VariantTableRow
                  key={v.id}
                  variant={v}
                  canRead={canRead}
                  canManage={canManage}
                  canPriceManage={canPriceManage}
                  currentPrice={currentPriceMap[v.id] ?? null}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onMarkInactive={onMarkInactive}
                  onArchive={onArchive}
                  onRestore={onRestore}
                  onActivate={onActivate}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {variants.map((v) => (
          <VariantCard
            key={v.id}
            variant={v}
            canRead={canRead}
            canManage={canManage}
            canPriceManage={canPriceManage}
            currentPrice={currentPriceMap[v.id] ?? null}
            onSelect={onSelect}
            onEdit={onEdit}
            onMarkInactive={onMarkInactive}
            onArchive={onArchive}
            onRestore={onRestore}
            onActivate={onActivate}
          />
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Action menu
// ---------------------------------------------------------------------------

function VariantActionMenu({
  variant,
  canManage,
  currentPrice,
  onSelect,
  onEdit,
  onMarkInactive,
  onArchive,
  onRestore,
  onActivate,
}: {
  variant: ProductVariantPreview
  canManage: boolean
  currentPrice: VariantCurrentPricePreview | null
  onSelect: (v: ProductVariantPreview) => void
  onEdit: (v: ProductVariantPreview) => void
  onMarkInactive: (v: ProductVariantPreview) => void
  onArchive: (v: ProductVariantPreview) => void
  onRestore: (v: ProductVariantPreview) => void
  onActivate: (v: ProductVariantPreview) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const isPriced = !!currentPrice

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions for ${getVariantLabel(variant)}`}
        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-20 w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl">
          <button role="menuitem" type="button"
            onClick={() => { setOpen(false); onSelect(variant) }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary">
            View details
          </button>
          {canManage && (
            <>
              <button role="menuitem" type="button"
                onClick={() => { setOpen(false); onEdit(variant) }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary">
                Edit variant
              </button>
              {variant.status === 'ACTIVE' && (
                <>
                  <button role="menuitem" type="button"
                    onClick={() => { setOpen(false); onMarkInactive(variant) }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary">
                    Mark inactive
                  </button>
                  <button role="menuitem" type="button"
                    onClick={() => { setOpen(false); onArchive(variant) }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10">
                    Archive variant
                  </button>
                </>
              )}
              {variant.status === 'INACTIVE' && (
                <>
                  {isPriced ? (
                    <button role="menuitem" type="button"
                      onClick={() => { setOpen(false); onActivate(variant) }}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-accent-foreground hover:bg-accent/20">
                      Activate variant
                    </button>
                  ) : (
                    <span
                      role="menuitem"
                      aria-disabled="true"
                      className="block w-full cursor-not-allowed rounded-lg px-3 py-2 text-left text-sm text-muted-foreground"
                      title="Set a price before activating"
                    >
                      Activate variant
                      <span className="ml-1.5 text-xs">(needs price)</span>
                    </span>
                  )}
                  <button role="menuitem" type="button"
                    onClick={() => { setOpen(false); onArchive(variant) }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10">
                    Archive variant
                  </button>
                </>
              )}
              {variant.status === 'ARCHIVED' && (
                <button role="menuitem" type="button"
                  onClick={() => { setOpen(false); onRestore(variant) }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary">
                  Restore as inactive
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Desktop table row
// ---------------------------------------------------------------------------

function VariantTableRow({
  variant, canRead, canManage, canPriceManage, currentPrice, onSelect, onEdit, onMarkInactive, onArchive, onRestore, onActivate,
}: {
  variant: ProductVariantPreview
  canRead: boolean
  canManage: boolean
  canPriceManage: boolean
  currentPrice: VariantCurrentPricePreview | null
  onSelect: (v: ProductVariantPreview) => void
  onEdit: (v: ProductVariantPreview) => void
  onMarkInactive: (v: ProductVariantPreview) => void
  onArchive: (v: ProductVariantPreview) => void
  onRestore: (v: ProductVariantPreview) => void
  onActivate: (v: ProductVariantPreview) => void
}) {
  const label = getVariantLabel(variant)
  return (
    <tr className="transition-colors hover:bg-secondary/20">
      <td className="px-5 py-4">
        <button type="button" onClick={() => onSelect(variant)} className="text-left">
          <p className={cn(
            'font-medium',
            variant.status === 'ARCHIVED' && 'text-muted-foreground line-through',
          )}>
            {label}
          </p>
        </button>
      </td>
      <td className="px-5 py-4">
        <span className="font-mono text-sm font-semibold">{variant.sku}</span>
      </td>
      <td className="px-5 py-4 font-mono text-sm text-muted-foreground">
        {variant.barcode ?? <span className="italic font-sans">Not provided</span>}
      </td>
      {canRead && (
        <td className="px-5 py-4 tabular-nums">
          {currentPrice ? (
            <MoneyDisplay
              amount={currentPrice.sellingPrice}
              currency={currentPrice.currency}
              className="font-semibold"
            />
          ) : (
            <span className="italic text-muted-foreground text-xs">Not priced yet</span>
          )}
        </td>
      )}
      <td className="px-5 py-4">
        <VariantStatusBadge status={variant.status} />
      </td>
      <td className="px-5 py-4 text-right">
        <VariantActionMenu
          variant={variant}
          canManage={canManage}
          currentPrice={currentPrice}
          onSelect={onSelect}
          onEdit={onEdit}
          onMarkInactive={onMarkInactive}
          onArchive={onArchive}
          onRestore={onRestore}
          onActivate={onActivate}
        />
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function VariantCard({
  variant, canRead, canManage, canPriceManage, currentPrice, onSelect, onEdit, onMarkInactive, onArchive, onRestore, onActivate,
}: {
  variant: ProductVariantPreview
  canRead: boolean
  canManage: boolean
  canPriceManage: boolean
  currentPrice: VariantCurrentPricePreview | null
  onSelect: (v: ProductVariantPreview) => void
  onEdit: (v: ProductVariantPreview) => void
  onMarkInactive: (v: ProductVariantPreview) => void
  onArchive: (v: ProductVariantPreview) => void
  onRestore: (v: ProductVariantPreview) => void
  onActivate: (v: ProductVariantPreview) => void
}) {
  const label = getVariantLabel(variant)
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold',
          variant.status === 'ACTIVE' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground',
        )}>
          <Tag className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button type="button" onClick={() => onSelect(variant)} className="block min-w-0 text-left">
              <p className={cn(
                'text-sm font-semibold',
                variant.status === 'ARCHIVED' && 'text-muted-foreground line-through',
              )}>
                {label}
              </p>
              <p className="mt-0.5 font-mono text-xs font-medium text-muted-foreground">{variant.sku}</p>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <VariantStatusBadge status={variant.status} />
              <VariantActionMenu
                variant={variant}
                canManage={canManage}
                currentPrice={currentPrice}
                onSelect={onSelect}
                onEdit={onEdit}
                onMarkInactive={onMarkInactive}
                onArchive={onArchive}
                onRestore={onRestore}
                onActivate={onActivate}
              />
            </div>
          </div>

          {/* Selling price — visible to catalogue.read users */}
          {canRead && (
            <div className="mt-1.5 text-xs">
              {currentPrice ? (
                <MoneyDisplay
                  amount={currentPrice.sellingPrice}
                  currency={currentPrice.currency}
                  className="font-semibold text-foreground"
                />
              ) : (
                <span className="italic text-muted-foreground">Not priced yet</span>
              )}
            </div>
          )}

          {variant.barcode && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Barcode: {variant.barcode}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
