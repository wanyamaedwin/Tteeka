'use client'

import { useMemo, useState } from 'react'
import { Plus, ShoppingBag, SlidersHorizontal, PackagePlus, X, LockKeyhole, Search } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/app-shell'
import { AccessDenied } from '@/components/workspace-access'
import { ProductList } from '@/components/catalogue/product-list'
import { ProductToolbar } from '@/components/catalogue/product-toolbar'
import { ProductDetailPanel } from '@/components/catalogue/product-detail-panel'
import { ProductFormDialog } from '@/components/catalogue/product-form-dialog'
import { ProductStatusConfirmDialog } from '@/components/catalogue/product-status-confirm-dialog'
import { VariantLookupDialog } from '@/components/catalogue/variant-lookup-dialog'
import { PaginationControls } from '@/components/catalogue/pagination-controls'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { useToast } from '@/components/ui/toast'
import { isMockMode } from '@/lib/config'
import {
  filterAndSortProducts,
  getUniqueBrands,
  getUniqueCategories,
  paginateList,
  generateProductId,
  type ProductListFilters,
  type ProductPreview,
} from '@/lib/mock-catalogue'
import { getVariantCount } from '@/lib/mock-variants'

// ---------------------------------------------------------------------------
// Permission constants
// ---------------------------------------------------------------------------
const PERM_CATALOGUE_READ = 'CATALOGUE_READ' as const
const PERM_CATALOGUE_MANAGE = 'CATALOGUE_MANAGE' as const

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

export default function ProductsPage() {
  return (
    <AppShell>
      <ProductsPageContent />
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Main Content — Permission-Aware
// ---------------------------------------------------------------------------

function ProductsPageContent() {
  const {
    workspace,
    productList,
    hasPermission,
    addMockProduct,
    updateMockProduct,
    updateMockProductStatus,
    currentPriceMap,
  } = useMerchantWorkspace()
  const { toast } = useToast()

  const canRead = hasPermission(PERM_CATALOGUE_READ)
  const canManage = hasPermission(PERM_CATALOGUE_MANAGE)

  const isUnavailable =
    workspace.status !== 'ACTIVE' || workspace.membershipStatus !== 'ACTIVE'

  if (isUnavailable) return null

  // ── No Access ─────────────────────────────────────────────────────────────
  if (!canRead && !canManage) {
    return (
      <>
        <PageHeader
          eyebrow="Commerce"
          title="Products"
          description="Manage the products in your catalogue."
        />
        <AccessDenied title="You do not have access to the Product catalogue." />
      </>
    )
  }

  // ── Manage-Only (no read) ──────────────────────────────────────────────────
  if (!canRead && canManage) {
    return (
      <ManageOnlyCatalogueCard
        onAdd={async (fields) => {
          if (isMockMode()) {
            await new Promise((r) => setTimeout(r, 350))
            const newProduct: ProductPreview = {
              id: generateProductId(),
              merchantId: workspace.id,
              name: fields.name,
              description: fields.description,
              category: fields.category,
              brand: fields.brand,
              status: 'ACTIVE',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
            addMockProduct(newProduct)
            toast('Product added.')
          }
        }}
      />
    )
  }

  // ── Full Read (± Manage) ───────────────────────────────────────────────────
  return (
    <ProductsReadView
      productList={productList}
      canManage={canManage}
      onAddProduct={async (fields) => {
        if (!isMockMode()) return null
        await new Promise((r) => setTimeout(r, 350))
        const newProduct: ProductPreview = {
          id: generateProductId(),
          merchantId: workspace.id,
          name: fields.name,
          description: fields.description,
          category: fields.category,
          brand: fields.brand,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        addMockProduct(newProduct)
        toast('Product added.')
        return newProduct
      }}
      onUpdateProduct={async (productId, fields) => {
        if (!isMockMode()) return
        await new Promise((r) => setTimeout(r, 300))
        updateMockProduct(productId, fields)
        toast('Product updated.')
      }}
      onUpdateStatus={async (productId, status, toastMsg) => {
        if (!isMockMode()) return
        await new Promise((r) => setTimeout(r, 300))
        updateMockProductStatus(productId, status)
        toast(toastMsg)
      }}
      currentPriceMap={currentPriceMap}
      canRead={canRead}
    />
  )
}

// ---------------------------------------------------------------------------
// ProductsReadView — full experience for catalogue.read (± manage)
// ---------------------------------------------------------------------------

type ProductsReadViewProps = {
  productList: ProductPreview[]
  canManage: boolean
  onAddProduct: (fields: {
    name: string
    description: string | null
    category: string | null
    brand: string | null
  }) => Promise<ProductPreview | null>
  onUpdateProduct: (
    productId: string,
    fields: {
      name: string
      description: string | null
      category: string | null
      brand: string | null
    },
  ) => Promise<void>
  onUpdateStatus: (
    productId: string,
    status: ProductPreview['status'],
    toastMsg: string,
  ) => Promise<void>
  currentPriceMap: Record<string, import('@/lib/mock-pricing').VariantCurrentPricePreview>
  canRead: boolean
}

function ProductsReadView({
  productList,
  canManage,
  onAddProduct,
  onUpdateProduct,
  onUpdateStatus,
  currentPriceMap,
  canRead,
}: ProductsReadViewProps) {
  // ── Filters & Search ──────────────────────────────────────────────────────
  const [filters, setFilters] = useState<ProductListFilters>({
    search: '',
    status: 'all',
    category: 'all',
    brand: 'all',
  })

  // ── Pagination State ──────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // ── Dialog & Panel State ──────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [lookupOpen, setLookupOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<ProductPreview | null>(null)
  const [detailProduct, setDetailProduct] = useState<ProductPreview | null>(null)
  const [statusConfirm, setStatusConfirm] = useState<{
    product: ProductPreview
    action: 'mark-inactive' | 'reactivate' | 'archive' | 'restore'
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { variantList } = useMerchantWorkspace()

  // Dynamic filter options derived from current merchant's product data
  const categories = useMemo(() => getUniqueCategories(productList), [productList])
  const brands = useMemo(() => getUniqueBrands(productList), [productList])

  // Filtered & sorted products (AND semantics, deterministic ordering)
  const filteredProducts = useMemo(
    () => filterAndSortProducts(productList, filters),
    [productList, filters],
  )

  // Paginated slice
  const { items: paginatedProducts, pagination } = useMemo(
    () => paginateList(filteredProducts, page, pageSize),
    [filteredProducts, page, pageSize],
  )

  // Fresh references for active dialogs
  const freshDetail = detailProduct
    ? productList.find((p) => p.id === detailProduct.id) ?? detailProduct
    : null
  const freshEdit = editProduct
    ? productList.find((p) => p.id === editProduct.id) ?? editProduct
    : null

  // Handler helpers
  const handleFilterChange = (patch: Partial<ProductListFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(1) // Reset to page 1 on filter change
  }

  const handleClearFilters = () => {
    setFilters({ search: '', status: 'all', category: 'all', brand: 'all' })
    setPage(1)
  }

  async function handleCreate(fields: {
    name: string
    description: string | null
    category: string | null
    brand: string | null
  }) {
    setSubmitting(true)
    try {
      const created = await onAddProduct(fields)
      setCreateOpen(false)
      if (created) {
        setDetailProduct(created)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit(fields: {
    name: string
    description: string | null
    category: string | null
    brand: string | null
  }) {
    if (!freshEdit) return
    setSubmitting(true)
    try {
      await onUpdateProduct(freshEdit.id, fields)
      setEditProduct(null)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusConfirm() {
    if (!statusConfirm) return
    const { product, action } = statusConfirm
    setSubmitting(true)
    try {
      let nextStatus: ProductPreview['status'] = 'ACTIVE'
      let toastMsg = 'Product updated.'

      switch (action) {
        case 'mark-inactive':
          nextStatus = 'INACTIVE'
          toastMsg = 'Product marked inactive.'
          break
        case 'reactivate':
          nextStatus = 'ACTIVE'
          toastMsg = 'Product reactivated.'
          break
        case 'archive':
          nextStatus = 'ARCHIVED'
          toastMsg = 'Product archived.'
          break
        case 'restore':
          nextStatus = 'ACTIVE'
          toastMsg = 'Product restored.'
          break
      }

      await onUpdateStatus(product.id, nextStatus, toastMsg)
      setStatusConfirm(null)
      if (detailProduct?.id === product.id) {
        setDetailProduct((prev) => (prev ? { ...prev, status: nextStatus } : null))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const hasFilters =
    filters.search.trim() !== '' ||
    filters.status !== 'all' ||
    filters.category !== 'all' ||
    filters.brand !== 'all'

  return (
    <>
      <PageHeader
        eyebrow="Commerce"
        title="Products"
        description="Manage the products in your catalogue."
        action={
          <div className="flex items-center gap-2">
            <button
              id="find-variant-btn"
              type="button"
              onClick={() => setLookupOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3.5 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              <Search className="size-4" aria-hidden="true" />
              Find variant
            </button>
            {canManage && (
              <button
                id="add-product-btn"
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add product
              </button>
            )}
          </div>
        }
      />

      {/* Toolbar */}
      {productList.length > 0 && (
        <ProductToolbar
          filters={filters}
          categories={categories}
          brands={brands}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />
      )}

      {/* Empty State: Zero products in merchant */}
      {productList.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <ShoppingBag className="mb-4 size-10 text-muted-foreground" />
          <p className="font-semibold">No products yet</p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {canManage
              ? 'Add your first product to begin building your catalogue.'
              : 'No products have been added to this business yet.'}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Add product
            </button>
          )}
        </div>
      ) : filteredProducts.length === 0 ? (
        /* Empty State: Filter mismatch */
        <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <X className="mb-4 size-8 text-muted-foreground" />
          <p className="font-semibold">No products match your search or filters.</p>
          <button
            type="button"
            onClick={handleClearFilters}
            className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
          >
            Clear filters
          </button>
        </div>
      ) : (
        /* Product List + Pagination */
        <>
          <ProductList
            products={paginatedProducts}
            canManage={canManage}
            onSelect={setDetailProduct}
            onEdit={(p) => { setEditProduct(p); setDetailProduct(null) }}
            onMarkInactive={(p) => setStatusConfirm({ product: p, action: 'mark-inactive' })}
            onReactivate={(p) => setStatusConfirm({ product: p, action: 'reactivate' })}
            onArchive={(p) => setStatusConfirm({ product: p, action: 'archive' })}
            onRestore={(p) => setStatusConfirm({ product: p, action: 'restore' })}
          />

          <PaginationControls
            pagination={pagination}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        </>
      )}

      {/* ── Dialogs & Panels ───────────────────────────────────────────────── */}

      {/* Detail panel */}
      {freshDetail && (
        <ProductDetailPanel
          open={!!freshDetail}
          product={freshDetail}
          variantCount={getVariantCount(variantList, freshDetail.id)}
          canManage={canManage}
          onClose={() => setDetailProduct(null)}
          onEdit={(p) => { setDetailProduct(null); setEditProduct(p) }}
          onMarkInactive={(p) => setStatusConfirm({ product: p, action: 'mark-inactive' })}
          onReactivate={(p) => setStatusConfirm({ product: p, action: 'reactivate' })}
          onArchive={(p) => setStatusConfirm({ product: p, action: 'archive' })}
          onRestore={(p) => setStatusConfirm({ product: p, action: 'restore' })}
        />
      )}

      {/* Find Variant Exact Lookup Dialog */}
      <VariantLookupDialog
        open={lookupOpen}
        allMerchantVariants={variantList}
        allMerchantProducts={productList}
        currentPriceMap={currentPriceMap}
        canRead={canRead}
        onClose={() => setLookupOpen(false)}
      />

      {/* Create Product Form */}
      <ProductFormDialog
        open={createOpen}
        mode="create"
        submitting={submitting}
        onSave={handleCreate}
        onCancel={() => setCreateOpen(false)}
      />

      {/* Edit Product Form */}
      {freshEdit && (
        <ProductFormDialog
          open={!!freshEdit}
          mode="edit"
          existing={freshEdit}
          submitting={submitting}
          onSave={handleEdit}
          onCancel={() => setEditProduct(null)}
        />
      )}

      {/* Status Transition Confirmation */}
      {statusConfirm && (
        <ProductStatusConfirmDialog
          open={!!statusConfirm}
          product={statusConfirm.product}
          action={statusConfirm.action}
          submitting={submitting}
          onConfirm={handleStatusConfirm}
          onCancel={() => setStatusConfirm(null)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// ManageOnlyCatalogueCard
//
// Displayed when user has CATALOGUE_MANAGE without CATALOGUE_READ.
// Product directory is hidden; allows product creation.
// ---------------------------------------------------------------------------

function ManageOnlyCatalogueCard({
  onAdd,
}: {
  onAdd: (fields: {
    name: string
    description: string | null
    category: string | null
    brand: string | null
  }) => Promise<void>
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate(fields: {
    name: string
    description: string | null
    category: string | null
    brand: string | null
  }) {
    setSubmitting(true)
    try {
      await onAdd(fields)
      setCreateOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Commerce"
        title="Products"
        description="Manage the products in your catalogue."
      />
      <div className="max-w-xl rounded-2xl border border-border bg-card p-8">
        <div className="mb-5 flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
            <PackagePlus className="size-4 text-muted-foreground" />
          </span>
          <div>
            <h2 className="font-semibold">Product management</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              You can create products, but your current workspace permissions do not allow you to view the catalogue.
            </p>
          </div>
        </div>
        <button
          id="manage-only-add-product-btn"
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Add product
        </button>
      </div>

      <ProductFormDialog
        open={createOpen}
        mode="create"
        submitting={submitting}
        onSave={handleCreate}
        onCancel={() => setCreateOpen(false)}
      />
    </>
  )
}
