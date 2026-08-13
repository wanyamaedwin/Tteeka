import { apiRequest } from './client'
import { endpoints } from './endpoints'
import type { StockHoldPublicPreview } from '../mock-inventory'

export type CreateHoldPayload = {
  quantity: string
  expiresAt: string
}

export type UpdateHoldExpiryPayload = {
  expiresAt: string
}

export type InventoryAvailabilityApiResult = {
  physicalQuantity: string
  heldQuantity: string
  sellableQuantity: string
  updatedAt?: string
}

export async function getInventoryItem(merchantId: string, variantId: string) {
  return apiRequest<InventoryAvailabilityApiResult>(endpoints.inventory.item(merchantId, variantId), {
    requestContext: 'inventory.getItem'
  })
}

export async function listHolds(merchantId: string, variantId: string) {
  return apiRequest<StockHoldPublicPreview[]>(endpoints.inventory.holds(merchantId, variantId), {
    requestContext: 'inventory.listHolds'
  })
}

export async function getHold(merchantId: string, variantId: string, holdId: string) {
  return apiRequest<StockHoldPublicPreview>(endpoints.inventory.hold(merchantId, variantId, holdId), {
    requestContext: 'inventory.getHold'
  })
}

export async function createHold(merchantId: string, variantId: string, payload: CreateHoldPayload, idempotencyKey: string) {
  return apiRequest<StockHoldPublicPreview>(endpoints.inventory.holds(merchantId, variantId), {
    method: 'POST',
    body: payload,
    headers: {
      'Idempotency-Key': idempotencyKey
    },
    requestContext: 'inventory.createHold'
  })
}

export async function releaseHold(merchantId: string, variantId: string, holdId: string) {
  return apiRequest<StockHoldPublicPreview>(endpoints.inventory.releaseHold(merchantId, variantId, holdId), {
    method: 'POST',
    requestContext: 'inventory.releaseHold'
  })
}

export async function updateHoldExpiry(merchantId: string, variantId: string, holdId: string, payload: UpdateHoldExpiryPayload) {
  return apiRequest<StockHoldPublicPreview>(endpoints.inventory.updateHoldExpiry(merchantId, variantId, holdId), {
    method: 'PUT',
    body: payload,
    requestContext: 'inventory.updateHoldExpiry'
  })
}
