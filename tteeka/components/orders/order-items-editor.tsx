'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import type { OrderItem } from '@/lib/api/orders'
import { catalogueSelectorApi } from '@/lib/api/catalogue-selectors'
import { isMockMode } from '@/lib/config'
import type { ProductPreview } from '@/lib/mock-catalogue'
import type { ProductVariantPreview } from '@/lib/mock-variants'
import type { VariantCurrentPricePreview } from '@/lib/mock-pricing'
import {
  formatOrderMoney,
  multiplyMoney,
  sumMoney,
  validateQuantity,
} from '@/lib/order-money'

type Candidate = {
  variant: ProductVariantPreview
  product: ProductPreview
  price: VariantCurrentPricePreview
}

type Props = {
  items: OrderItem[]
  products: ProductPreview[]
  variants: ProductVariantPreview[]
  prices: Record<string, VariantCurrentPricePreview>
  pending: boolean
  onSave: (items: { variantId: string; quantity: string }[]) => void
}

export function OrderItemsEditor({
  items,
  products,
  variants,
  prices,
  pending,
  onSave,
}: Props) {
  const { workspace } = useMerchantWorkspace()
  const live = !isMockMode()
  const [draft, setDraft] = useState(
    items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
  )
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [lookupKind, setLookupKind] = useState<'sku' | 'barcode'>('sku')
  const [lookupValue, setLookupValue] = useState('')
  const [lookupPending, setLookupPending] = useState(false)
  const [lookedUp, setLookedUp] = useState<Candidate[]>([])

  useEffect(() => {
    setDraft(
      items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
    )
  }, [items])

  const mockCandidates = useMemo<Candidate[]>(
    () =>
      variants.flatMap((variant) => {
        const product = products.find((row) => row.id === variant.productId)
        const price = prices[variant.id]
        return variant.status === 'ACTIVE' && product?.status === 'ACTIVE' && price
          ? [{ variant, product, price }]
          : []
      }),
    [variants, products, prices],
  )

  const eligible = useMemo(
    () => [
      ...mockCandidates,
      ...lookedUp.filter(
        (candidate) =>
          !mockCandidates.some((row) => row.variant.id === candidate.variant.id),
      ),
    ],
    [lookedUp, mockCandidates],
  )

  const preview = draft.map((row) => {
    const frozen = items.find((item) => item.variantId === row.variantId)
    const fresh = eligible.find(
      (candidate) => candidate.variant.id === row.variantId,
    )
    return {
      ...row,
      name: frozen?.productNameSnapshot ?? fresh?.product.name ?? 'Product',
      sku: frozen?.skuSnapshot ?? fresh?.variant.sku ?? '',
      size: frozen?.sizeSnapshot ?? fresh?.variant.size ?? null,
      colour: frozen?.colourSnapshot ?? fresh?.variant.colour ?? null,
      price: frozen?.unitSellingPrice ?? fresh?.price.sellingPrice ?? '0',
      currency: frozen?.currency ?? fresh?.price.currency ?? null,
    }
  })
  const subtotal = sumMoney(
    preview.map((item) =>
      validateQuantity(item.quantity)
        ? '0'
        : multiplyMoney(item.price, item.quantity),
    ),
  )

  const lookup = async () => {
    const value = lookupValue.trim()
    if (!value) {
      setError(`Enter a ${lookupKind === 'sku' ? 'SKU' : 'barcode'} to search.`)
      return
    }
    setLookupPending(true)
    setError('')
    try {
      const variant = await catalogueSelectorApi.lookupVariant(
        workspace.id,
        lookupKind === 'sku' ? { sku: value } : { barcode: value },
      )
      const product = await catalogueSelectorApi.product(
        workspace.id,
        variant.productId,
      )
      if (
        variant.status !== 'ACTIVE' ||
        product.status !== 'ACTIVE' ||
        variant.price === null
      ) {
        setError('That Variant is not active and priced on an active Product.')
        return
      }
      const candidate: Candidate = {
        variant: { ...variant, merchantId: workspace.id },
        product: { ...product, merchantId: workspace.id },
        price: {
          variantId: variant.id,
          sellingPrice: variant.price.sellingPrice,
          costPrice: null,
          currency: variant.price.currency,
          updatedAt: variant.price.updatedAt,
        },
      }
      setLookedUp((current) => [
        candidate,
        ...current.filter((row) => row.variant.id !== variant.id),
      ])
      setSelected(variant.id)
    } catch {
      setError('No eligible Variant was found for that exact identifier.')
    } finally {
      setLookupPending(false)
    }
  }

  const add = () => {
    if (!selected) return
    if (draft.some((item) => item.variantId === selected)) {
      setError('This Variant is already in the Order. Update its quantity instead.')
      return
    }
    if (draft.length >= 100) {
      setError('An Order can contain at most 100 items.')
      return
    }
    setDraft([...draft, { variantId: selected, quantity: '1' }])
    setSelected('')
    setError('')
  }

  const save = () => {
    if (draft.some((item) => validateQuantity(item.quantity))) {
      setError('Every quantity must be a positive whole number.')
      return
    }
    onSave(
      draft.map((item) => ({
        variantId: item.variantId,
        quantity: BigInt(item.quantity).toString(),
      })),
    )
  }

  return (
    <div>
      {live && (
        <div className="mb-3 rounded-xl border border-border bg-card p-4">
          <p className="font-semibold">Find a Catalogue Variant</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The Catalogue API supports exact merchant-wide lookup by SKU or barcode.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Lookup identifier"
              value={lookupKind}
              onChange={(event) =>
                setLookupKind(event.target.value as 'sku' | 'barcode')
              }
              className="h-11 rounded-lg border border-input bg-background px-3"
            >
              <option value="sku">SKU</option>
              <option value="barcode">Barcode</option>
            </select>
            <input
              aria-label={`Variant ${lookupKind}`}
              value={lookupValue}
              onChange={(event) => setLookupValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void lookup()
              }}
              placeholder={lookupKind === 'sku' ? 'e.g. SHIRT-BLK-M' : 'Scan or enter barcode'}
              className="h-11 flex-1 rounded-lg border border-input bg-background px-3"
            />
            <button
              type="button"
              onClick={() => void lookup()}
              disabled={lookupPending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50"
            >
              <Search className="size-4" />
              {lookupPending ? 'Searching...' : 'Find Variant'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row">
        <label className="flex-1 text-sm font-semibold">
          Product Variant
          <select
            aria-label="Product Variant"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
          >
            <option value="">
              {live ? 'Find a Variant above' : 'Select an active priced Variant'}
            </option>
            {eligible.map((candidate) => (
              <option key={candidate.variant.id} value={candidate.variant.id}>
                {candidate.product.name} - {candidate.variant.sku} -{' '}
                {formatOrderMoney(
                  candidate.price.sellingPrice,
                  candidate.price.currency,
                )}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={add}
          className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold"
        >
          <Plus className="size-4" />
          Add Item
        </button>
      </div>

      {draft.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="font-semibold">No items added yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add products to build this draft order.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {preview.map((row, index) => (
            <article
              key={row.variantId}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{row.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.sku}
                    {[row.size, row.colour].filter(Boolean).length > 0 &&
                      ` - ${[row.size, row.colour].filter(Boolean).join(' / ')}`}
                  </p>
                  <p className="mt-2 text-sm">
                    {formatOrderMoney(row.price, row.currency)} each
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraft(draft.filter((_, itemIndex) => itemIndex !== index))
                  }
                  aria-label={`Remove ${row.name}`}
                  className="rounded-lg p-2 text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <label className="text-sm font-semibold">
                  Quantity
                  <input
                    aria-label={`Quantity for ${row.name}`}
                    inputMode="numeric"
                    value={row.quantity}
                    onChange={(event) =>
                      setDraft(
                        draft.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, quantity: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="mt-2 h-10 w-28 rounded-lg border border-input bg-background px-3"
                  />
                </label>
                <p className="font-semibold">
                  {validateQuantity(row.quantity)
                    ? '-'
                    : formatOrderMoney(
                        multiplyMoney(row.price, row.quantity),
                        row.currency,
                      )}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-col items-end gap-3">
        <p className="text-sm text-muted-foreground">
          Preview subtotal{' '}
          <span className="ml-2 text-lg font-bold text-foreground">
            {formatOrderMoney(subtotal, preview[0]?.currency ?? null)}
          </span>
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Saving items...' : 'Save Items'}
        </button>
      </div>
    </div>
  )
}
