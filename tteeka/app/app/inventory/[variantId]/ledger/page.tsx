'use client'

import { use, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Box } from 'lucide-react'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { LedgerList } from '@/components/inventory/ledger-list'
import { getVariantLabel } from '@/lib/mock-variants'
import { getInventoryAvailability, formatQuantity } from '@/lib/mock-inventory'

// ---------------------------------------------------------------------------
// Variant Inventory Ledger Page
// ---------------------------------------------------------------------------

export default function VariantLedgerPage({
  params,
}: {
  params: Promise<{ variantId: string }>
}) {
  const { variantId } = use(params)
  const { workspace, hasPermission, variantList, productList, getVariantLedgerHistory, inventoryBalanceMap, holdOverrides } = useMerchantWorkspace()
  const router = useRouter()

  // ── Permissions ───────────────────────────────────────────────────────────
  const canRead = hasPermission('INVENTORY_READ')

  // ── Data Resolution ───────────────────────────────────────────────────────

  // 1. Find Variant in Merchant's catalogue
  const variant = useMemo(
    () => variantList.find((v) => v.id === variantId),
    [variantList, variantId],
  )

  // 2. Find associated Product
  const product = useMemo(
    () => variant ? productList.find((p) => p.id === variant.productId) : undefined,
    [productList, variant],
  )

  // 3. Resolve Ledger History
  const ledgerHistory = useMemo(
    () => getVariantLedgerHistory(variantId),
    [getVariantLedgerHistory, variantId],
  )

  // 4. Resolve Current Balance (physical, held, sellable)
  const { physicalQuantity, heldQuantity, sellableQuantity } = useMemo(
    () => getInventoryAvailability(workspace.id, variantId, inventoryBalanceMap, holdOverrides ?? {}),
    [workspace.id, inventoryBalanceMap, holdOverrides, variantId],
  )

  // ── Access Checks ─────────────────────────────────────────────────────────
  if (!canRead) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="mt-2 text-muted-foreground">
          You do not have permission to view inventory ledger history.
        </p>
      </div>
    )
  }

  if (!variant || !product) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <h2 className="text-xl font-bold">Inventory item not found</h2>
        <p className="mt-2 text-muted-foreground">
          This variant does not exist in the current workspace.
        </p>
        <button
          onClick={() => router.push('/app/inventory')}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to inventory
        </button>
      </div>
    )
  }

  const variantLabel = getVariantLabel(variant)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-muted/30">
      <div className="flex-1 space-y-6 p-4 sm:p-8">

        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/app/inventory"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Back to inventory"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link href="/app/inventory" className="hover:text-foreground">
                Inventory
              </Link>
              <span>/</span>
              <span>{product.name}</span>
              <span>/</span>
              <span className="font-medium text-foreground">{variantLabel}</span>
              <span>/</span>
              <span className="font-medium text-foreground">Ledger</span>
            </div>
          </div>
        </div>

        {/* Page Header */}
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Inventory Ledger</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            View the immutable movement history that produced this variant's available inventory.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {/* Main Context / Current State */}
          <div className="flex flex-col gap-6 lg:col-span-1">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-lg bg-primary/10">
                  <Box className="size-6 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">{product.name}</h2>
                  <p className="font-serif text-xl font-bold">{variantLabel}</p>
                </div>
              </div>

              <dl className="mt-6 divide-y divide-border border-t border-border text-sm">
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">SKU</dt>
                  <dd className="font-mono">{variant.sku}</dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    {variant.status === 'ACTIVE' && (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        Active
                      </span>
                    )}
                    {variant.status === 'INACTIVE' && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Inactive
                      </span>
                    )}
                    {variant.status === 'ARCHIVED' && (
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-muted-foreground">Sellable Now</h3>
              <p className="mt-2 font-serif text-4xl font-bold tabular-nums">
                {formatQuantity(sellableQuantity)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Physical Stock</p>
                  <p className="mt-0.5 font-semibold">{formatQuantity(physicalQuantity)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Held</p>
                  <p className="mt-0.5 font-semibold">{formatQuantity(heldQuantity)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Ledger History List */}
          <div className="lg:col-span-2 xl:col-span-3">
            <LedgerList entries={ledgerHistory} />
          </div>
        </div>

      </div>
    </div>
  )
}
