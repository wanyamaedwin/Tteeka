import { ApiError } from './api/errors'
import type { OrderItem, OrderItemStockHold } from './api/orders'
import {
  MOCK_MERCHANT_HOLDS_FIXTURE,
  type InventoryBalancePreview,
  type StockHoldPreview,
} from './mock-inventory'

type Confirmation = {
  merchantId: string
  orderId: string
  expiresAt: string
  key: string
  confirmedAt: string
  holds: StockHoldPreview[]
}

const confirmations = new Map<string, Confirmation>()
const keys = new Map<string, { orderId: string; expiresAt: string }>()
const listeners = new Set<() => void>()
let clock = () => new Date()

const emit = () => listeners.forEach((listener) => listener())

export const subscribeMockOrderReservations = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const mockOrderReservationSnapshot = () =>
  Array.from(confirmations.values())
    .flatMap((confirmation) => confirmation.holds)
    .map((hold) => `${hold.id}:${effectiveStatus(hold).status}`)
    .sort()
    .join('|')

export function setMockOrderClock(next: () => Date) {
  clock = next
  emit()
}

export function resetMockOrderClock() {
  clock = () => new Date()
  emit()
}

function effectiveStatus(hold: StockHoldPreview, now = clock()) {
  if (hold.status === 'ACTIVE' && new Date(hold.expiresAt) <= now) {
    return { ...hold, status: 'EXPIRED' as const, expiredAt: hold.expiresAt }
  }
  return { ...hold }
}

export function getMockOrderHolds(merchantId: string) {
  return Array.from(confirmations.values())
    .filter((confirmation) => confirmation.merchantId === merchantId)
    .flatMap((confirmation) => confirmation.holds.map((hold) => effectiveStatus(hold)))
}

export function isMockOrderManagedHold(holdId: string) {
  return Array.from(confirmations.values()).some((confirmation) =>
    confirmation.holds.some((hold) => hold.id === holdId),
  )
}

function genericHeld(
  merchantId: string,
  variantId: string,
  overrides: Record<string, Record<string, StockHoldPreview[]>>,
  now: Date,
) {
  const rows = [
    ...(MOCK_MERCHANT_HOLDS_FIXTURE[merchantId]?.[variantId] ?? []),
    ...(overrides[merchantId]?.[variantId] ?? []),
  ]
  const unique = new Map(rows.map((hold) => [hold.id, hold]))
  return Array.from(unique.values())
    .filter(
      (hold) => hold.status === 'ACTIVE' && new Date(hold.expiresAt) > now,
    )
    .reduce((sum, hold) => sum + BigInt(hold.quantity), BigInt(0))
}

export function confirmMockOrderReservation(input: {
  merchantId: string
  orderId: string
  items: OrderItem[]
  expiresAt: string
  key: string
  balanceMap: Record<string, InventoryBalancePreview>
  genericHoldOverrides?: Record<string, Record<string, StockHoldPreview[]>>
  now?: Date
}) {
  const now = input.now ?? clock()
  const expiresAt = new Date(input.expiresAt)
  if (Number.isNaN(expiresAt.getTime())) {
    throw new ApiError({ status: 400, message: 'Invalid Order confirmation request.' })
  }
  if (expiresAt <= now) {
    throw new ApiError({ status: 422, message: 'Hold expiry must be in the future.' })
  }
  if (input.items.length === 0) {
    throw new ApiError({
      status: 422,
      message: 'An order must contain at least one item before it can be confirmed.',
    })
  }
  const canonicalExpiry = expiresAt.toISOString()
  const scopedKey = `${input.merchantId}:${input.key}`
  const keyed = keys.get(scopedKey)
  if (keyed) {
    if (keyed.orderId !== input.orderId || keyed.expiresAt !== canonicalExpiry) {
      throw new ApiError({ status: 409, message: 'Order confirmation conflict.' })
    }
    return confirmations.get(`${input.merchantId}:${input.orderId}`)!
  }
  const existing = confirmations.get(`${input.merchantId}:${input.orderId}`)
  if (existing) {
    throw new ApiError({ status: 409, message: 'Order confirmation conflict.' })
  }

  const overrides = input.genericHoldOverrides ?? {}
  const orderHolds = getMockOrderHolds(input.merchantId)
  for (const item of input.items) {
    const physical = BigInt(input.balanceMap[item.variantId]?.quantity ?? '0')
    const alreadyHeld =
      genericHeld(input.merchantId, item.variantId, overrides, now) +
      orderHolds
        .filter(
          (hold) =>
            hold.variantId === item.variantId &&
            hold.status === 'ACTIVE' &&
            new Date(hold.expiresAt) > now,
        )
        .reduce((sum, hold) => sum + BigInt(hold.quantity), BigInt(0))
    if (physical - alreadyHeld < BigInt(item.quantity)) {
      throw new ApiError({
        status: 422,
        message: 'Insufficient sellable inventory to confirm this order.',
      })
    }
  }

  const confirmedAt = now.toISOString()
  const holds = input.items.map<StockHoldPreview>((item, index) => ({
    id: `order-hold-${input.orderId}-${index + 1}`,
    merchantId: input.merchantId,
    variantId: item.variantId,
    status: 'ACTIVE',
    quantity: item.quantity,
    expiresAt: canonicalExpiry,
    createdAt: confirmedAt,
    releasedAt: null,
    expiredAt: null,
  }))
  const confirmation = {
    merchantId: input.merchantId,
    orderId: input.orderId,
    expiresAt: canonicalExpiry,
    key: input.key,
    confirmedAt,
    holds,
  }
  confirmations.set(`${input.merchantId}:${input.orderId}`, confirmation)
  keys.set(scopedKey, { orderId: input.orderId, expiresAt: canonicalExpiry })
  emit()
  return confirmation
}

export function cancelMockOrderReservation(
  merchantId: string,
  orderId: string,
  now = clock(),
) {
  const confirmation = confirmations.get(`${merchantId}:${orderId}`)
  if (!confirmation) return
  confirmation.holds = confirmation.holds.map((hold) =>
    hold.status !== 'ACTIVE'
      ? hold
      : new Date(hold.expiresAt) <= now
        ? { ...hold, status: 'EXPIRED', expiredAt: hold.expiresAt }
        : { ...hold, status: 'RELEASED', releasedAt: now.toISOString() },
  )
  emit()
}

export function getMockOrderItemHold(
  merchantId: string,
  orderId: string,
  variantId: string,
): OrderItemStockHold | null {
  const hold = confirmations
    .get(`${merchantId}:${orderId}`)
    ?.holds.find((row) => row.variantId === variantId)
  if (!hold) return null
  const effective = effectiveStatus(hold)
  return {
    id: effective.id,
    quantity: effective.quantity,
    status: effective.status,
    expiresAt: effective.expiresAt,
    releasedAt: effective.releasedAt,
    expiredAt: effective.expiredAt,
  }
}

export function clearMockOrderReservations() {
  confirmations.clear()
  keys.clear()
  resetMockOrderClock()
}
