'use client'

import { useState, useEffect, useRef } from 'react'
import { MoreHorizontal, Package, ArchiveRestore, Power, RotateCcw, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProductStatusBadge } from './product-detail-panel'
import type { ProductPreview } from '@/lib/mock-catalogue'

// ---------------------------------------------------------------------------
// ProductList
//
// Desktop table + mobile cards for the product catalogue.
//
// NO columns for: SKU, price, cost, stock quantity, variants
// Columns: Product (name + description preview), Category, Brand, Status, Last updated, Actions
// ---------------------------------------------------------------------------

type ProductListProps = {
  products: ProductPreview[]
  canManage: boolean
  onSelect: (product: ProductPreview) => void
  onEdit: (product: ProductPreview) => void
  onMarkInactive: (product: ProductPreview) => void
  onReactivate: (product: ProductPreview) => void
  onArchive: (product: ProductPreview) => void
  onRestore: (product: ProductPreview) => void
}

export function ProductList({
  products,
  canManage,
  onSelect,
  onEdit,
  onMarkInactive,
  onReactivate,
  onArchive,
  onRestore,
}: ProductListProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-5 py-3.5">Product</th>
                <th scope="col" className="px-5 py-3.5">Category</th>
                <th scope="col" className="px-5 py-3.5">Brand</th>
                <th scope="col" className="px-5 py-3.5">Status</th>
                <th scope="col" className="px-5 py-3.5">Updated</th>
                {canManage && <th scope="col" className="px-5 py-3.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((product) => (
                <ProductTableRow
                  key={product.id}
                  product={product}
                  canManage={canManage}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onMarkInactive={onMarkInactive}
                  onReactivate={onReactivate}
                  onArchive={onArchive}
                  onRestore={onRestore}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            canManage={canManage}
            onSelect={onSelect}
            onEdit={onEdit}
            onMarkInactive={onMarkInactive}
            onReactivate={onReactivate}
            onArchive={onArchive}
            onRestore={onRestore}
          />
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Action menu (shared between table row + card)
// ---------------------------------------------------------------------------

function ActionMenu({
  product,
  canManage,
  onSelect,
  onEdit,
  onMarkInactive,
  onReactivate,
  onArchive,
  onRestore,
}: {
  product: ProductPreview
  canManage: boolean
  onSelect: (p: ProductPreview) => void
  onEdit: (p: ProductPreview) => void
  onMarkInactive: (p: ProductPreview) => void
  onReactivate: (p: ProductPreview) => void
  onArchive: (p: ProductPreview) => void
  onRestore: (p: ProductPreview) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions for ${product.name}`}
        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-52 rounded-xl border border-border bg-card p-1.5 shadow-xl"
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => { setOpen(false); onSelect(product) }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
          >
            View details
          </button>
          {canManage && (
            <>
              <button
                role="menuitem"
                type="button"
                onClick={() => { setOpen(false); onEdit(product) }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                Edit product
              </button>
              {product.status === 'ACTIVE' && (
                <>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setOpen(false); onMarkInactive(product) }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                  >
                    Mark inactive
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setOpen(false); onArchive(product) }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                  >
                    Archive product
                  </button>
                </>
              )}
              {product.status === 'INACTIVE' && (
                <>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setOpen(false); onReactivate(product) }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                  >
                    Reactivate
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setOpen(false); onArchive(product) }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                  >
                    Archive product
                  </button>
                </>
              )}
              {product.status === 'ARCHIVED' && (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => { setOpen(false); onRestore(product) }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  Restore product
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

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return iso }
}

function ProductTableRow({
  product, canManage, onSelect, onEdit, onMarkInactive, onReactivate, onArchive, onRestore,
}: {
  product: ProductPreview; canManage: boolean
  onSelect: (p: ProductPreview) => void; onEdit: (p: ProductPreview) => void
  onMarkInactive: (p: ProductPreview) => void; onReactivate: (p: ProductPreview) => void
  onArchive: (p: ProductPreview) => void; onRestore: (p: ProductPreview) => void
}) {
  return (
    <tr className="transition-colors hover:bg-secondary/20">
      <td className="px-5 py-4 max-w-xs">
        <button type="button" onClick={() => onSelect(product)} className="text-left">
          <p className={cn('font-semibold', product.status === 'ARCHIVED' && 'text-muted-foreground line-through')}>
            {product.name}
          </p>
          {product.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{product.description}</p>
          )}
        </button>
      </td>
      <td className="px-5 py-4 text-sm text-muted-foreground">
        {product.category ?? <span className="italic">Not specified</span>}
      </td>
      <td className="px-5 py-4 text-sm text-muted-foreground">
        {product.brand ?? <span className="italic">Not specified</span>}
      </td>
      <td className="px-5 py-4">
        <ProductStatusBadge status={product.status} />
      </td>
      <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">
        {formatDateShort(product.updatedAt)}
      </td>
      {canManage && (
        <td className="px-5 py-4 text-right">
          <ActionMenu
            product={product}
            canManage={canManage}
            onSelect={onSelect}
            onEdit={onEdit}
            onMarkInactive={onMarkInactive}
            onReactivate={onReactivate}
            onArchive={onArchive}
            onRestore={onRestore}
          />
        </td>
      )}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function ProductCard({
  product, canManage, onSelect, onEdit, onMarkInactive, onReactivate, onArchive, onRestore,
}: {
  product: ProductPreview; canManage: boolean
  onSelect: (p: ProductPreview) => void; onEdit: (p: ProductPreview) => void
  onMarkInactive: (p: ProductPreview) => void; onReactivate: (p: ProductPreview) => void
  onArchive: (p: ProductPreview) => void; onRestore: (p: ProductPreview) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn(
          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
          product.status === 'ACTIVE' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground',
        )}>
          <Package className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button type="button" onClick={() => onSelect(product)} className="block text-left">
                <p className={cn(
                  'text-sm font-semibold break-words',
                  product.status === 'ARCHIVED' && 'text-muted-foreground line-through',
                )}>
                  {product.name}
                </p>
              </button>
              {product.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{product.description}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ProductStatusBadge status={product.status} />
              <ActionMenu
                product={product}
                canManage={canManage}
                onSelect={onSelect}
                onEdit={onEdit}
                onMarkInactive={onMarkInactive}
                onReactivate={onReactivate}
                onArchive={onArchive}
                onRestore={onRestore}
              />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {product.category && <span>{product.category}</span>}
            {product.category && product.brand && <span>·</span>}
            {product.brand && <span>{product.brand}</span>}
            {!product.category && !product.brand && <span className="italic">No category or brand</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
