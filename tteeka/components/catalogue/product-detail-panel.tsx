'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Package, Pencil, Power, RotateCcw, ArchiveRestore, X, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProductPreview } from '@/lib/mock-catalogue'

// ---------------------------------------------------------------------------
// ProductDetailPanel
//
// Slide-in detail panel showing full Product info.
// No SKU, price, stock, or variant sections.
// Lifecycle actions displayed for catalogue.manage users.
// ---------------------------------------------------------------------------

type ProductDetailPanelProps = {
  open: boolean
  product: ProductPreview
  variantCount?: number
  canManage: boolean
  onClose: () => void
  onEdit: (product: ProductPreview) => void
  onMarkInactive: (product: ProductPreview) => void
  onReactivate: (product: ProductPreview) => void
  onArchive: (product: ProductPreview) => void
  onRestore: (product: ProductPreview) => void
}

const STATUS_LABEL: Record<ProductPreview['status'], string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ARCHIVED: 'Archived',
}

const STATUS_COLOR: Record<ProductPreview['status'], string> = {
  ACTIVE: 'bg-accent/70 text-accent-foreground',
  INACTIVE: 'bg-secondary text-muted-foreground',
  ARCHIVED: 'bg-destructive/10 text-destructive',
}

function ProductStatusBadge({ status }: { status: ProductPreview['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        STATUS_COLOR[status],
      )}
      aria-label={`Product status: ${STATUS_LABEL[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words font-medium">{value}</span>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function ProductDetailPanel({
  open,
  product,
  variantCount = 0,
  canManage,
  onClose,
  onEdit,
  onMarkInactive,
  onReactivate,
  onArchive,
  onRestore,
}: ProductDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[1px] lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-2xl sm:w-[440px]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className={cn(
              'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
              product.status === 'ACTIVE' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground',
            )}>
              <Package className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 id="product-detail-title" className="font-semibold leading-tight break-words">{product.name}</h2>
              <ProductStatusBadge status={product.status} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product detail"
            className="ml-2 shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Description */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
            {product.description ? (
              <p className="text-sm leading-6 text-muted-foreground">{product.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No description</p>
            )}
          </div>

          {/* Metadata */}
          <div className="divide-y divide-border rounded-xl border border-border bg-secondary/20 px-4">
            <MetaRow label="Category" value={product.category ?? <span className="italic text-muted-foreground">Not specified</span>} />
            <MetaRow label="Brand" value={product.brand ?? <span className="italic text-muted-foreground">Not specified</span>} />
            <MetaRow label="Status" value={<ProductStatusBadge status={product.status} />} />
            <MetaRow label="Created" value={formatDate(product.createdAt)} />
            <MetaRow label="Last updated" value={formatDate(product.updatedAt)} />
          </div>

          {/* Variant summary box */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-secondary text-muted-foreground">
                <Tag className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Variants</p>
                <p className="text-xs text-muted-foreground">
                  {variantCount} variant{variantCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <Link
              href={`/app/catalogue/products/${product.id}/variants`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Manage variants
            </Link>
          </div>

          {/* View-only indicator */}
          {!canManage && (
            <p className="rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-xs text-muted-foreground">
              View only — you do not have permission to edit this product.
            </p>
          )}
        </div>

        {/* Footer actions — only for manage users */}
        {canManage && (
          <div className="shrink-0 space-y-2 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={() => onEdit(product)}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit product
            </button>

            {product.status === 'ACTIVE' && (
              <>
                <button
                  type="button"
                  onClick={() => onMarkInactive(product)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary"
                >
                  <Power className="size-4" aria-hidden="true" />
                  Mark inactive
                </button>
                <button
                  type="button"
                  onClick={() => onArchive(product)}
                  className="flex w-full items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  <ArchiveRestore className="size-4" aria-hidden="true" />
                  Archive product
                </button>
              </>
            )}

            {product.status === 'INACTIVE' && (
              <>
                <button
                  type="button"
                  onClick={() => onReactivate(product)}
                  className="flex w-full items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Reactivate product
                </button>
                <button
                  type="button"
                  onClick={() => onArchive(product)}
                  className="flex w-full items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  <ArchiveRestore className="size-4" aria-hidden="true" />
                  Archive product
                </button>
              </>
            )}

            {product.status === 'ARCHIVED' && (
              <button
                type="button"
                onClick={() => onRestore(product)}
                className="flex w-full items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Restore product
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// Re-export status badge for use in the list
export { ProductStatusBadge }
