'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink, MapPin, Pencil, ShieldCheck } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/app-shell'
import { AccessDenied } from '@/components/workspace-access'
import { OrderStatusBadge } from '@/components/orders/order-status'
import { OrderCustomerDialog } from '@/components/orders/order-customer-dialog'
import { OrderItemsEditor } from '@/components/orders/order-items-editor'
import { OrderLifecycleDialog } from '@/components/orders/order-lifecycle-dialog'
import { OrderConfirmDialog } from '@/components/orders/order-confirm-dialog'
import { OrderPayments } from '@/components/payments/order-payments'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { ordersService } from '@/lib/orders-service'
import { formatOrderMoney } from '@/lib/order-money'
import { ApiError } from '@/lib/api/errors'
import type { DesiredOrderItem, Order, OrderItem } from '@/lib/api/orders'
import { useToast } from '@/components/ui/toast'

const formatTime = (value: string, withTime = true) =>
  new Intl.DateTimeFormat('en-UG', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Africa/Kampala',
  }).format(new Date(value))

export default function OrderPage() {
  return <AppShell><OrderAccess /></AppShell>
}

function OrderAccess() {
  const context = useMerchantWorkspace()
  const params = useParams<{ orderId: string }>()
  if (!context.hasPermission('ORDERS_READ')) {
    return <AccessDenied title="You do not have access to Orders." />
  }
  return (
    <OrderDetail
      context={context}
      orderId={params.orderId}
      canManage={context.hasPermission('ORDERS_MANAGE')}
      canBrowseCustomers={context.hasPermission('CUSTOMERS_READ')}
      canBrowseCatalogue={context.hasPermission('CATALOGUE_READ')}
      canReadPayments={context.hasPermission('PAYMENTS_READ')}
      canManagePayments={context.hasPermission('PAYMENTS_MANAGE')}
    />
  )
}

function OrderDetail({
  context,
  orderId,
  canManage,
  canBrowseCustomers,
  canBrowseCatalogue,
  canReadPayments,
  canManagePayments,
}: {
  context: ReturnType<typeof useMerchantWorkspace>
  orderId: string
  canManage: boolean
  canBrowseCustomers: boolean
  canBrowseCatalogue: boolean
  canReadPayments: boolean
  canManagePayments: boolean
}) {
  const merchantId = context.workspace.id
  const { toast } = useToast()
  const confirmationKey = useRef('')
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [itemsLoading, setItemsLoading] = useState(true)
  const [error, setError] = useState('')
  const [itemsError, setItemsError] = useState('')
  const [editCustomer, setEditCustomer] = useState(false)
  const [lifecycle, setLifecycle] = useState<null | 'abandon' | 'cancel'>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setOrder(await ordersService().detail(merchantId, orderId))
    } catch {
      setError('Unable to load this order.')
    } finally {
      setLoading(false)
    }
  }, [merchantId, orderId])

  const loadItems = useCallback(async () => {
    setItemsLoading(true)
    setItemsError('')
    try {
      setItems((await ordersService().items(merchantId, orderId)).items)
    } catch {
      setItemsError('Unable to load order items.')
    } finally {
      setItemsLoading(false)
    }
  }, [merchantId, orderId])

  useEffect(() => { void load(); void loadItems() }, [load, loadItems])

  const saveCustomer = async (value: { customerId: string; deliveryLocationId: string | null }) => {
    setPending(true)
    try {
      setOrder(await ordersService().update(merchantId, orderId, value))
      setEditCustomer(false)
      toast('Draft customer updated.')
    } catch {
      toast('This customer or delivery location is no longer available.', 'error')
    } finally { setPending(false) }
  }

  const saveItems = async (next: DesiredOrderItem[]) => {
    setPending(true)
    try {
      const response = await ordersService().replaceItems(merchantId, orderId, next)
      setOrder(response.order)
      setItems(response.items)
      toast('Order items saved.')
    } catch {
      toast('This product can no longer be added.', 'error')
    } finally { setPending(false) }
  }

  const transition = async () => {
    if (!lifecycle) return
    setPending(true)
    try {
      setOrder(await ordersService()[lifecycle](merchantId, orderId))
      setLifecycle(null)
      await loadItems()
      toast(lifecycle === 'abandon' ? 'Draft abandoned.' : 'Order cancelled.')
    } catch {
      await Promise.all([load(), loadItems()])
      toast('This order can no longer be edited.', 'error')
    } finally { setPending(false) }
  }

  const confirm = async (expiresAt: string) => {
    setPending(true)
    setConfirmError('')
    if (!confirmationKey.current) {
      confirmationKey.current = globalThis.crypto?.randomUUID?.() ?? `confirm-${Date.now()}`
    }
    try {
      const confirmed = await ordersService().confirm(
        merchantId,
        orderId,
        { expiresAt },
        confirmationKey.current,
        { balanceMap: context.inventoryBalanceMap, holdOverrides: context.holdOverrides },
      )
      setOrder(confirmed)
      await loadItems()
      setConfirmOpen(false)
      confirmationKey.current = ''
      toast('Order confirmed and stock reserved.')
    } catch (cause) {
      await Promise.all([load(), loadItems()])
      if (cause instanceof ApiError && cause.isNetworkError) {
        setConfirmError('The response was interrupted. We refreshed the order to check whether it was confirmed.')
      } else if (cause instanceof ApiError && cause.status === 422) {
        setConfirmError(
          cause.message.includes('at least one item')
            ? 'Add at least one item before confirming this order.'
            : cause.message.includes('inventory')
              ? "We couldn't confirm this order because some items do not have enough stock available to sell. Stock may have changed; review the items and try again."
              : 'This order can no longer be confirmed.',
        )
      } else {
        setConfirmError('This order may have changed. We refreshed it before allowing another action.')
      }
    } finally { setPending(false) }
  }

  if (loading) return <div aria-label="Loading order" className="h-72 animate-pulse rounded-2xl bg-secondary/50" />
  if (error || !order) return <div role="alert" className="rounded-2xl border border-border bg-card p-10 text-center"><p className="font-semibold">{error || 'Unable to load this order.'}</p><Link href="/app/orders" className="mt-4 inline-flex text-primary">Back to Orders</Link></div>

  const editable = order.status === 'DRAFT' && canManage
  const confirmed = order.status === 'CONFIRMED'
  const reservationExpired = confirmed && items.some((item) => item.stockHold?.status === 'EXPIRED')
  const actions = editable ? (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          if (items.length === 0) {
            toast('Add at least one item before confirming this order.', 'error')
            return
          }
          confirmationKey.current = ''
          setConfirmError('')
          setConfirmOpen(true)
        }}
        disabled={itemsLoading || items.length === 0}
        title={items.length === 0 ? 'Add at least one item before confirming this order.' : undefined}
        className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >Confirm Order</button>
      <button type="button" onClick={() => canBrowseCustomers ? setEditCustomer(true) : toast('Customer browsing requires customers.read.', 'error')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold"><Pencil className="size-4" />Edit customer</button>
      <button type="button" onClick={() => setLifecycle('abandon')} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold">Abandon</button>
      <button type="button" onClick={() => setLifecycle('cancel')} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-destructive">Cancel Order</button>
    </div>
  ) : confirmed && canManage ? (
    <button type="button" onClick={() => setLifecycle('cancel')} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-destructive">Cancel Order</button>
  ) : undefined

  return (
    <>
      <Link href="/app/orders" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Back to Orders</Link>
      <PageHeader eyebrow="Order" title={order.customerNameSnapshot ?? 'Unnamed customer'} description="Frozen commercial details and stock reservation state." action={actions} />
      <div className="mb-6 grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer snapshot</p><p className="mt-2 text-lg font-semibold">{order.customerNameSnapshot ?? 'Unnamed customer'}</p><a href={`tel:${order.customerPhoneSnapshot}`} className="text-sm text-muted-foreground hover:underline">{order.customerPhoneSnapshot}</a></div><div><p className="mb-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order status</p><OrderStatusBadge status={order.status} /></div></div>
          <div className="mt-6 border-t border-border pt-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery snapshot</p>{order.deliveryAreaSnapshot ? <div className="mt-3 space-y-2"><p className="text-lg font-bold">{order.deliveryAreaSnapshot}</p><p className="font-semibold">{order.deliveryLandmarkSnapshot}</p><a href={`tel:${order.deliveryPhoneSnapshot}`} className="text-sm hover:underline">{order.deliveryPhoneSnapshot}</a>{order.deliveryInstructionsSnapshot && <p className="text-sm text-muted-foreground">{order.deliveryInstructionsSnapshot}</p>}{order.deliveryMapPinUrlSnapshot && <a href={order.deliveryMapPinUrlSnapshot} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">Open map <ExternalLink className="size-3" /></a>}</div> : <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-4" />No delivery location selected.</div>}</div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subtotal</p><p className="mt-2 text-3xl font-bold">{formatOrderMoney(order.subtotal, order.currency)}</p><dl className="mt-6 space-y-3 text-sm"><div><dt className="text-muted-foreground">Created</dt><dd>{formatTime(order.createdAt)}</dd></div><div><dt className="text-muted-foreground">Updated</dt><dd>{formatTime(order.updatedAt)}</dd></div>{order.confirmedAt && <div><dt className="text-muted-foreground">Confirmed</dt><dd>{formatTime(order.confirmedAt)}</dd></div>}{order.abandonedAt && <div><dt className="text-muted-foreground">Abandoned</dt><dd>{formatTime(order.abandonedAt, false)}</dd></div>}{order.cancelledAt && <div><dt className="text-muted-foreground">Cancelled</dt><dd>{formatTime(order.cancelledAt, false)}</dd></div>}</dl></section>
      </div>
      {(confirmed || (order.status === 'CANCELLED' && items.some((item) => item.stockHold))) && <ReservationCard items={items} expiresAt={order.stockHoldExpiresAt} expired={reservationExpired} />}
      <section><div className="mb-4"><h2 className="font-serif text-2xl font-bold">Items</h2><p className="text-sm text-muted-foreground">Frozen product and price details for this Order.</p></div>{itemsLoading ? <div aria-label="Loading order items" className="h-40 animate-pulse rounded-xl bg-secondary/50" /> : itemsError ? <div role="alert" className="rounded-xl border border-border bg-card p-6">{itemsError}</div> : editable ? canBrowseCatalogue ? <OrderItemsEditor items={items} products={context.productList} variants={context.variantList} prices={context.currentPriceMap} pending={pending} onSave={saveItems} /> : <div className="rounded-xl border border-border bg-card p-6"><p className="font-semibold">Catalogue browsing is unavailable.</p><p className="mt-2 text-sm text-muted-foreground">Adding items requires catalogue.read in this frontend. Existing Order items remain readable through orders.read.</p><ReadOnlyItems items={items} /></div> : <ReadOnlyItems items={items} />}</section>
      <OrderPayments merchantId={merchantId} orderId={orderId} orderStatus={order.status} customerPhone={order.customerPhoneSnapshot} canRead={canReadPayments} canManage={canManagePayments} />
      <OrderCustomerDialog open={editCustomer} merchantId={merchantId} initialCustomerId={order.customerId} initialLocationId={order.deliveryLocationId} submitting={pending} onClose={() => setEditCustomer(false)} onSave={saveCustomer} />
      <OrderConfirmDialog open={confirmOpen} pending={pending} error={confirmError} onCancel={() => setConfirmOpen(false)} onConfirm={(expiry) => void confirm(expiry)} />
      <OrderLifecycleDialog open={!!lifecycle} action={lifecycle ?? 'abandon'} confirmed={confirmed} pending={pending} onCancel={() => setLifecycle(null)} onConfirm={() => void transition()} />
    </>
  )
}

function ReservationCard({ items, expiresAt, expired }: { items: OrderItem[]; expiresAt: string | null; expired: boolean }) {
  const holds = items.map((item) => item.stockHold).filter(Boolean)
  const status = expired ? 'Expired' : holds.some((hold) => hold?.status === 'ACTIVE') ? 'Active' : holds.every((hold) => hold?.status === 'RELEASED') ? 'Released' : 'Historical'
  return <section className={`mb-6 rounded-2xl border p-5 ${expired ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-border bg-card'}`}><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><div><p className="text-xs font-semibold uppercase tracking-wider opacity-70">Stock Reservation</p><p className="mt-1 text-lg font-bold">{status}</p>{expired ? <p className="mt-2 text-sm">Stock reservation expired. This order is still confirmed, but its stock is no longer reserved.</p> : status === 'Active' ? <p className="mt-2 text-sm text-muted-foreground">Reserved for this order. Physical stock has not been removed.</p> : <p className="mt-2 text-sm text-muted-foreground">The reservation is retained as history and no longer reduces sellable stock.</p>}{expiresAt && <p className="mt-3 text-sm"><span className="font-semibold">Expires:</span> {formatTime(expiresAt)}</p>}</div></div></section>
}

function ReadOnlyItems({ items }: { items: OrderItem[] }) {
  if (!items.length) return <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center"><p className="font-semibold">No items added yet.</p><p className="mt-2 text-sm text-muted-foreground">Add products to build this draft order.</p></div>
  return <div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-xl border border-border bg-card p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{item.productNameSnapshot}</p><p className="text-sm text-muted-foreground">{item.skuSnapshot}{[item.sizeSnapshot, item.colourSnapshot].filter(Boolean).length ? ` - ${[item.sizeSnapshot, item.colourSnapshot].filter(Boolean).join(' / ')}` : ''}</p><p className="mt-2 text-sm">{item.quantity} x {formatOrderMoney(item.unitSellingPrice, item.currency)}</p>{item.stockHold && <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reservation: {item.stockHold.status} · {item.stockHold.quantity} held</p>}</div><p className="font-bold">{formatOrderMoney(item.lineTotal, item.currency)}</p></div></article>)}</div>
}
