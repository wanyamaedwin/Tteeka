'use client'

import { useMemo, useState, useEffect } from 'react'
import { PackageSearch, Boxes } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/app-shell'
import { AccessDenied, WorkspaceUnavailable } from '@/components/workspace-access'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import {
  buildInventoryList,
  filterAndSortInventory,
  paginateInventory,
  type InventoryListFilters,
  type InventoryListItemPreview,
} from '@/lib/mock-inventory'
import { InventoryToolbar } from '@/components/inventory/inventory-toolbar'
import { InventoryList } from '@/components/inventory/inventory-list'
import { InventoryDetailPanel } from '@/components/inventory/inventory-detail-panel'
import { PaginationControls } from '@/components/catalogue/pagination-controls'
import { ReceiveStockDialog } from '@/components/inventory/receive-stock-dialog'
import { AdjustStockDialog } from '@/components/inventory/adjust-stock-dialog'
import { HoldStockModal } from '@/components/inventory/hold-stock-modal'
import { ChangeExpiryDialog } from '@/components/inventory/change-expiry-dialog'
import { ReleaseHoldDialog } from '@/components/inventory/release-hold-dialog'
import { useStockHoldMutations } from '@/lib/hooks/use-stock-holds'
import { useToast } from '@/components/ui/toast'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
const PERM_INVENTORY_READ = 'INVENTORY_READ' as const
const PERM_INVENTORY_MANAGE = 'INVENTORY_MANAGE' as const
const PERM_CATALOGUE_READ = 'CATALOGUE_READ' as const
const PERM_CATALOGUE_MANAGE = 'CATALOGUE_MANAGE' as const

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

export default function InventoryPage() {
  return (
    <AppShell>
      <InventoryPageContent />
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Main Content — Permission-Aware
// ---------------------------------------------------------------------------

function InventoryPageContent() {
  const {
    workspace,
    productList,
    variantList,
    inventoryBalanceMap,
    hasPermission,
  } = useMerchantWorkspace()

  const canRead = hasPermission(PERM_INVENTORY_READ)
  const canManage = hasPermission(PERM_INVENTORY_MANAGE)
  const canReadCatalogue = hasPermission(PERM_CATALOGUE_READ)
  const canManageCatalogue = hasPermission(PERM_CATALOGUE_MANAGE)

  const isUnavailable =
    workspace.status !== 'ACTIVE' || workspace.membershipStatus !== 'ACTIVE'

  if (isUnavailable) {
    return (
      <>
        <PageHeader eyebrow="Commerce" title="Inventory" />
        <WorkspaceUnavailable suspended={workspace.status === 'SUSPENDED'} />
      </>
    )
  }

  // ── No Access ─────────────────────────────────────────────────────────────
  if (!canRead && !canManage) {
    return (
      <>
        <PageHeader eyebrow="Commerce" title="Inventory" />
        <AccessDenied title="You do not have access to Inventory." />
      </>
    )
  }

  // ── Manage-Only (no read) ──────────────────────────────────────────────────
  if (!canRead && canManage) {
    return (
      <>
        <PageHeader eyebrow="Commerce" title="Inventory" />
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center">
          <Boxes className="mb-4 size-10 text-muted-foreground" />
          <h2 className="text-xl font-bold">Inventory management</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Your current workspace permissions allow inventory changes, but you cannot view inventory balances.
          </p>
          <p className="mt-4 text-xs italic text-muted-foreground">
            Inventory actions will be available from authorized variant workflows.
          </p>
        </div>
      </>
    )
  }

  // ── Full Read (± Manage) ───────────────────────────────────────────────────
  return (
    <InventoryWorkspace
      canReadCatalogue={canReadCatalogue}
      canManageCatalogue={canManageCatalogue}
      canManage={canManage}
      productList={productList}
      variantList={variantList}
      balanceMap={inventoryBalanceMap}
    />
  )
}

// ---------------------------------------------------------------------------
// Inventory Workspace (Read + Optional Manage)
// ---------------------------------------------------------------------------

type InventoryWorkspaceProps = {
  canReadCatalogue: boolean
  canManageCatalogue: boolean
  canManage: boolean
  productList: import('@/lib/mock-catalogue').ProductPreview[]
  variantList: import('@/lib/mock-variants').ProductVariantPreview[]
  balanceMap: Record<string, import('@/lib/mock-inventory').InventoryBalancePreview>
}

function InventoryWorkspace({
  canReadCatalogue,
  canManageCatalogue,
  canManage,
  productList,
  variantList,
  balanceMap,
}: InventoryWorkspaceProps) {
  const { workspace, executeInventoryMovement } = useMerchantWorkspace()
  const { toast } = useToast()

  // ── State ─────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<InventoryListFilters>({
    search: '',
    productId: 'all',
    variantStatus: 'all',
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [selectedItem, setSelectedItem] = useState<InventoryListItemPreview | null>(null)
  const [receivingItem, setReceivingItem] = useState<InventoryListItemPreview | null>(null)
  const [adjustingItem, setAdjustingItem] = useState<InventoryListItemPreview | null>(null)
  const [holdingItem, setHoldingItem] = useState<InventoryListItemPreview | null>(null)

  // Hold-specific modal states
  const [expiryHold, setExpiryHold] = useState<import('@/lib/mock-inventory').StockHoldPublicPreview | null>(null)
  const [releaseHold, setReleaseHold] = useState<import('@/lib/mock-inventory').StockHoldPublicPreview | null>(null)

  // ── Derived Data ──────────────────────────────────────────────────────────

  // 1. Join variants + products + balances
  const { holdOverrides } = useMerchantWorkspace()
  const allItems = useMemo(
    () => buildInventoryList(workspace.id, variantList, productList, balanceMap, holdOverrides),
    [workspace.id, variantList, productList, balanceMap, holdOverrides],
  )

  // 2. Filter & Sort
  const filteredItems = useMemo(
    () => filterAndSortInventory(allItems, filters),
    [allItems, filters],
  )

  // 3. Paginate
  const { items: paginatedItems, pagination } = useMemo(
    () => paginateInventory(filteredItems, page, pageSize),
    [filteredItems, page, pageSize],
  )

  // Fresh references for active panels/dialogs
  const freshDetail = selectedItem
    ? allItems.find((i) => i.variant.id === selectedItem.variant.id) ?? selectedItem
    : null

  const freshReceiving = receivingItem
    ? allItems.find((i) => i.variant.id === receivingItem.variant.id) ?? receivingItem
    : null

  const freshAdjusting = adjustingItem
    ? allItems.find((i) => i.variant.id === adjustingItem.variant.id) ?? adjustingItem
    : null

  const freshHolding = holdingItem
    ? allItems.find((i) => i.variant.id === holdingItem.variant.id) ?? holdingItem
    : null

  const { createHold, updateHoldExpiry, releaseHold: releaseHoldCommand } = useStockHoldMutations(workspace.id, selectedItem?.variant.id ?? '')

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFilterChange = (patch: Partial<InventoryListFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(1)
  }

  const handleClearFilters = () => {
    setFilters({ search: '', productId: 'all', variantStatus: 'all' })
    setPage(1)
  }

  const handleReceiveSubmit = async (quantity: string, note: string, idempotencyKey: string) => {
    if (!freshReceiving) return
    const res = executeInventoryMovement({
      merchantId: workspace.id,
      variantId: freshReceiving.variant.id,
      movementType: 'RECEIPT',
      quantity,
      note: note || null,
      idempotencyKey,
    })

    if (res.success) {
      if (!res.replayed) {
        toast('Stock received.', 'success')
      }
    } else {
      toast(res.error || 'Failed to receive stock', 'error')
    }
  }

  const handleAdjustSubmit = async (type: import('@/lib/mock-inventory').InventoryMovementType, quantity: string, note: string, idempotencyKey: string) => {
    if (!freshAdjusting) return
    const res = executeInventoryMovement({
      merchantId: workspace.id,
      variantId: freshAdjusting.variant.id,
      movementType: type,
      quantity,
      note,
      idempotencyKey,
    })

    if (res.success) {
      if (!res.replayed) {
        toast('Inventory adjusted.', 'success')
      }
    } else {
      toast(res.error || 'Failed to adjust stock', 'error')
    }
  }

  const formatHoldError = (err: any): string => {
    const msg = err?.message || ''
    if (err?.code === 'ORDER_MANAGED_HOLD' || msg.toLowerCase().includes('order')) {
      return 'This stock hold is controlled by an order and cannot be changed here.'
    }
    return msg || 'An error occurred while processing the stock hold.'
  }

  const handleHoldSubmit = async (quantity: string, expiresAt: string, idempotencyKey: string) => {
    if (!freshHolding) return
    try {
      await createHold({ quantity, expiresAt }, idempotencyKey)
      toast('Stock held successfully.', 'success')
      setHoldingItem(null)
    } catch (err: any) {
      toast(formatHoldError(err), 'error')
    }
  }

  const handleChangeExpirySubmit = async (holdId: string, expiresAt: string) => {
    try {
      await updateHoldExpiry(holdId, { expiresAt })
      toast('Expiry updated.', 'success')
      setExpiryHold(null)
    } catch (err: any) {
      toast(formatHoldError(err), 'error')
    }
  }

  const handleReleaseSubmit = async (holdId: string) => {
    try {
      await releaseHoldCommand(holdId)
      toast('Hold released.', 'success')
      setReleaseHold(null)
    } catch (err: any) {
      toast(formatHoldError(err), 'error')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Empty directory (merchant has no variants at all)
  if (allItems.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Commerce" title="Inventory" description="View the available quantity of each product variant in this business." />
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Boxes className="mb-4 size-10 text-muted-foreground" />
          <h2 className="text-xl font-bold">No inventory items yet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Add product variants before inventory can be tracked.
          </p>
          {canManageCatalogue && (
            <Link
              href="/app/catalogue/products"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Go to products
            </Link>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Commerce"
        title="Inventory"
        description="View the available quantity of each product variant in this business."
      />

      <InventoryToolbar
        filters={filters}
        productList={productList}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
      />

      {filteredItems.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <PackageSearch className="mb-4 size-8 text-muted-foreground" />
          <p className="font-semibold">No inventory items match your search or filters.</p>
          <button
            type="button"
            onClick={handleClearFilters}
            className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <InventoryList
            items={paginatedItems}
            canRead={true}
            onSelect={setSelectedItem}
          />
          <PaginationControls
            pagination={pagination}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            itemName="item"
          />
        </>
      )}

      {/* Detail Panel */}
      {freshDetail && (
        <InventoryDetailPanel
          open={!!freshDetail}
          item={freshDetail}
          canReadCatalogue={canReadCatalogue}
          canManage={canManage}
          onClose={() => setSelectedItem(null)}
          onReceive={setReceivingItem}
          onAdjust={setAdjustingItem}
          onHold={setHoldingItem}
          onChangeExpiry={setExpiryHold}
          onReleaseHold={setReleaseHold}
        />
      )}

      {/* Receive Stock Dialog */}
      <ReceiveStockDialog
        open={!!freshReceiving}
        item={freshReceiving}
        onClose={() => setReceivingItem(null)}
        onSubmit={handleReceiveSubmit}
      />

      {/* Adjust Stock Dialog */}
      <AdjustStockDialog
        open={!!freshAdjusting}
        item={freshAdjusting}
        onClose={() => setAdjustingItem(null)}
        onSubmit={handleAdjustSubmit}
      />

      {/* Hold Stock Modal */}
      <HoldStockModal
        open={!!freshHolding}
        item={freshHolding}
        onClose={() => setHoldingItem(null)}
        onSubmit={handleHoldSubmit}
      />

      {/* Change Expiry Dialog */}
      <ChangeExpiryDialog
        open={!!expiryHold}
        hold={expiryHold}
        onClose={() => setExpiryHold(null)}
        onSubmit={handleChangeExpirySubmit}
      />

      {/* Release Hold Dialog */}
      <ReleaseHoldDialog
        open={!!releaseHold}
        hold={releaseHold}
        onClose={() => setReleaseHold(null)}
        onSubmit={handleReleaseSubmit}
      />
    </>
  )
}
