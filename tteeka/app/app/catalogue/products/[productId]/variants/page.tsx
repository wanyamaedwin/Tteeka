'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Tag } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/app-shell'
import { AccessDenied } from '@/components/workspace-access'
import { VariantList } from '@/components/catalogue/variant-list'
import { VariantDetailPanel } from '@/components/catalogue/variant-detail-panel'
import { VariantFormDialog } from '@/components/catalogue/variant-form-dialog'
import { VariantStatusConfirmDialog } from '@/components/catalogue/variant-status-confirm-dialog'
import { VariantPriceForm } from '@/components/catalogue/variant-price-form'
import { VariantPriceHistoryPanel } from '@/components/catalogue/variant-price-history-panel'
import { ProductStatusBadge } from '@/components/catalogue/product-detail-panel'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { useToast } from '@/components/ui/toast'
import { isMockMode } from '@/lib/config'
import { CURRENCY_OPTIONS } from '@/lib/workspaces'
import {
  getVariantsForProduct,
  generateVariantId,
  canonicalizeSku,
  canonicalizeBarcode,
  getVariantLabel,
  type ProductVariantPreview,
  type VariantFormValues,
} from '@/lib/mock-variants'
import {
  isPriceIdentical,
  getCurrencyLabel,
  type VariantCurrentPricePreview,
  type VariantPriceHistoryPreview,
} from '@/lib/mock-pricing'

// ---------------------------------------------------------------------------
// Permission constants
// ---------------------------------------------------------------------------
const PERM_CATALOGUE_READ = 'CATALOGUE_READ' as const
const PERM_CATALOGUE_MANAGE = 'CATALOGUE_MANAGE' as const
const PERM_PRICING_MANAGE = 'PRICING_MANAGE' as const
const PERM_SETTINGS_READ = 'MERCHANT_SETTINGS_READ' as const

// ---------------------------------------------------------------------------
// Page Component with React 19 `use(params)` unwrapping
// ---------------------------------------------------------------------------

export default function ProductVariantsPage({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId } = use(params)
  return (
    <AppShell>
      <VariantsWorkspaceContent productId={productId} />
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Main Content
// ---------------------------------------------------------------------------

function VariantsWorkspaceContent({ productId }: { productId: string }) {
  const {
    workspace,
    settings,
    productList,
    variantList,
    hasPermission,
    addMockVariant,
    updateMockVariant,
    updateMockVariantStatus,
    currentPriceMap,
    priceHistoryMap,
    setMockVariantPrice,
  } = useMerchantWorkspace()
  const { toast } = useToast()

  const canRead = hasPermission(PERM_CATALOGUE_READ)
  const canManage = hasPermission(PERM_CATALOGUE_MANAGE)
  const canPriceManage = hasPermission(PERM_PRICING_MANAGE)
  const canReadSettings = hasPermission(PERM_SETTINGS_READ)

  // ── No Access ─────────────────────────────────────────────────────────────
  if (!canRead) {
    return (
      <AccessDenied title="You do not have permission to view product variants." />
    )
  }

  // Find product in current merchant
  const product = productList.find((p) => p.id === productId)

  // ── Product Not Found / Tenant Isolation ──────────────────────────────────
  if (!product) {
    return (
      <div className="space-y-4">
        <Link
          href="/app/catalogue/products"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to products
        </Link>
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center">
          <Tag className="mb-4 size-10 text-muted-foreground" />
          <h2 className="text-xl font-bold">Product not found</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            The product you requested does not exist in this business catalogue.
          </p>
          <Link
            href="/app/catalogue/products"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Return to products
          </Link>
        </div>
      </div>
    )
  }

  // Get variants for this product (ordered SKU ASC, then id ASC)
  const productVariants = getVariantsForProduct(variantList, productId)

  // Merchant business currency (snapshotted on save)
  const merchantCurrency = settings.currency
  const merchantCurrencyLabel = getCurrencyLabel(merchantCurrency, CURRENCY_OPTIONS)

  return (
    <VariantsView
      product={product}
      variants={productVariants}
      allMerchantVariants={variantList}
      canRead={canRead}
      canManage={canManage}
      canPriceManage={canPriceManage}
      canReadSettings={canReadSettings}
      currentPriceMap={currentPriceMap}
      priceHistoryMap={priceHistoryMap}
      merchantCurrency={merchantCurrency}
      merchantCurrencyLabel={merchantCurrencyLabel}
      merchantId={workspace.id}
      onAdd={async (values) => {
        if (!isMockMode()) return
        await new Promise((r) => setTimeout(r, 300))
        const newVariant: ProductVariantPreview = {
          id: generateVariantId(),
          merchantId: workspace.id,
          productId: product.id,
          sku: canonicalizeSku(values.sku),
          barcode: canonicalizeBarcode(values.barcode),
          size: values.size.trim() || null,
          colour: values.colour.trim() || null,
          status: 'INACTIVE', // New variants start INACTIVE (F4.3 pricing required for activation)
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        addMockVariant(newVariant)
        toast('Variant added.')
      }}
      onEdit={async (variantId, values) => {
        if (!isMockMode()) return
        await new Promise((r) => setTimeout(r, 250))
        updateMockVariant(variantId, {
          sku: canonicalizeSku(values.sku),
          barcode: canonicalizeBarcode(values.barcode),
          size: values.size.trim() || null,
          colour: values.colour.trim() || null,
        })
        toast('Variant updated.')
      }}
      onUpdateStatus={async (variantId, status, toastMsg) => {
        if (!isMockMode()) return
        await new Promise((r) => setTimeout(r, 250))
        updateMockVariantStatus(variantId, status)
        toast(toastMsg)
      }}
      onSetPrice={async (variantId, sellingPrice, costPrice) => {
        if (!isMockMode()) return
        await new Promise((r) => setTimeout(r, 300))
        setMockVariantPrice(variantId, sellingPrice, costPrice, merchantCurrency, workspace.id)
        toast('Price set.')
      }}
      onChangePrice={async (variantId, sellingPrice, costPrice) => {
        if (!isMockMode()) return
        await new Promise((r) => setTimeout(r, 300))
        setMockVariantPrice(variantId, sellingPrice, costPrice, merchantCurrency, workspace.id)
        toast('Price updated.')
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// VariantsView — View & Manage variants for a confirmed Product
// ---------------------------------------------------------------------------

type VariantsViewProps = {
  product: import('@/lib/mock-catalogue').ProductPreview
  variants: ProductVariantPreview[]
  allMerchantVariants: ProductVariantPreview[]
  canRead: boolean
  canManage: boolean
  canPriceManage: boolean
  canReadSettings: boolean
  currentPriceMap: Record<string, VariantCurrentPricePreview>
  priceHistoryMap: Record<string, VariantPriceHistoryPreview[]>
  merchantCurrency: string
  merchantCurrencyLabel: string
  merchantId: string
  onAdd: (values: VariantFormValues) => Promise<void>
  onEdit: (variantId: string, values: VariantFormValues) => Promise<void>
  onUpdateStatus: (
    variantId: string,
    status: ProductVariantPreview['status'],
    toastMsg: string,
  ) => Promise<void>
  onSetPrice: (variantId: string, sellingPrice: string, costPrice: string | null) => Promise<void>
  onChangePrice: (variantId: string, sellingPrice: string, costPrice: string | null) => Promise<void>
}

function VariantsView({
  product,
  variants,
  allMerchantVariants,
  canRead,
  canManage,
  canPriceManage,
  canReadSettings,
  currentPriceMap,
  priceHistoryMap,
  merchantCurrency,
  merchantCurrencyLabel,
  merchantId,
  onAdd,
  onEdit,
  onUpdateStatus,
  onSetPrice,
  onChangePrice,
}: VariantsViewProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [editVariant, setEditVariant] = useState<ProductVariantPreview | null>(null)
  const [detailVariant, setDetailVariant] = useState<ProductVariantPreview | null>(null)
  const [statusConfirm, setStatusConfirm] = useState<{
    variant: ProductVariantPreview
    action: 'mark-inactive' | 'archive' | 'restore-as-inactive' | 'activate'
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Pricing form state
  const [priceFormVariant, setPriceFormVariant] = useState<ProductVariantPreview | null>(null)
  const [priceFormMode, setPriceFormMode] = useState<'set' | 'change'>('set')

  // Price history panel state
  const [historyVariant, setHistoryVariant] = useState<ProductVariantPreview | null>(null)

  // Fresh references (live data from store, not stale closures)
  const freshDetail = detailVariant
    ? variants.find((v) => v.id === detailVariant.id) ?? detailVariant
    : null
  const freshEdit = editVariant
    ? variants.find((v) => v.id === editVariant.id) ?? editVariant
    : null
  const freshPriceFormVariant = priceFormVariant
    ? variants.find((v) => v.id === priceFormVariant.id) ?? priceFormVariant
    : null
  const freshHistoryVariant = historyVariant
    ? variants.find((v) => v.id === historyVariant.id) ?? historyVariant
    : null

  // ── Add variant ───────────────────────────────────────────────────────────
  async function handleAdd(values: VariantFormValues) {
    setSubmitting(true)
    try {
      await onAdd(values)
      setAddOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Edit variant ──────────────────────────────────────────────────────────
  async function handleEdit(values: VariantFormValues) {
    if (!freshEdit) return
    setSubmitting(true)
    try {
      await onEdit(freshEdit.id, values)
      setEditVariant(null)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Status confirmation ───────────────────────────────────────────────────
  async function handleStatusConfirm() {
    if (!statusConfirm) return
    const { variant, action } = statusConfirm
    setSubmitting(true)
    try {
      let nextStatus: ProductVariantPreview['status'] = 'INACTIVE'
      let toastMsg = 'Variant updated.'

      switch (action) {
        case 'mark-inactive':
          nextStatus = 'INACTIVE'
          toastMsg = 'Variant marked inactive.'
          break
        case 'archive':
          nextStatus = 'ARCHIVED'
          toastMsg = 'Variant archived.'
          break
        case 'restore-as-inactive':
          nextStatus = 'INACTIVE'
          toastMsg = 'Variant restored as inactive.'
          break
        case 'activate':
          nextStatus = 'ACTIVE'
          toastMsg = 'Variant activated.'
          break
      }

      await onUpdateStatus(variant.id, nextStatus, toastMsg)
      setStatusConfirm(null)
      // Update detail panel variant reference
      if (detailVariant?.id === variant.id) {
        setDetailVariant((prev) => (prev ? { ...prev, status: nextStatus } : null))
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Price form save ───────────────────────────────────────────────────────
  async function handlePriceSave(sellingPrice: string, costPrice: string | null) {
    if (!freshPriceFormVariant) return
    const currentPrice = currentPriceMap[freshPriceFormVariant.id] ?? null
    // Identical update guard (no-op)
    if (currentPrice && isPriceIdentical(currentPrice, sellingPrice, costPrice ?? '', merchantCurrency)) {
      setPriceFormVariant(null)
      return
    }
    if (priceFormMode === 'set') {
      await onSetPrice(freshPriceFormVariant.id, sellingPrice, costPrice)
    } else {
      await onChangePrice(freshPriceFormVariant.id, sellingPrice, costPrice)
    }
    setPriceFormVariant(null)
  }

  // ── Open price form helpers ───────────────────────────────────────────────
  function openSetPrice(v: ProductVariantPreview) {
    setPriceFormVariant(v)
    setPriceFormMode('set')
  }

  function openChangePrice(v: ProductVariantPreview) {
    setPriceFormVariant(v)
    setPriceFormMode('change')
  }

  // ── Open price history helper ─────────────────────────────────────────────
  function openHistory(v: ProductVariantPreview) {
    setHistoryVariant(v)
  }

  return (
    <>
      {/* Breadcrumb + Header */}
      <div className="mb-4">
        <Link
          href="/app/catalogue/products"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to products
        </Link>
      </div>

      <PageHeader
        eyebrow={`Products / ${product.name}`}
        title="Product Variants"
        description={`Manage sellable variants for ${product.name}.`}
        action={
          canManage ? (
            <button
              id="add-variant-btn"
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add variant
            </button>
          ) : null
        }
      />

      {/* Product status callout */}
      <div className="mb-5 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Product status:</span>
          <ProductStatusBadge status={product.status} />
        </div>
        <span className="text-xs text-muted-foreground">
          Product and variant status are independent.
        </span>
      </div>

      {/* Empty state: No variants for this product */}
      {variants.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Tag className="mb-4 size-10 text-muted-foreground" />
          <p className="font-semibold">No variants yet</p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {canManage
              ? 'Variants represent the exact versions of this product that you sell (e.g., size, colour, SKU).'
              : 'No variants have been added to this product yet.'}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Add variant
            </button>
          )}
        </div>
      ) : (
        /* Variant List */
        <VariantList
          variants={variants}
          canRead={canRead}
          canManage={canManage}
          canPriceManage={canPriceManage}
          currentPriceMap={currentPriceMap}
          onSelect={setDetailVariant}
          onEdit={(v) => { setEditVariant(v); setDetailVariant(null) }}
          onMarkInactive={(v) => setStatusConfirm({ variant: v, action: 'mark-inactive' })}
          onArchive={(v) => setStatusConfirm({ variant: v, action: 'archive' })}
          onRestore={(v) => setStatusConfirm({ variant: v, action: 'restore-as-inactive' })}
          onActivate={(v) => {
            // Guard: must have current price (belt-and-suspenders — UI already gates)
            const price = currentPriceMap[v.id]
            if (!price) return
            setStatusConfirm({ variant: v, action: 'activate' })
          }}
        />
      )}

      {/* ── Dialogs & Panels ─────────────────────────────────────────────── */}

      {/* Variant Detail panel */}
      {freshDetail && (
        <VariantDetailPanel
          open={!!freshDetail}
          variant={freshDetail}
          productName={product.name}
          canRead={canRead}
          canManage={canManage}
          canPriceManage={canPriceManage}
          canReadSettings={canReadSettings}
          currentPrice={currentPriceMap[freshDetail.id] ?? null}
          onClose={() => setDetailVariant(null)}
          onEdit={(v) => { setDetailVariant(null); setEditVariant(v) }}
          onMarkInactive={(v) => setStatusConfirm({ variant: v, action: 'mark-inactive' })}
          onArchive={(v) => setStatusConfirm({ variant: v, action: 'archive' })}
          onRestore={(v) => setStatusConfirm({ variant: v, action: 'restore-as-inactive' })}
          onActivate={(v) => {
            const price = currentPriceMap[v.id]
            if (!price) return
            setStatusConfirm({ variant: v, action: 'activate' })
          }}
          onSetPrice={() => { if (freshDetail) openSetPrice(freshDetail) }}
          onChangePrice={() => { if (freshDetail) openChangePrice(freshDetail) }}
          onViewHistory={() => { if (freshDetail) openHistory(freshDetail) }}
        />
      )}

      {/* Add Variant Form */}
      <VariantFormDialog
        open={addOpen}
        mode="add"
        allMerchantVariants={allMerchantVariants}
        submitting={submitting}
        onSave={handleAdd}
        onCancel={() => setAddOpen(false)}
      />

      {/* Edit Variant Form */}
      {freshEdit && (
        <VariantFormDialog
          open={!!freshEdit}
          mode="edit"
          existing={freshEdit}
          allMerchantVariants={allMerchantVariants}
          submitting={submitting}
          onSave={handleEdit}
          onCancel={() => setEditVariant(null)}
        />
      )}

      {/* Lifecycle Confirmation */}
      {statusConfirm && (
        <VariantStatusConfirmDialog
          open={!!statusConfirm}
          variant={statusConfirm.variant}
          action={statusConfirm.action as 'mark-inactive' | 'archive' | 'restore-as-inactive'}
          submitting={submitting}
          onConfirm={handleStatusConfirm}
          onCancel={() => setStatusConfirm(null)}
        />
      )}

      {/* Price Form (Set / Change) */}
      {freshPriceFormVariant && canPriceManage && (
        <VariantPriceForm
          open={!!freshPriceFormVariant}
          mode={priceFormMode}
          existing={currentPriceMap[freshPriceFormVariant.id] ?? null}
          variantLabel={getVariantLabel(freshPriceFormVariant)}
          merchantCurrency={merchantCurrency}
          merchantCurrencyLabel={merchantCurrencyLabel}
          canReadSettings={canReadSettings}
          onSave={handlePriceSave}
          onCancel={() => setPriceFormVariant(null)}
        />
      )}

      {/* Price History Panel */}
      {freshHistoryVariant && canPriceManage && (
        <VariantPriceHistoryPanel
          open={!!freshHistoryVariant}
          variantLabel={getVariantLabel(freshHistoryVariant)}
          productName={product.name}
          history={priceHistoryMap[freshHistoryVariant.id] ?? []}
          onClose={() => setHistoryVariant(null)}
        />
      )}
    </>
  )
}
