import { apiRequest } from './client'
import { endpoints } from './endpoints'
import type { PaginationMeta } from './types'

export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'FULFILLED' | 'COMPLETED' | 'ABANDONED' | 'CANCELLED'
export type OrderSummary = { id:string; customerId:string; customerNameSnapshot:string|null; customerPhoneSnapshot:string; status:OrderStatus; currency:string|null; subtotal:string; createdAt:string; updatedAt:string; confirmedAt:string|null; stockHoldExpiresAt:string|null }
export type Order = OrderSummary & { merchantId:string; deliveryLocationId:string|null; deliveryAreaSnapshot:string|null; deliveryLandmarkSnapshot:string|null; deliveryPhoneSnapshot:string|null; deliveryInstructionsSnapshot:string|null; deliveryMapPinUrlSnapshot:string|null; abandonedAt:string|null; cancelledAt:string|null }
export type OrderItemStockHold = { id:string; quantity:string; status:'ACTIVE'|'RELEASED'|'EXPIRED'; expiresAt:string; releasedAt:string|null; expiredAt:string|null }
export type OrderItem = { id:string; variantId:string; productNameSnapshot:string; skuSnapshot:string; sizeSnapshot:string|null; colourSnapshot:string|null; quantity:string; unitSellingPrice:string; currency:string; lineTotal:string; createdAt:string; updatedAt:string; stockHold:OrderItemStockHold|null }
export type OrderListQuery = { q?:string; customerId?:string; status?:OrderStatus; createdFrom?:string; createdTo?:string; page?:number; pageSize?:number }
export type OrderListResponse = { orders:OrderSummary[]; pagination:PaginationMeta }
export type CreateOrderInput = { customerId:string; deliveryLocationId?:string|null }
export type OrderPatch = { customerId?:string; deliveryLocationId?:string|null }
export type DesiredOrderItem = { variantId:string; quantity:string }
export type OrderItemsResponse = { orderId:string; currency:string|null; subtotal:string; items:OrderItem[] }
export type ReplaceItemsResponse = { order:Order; items:OrderItem[] }
export type ConfirmOrderInput = { expiresAt:string }

export const orderApi = {
  list:(merchantId:string,query:OrderListQuery={})=>apiRequest<OrderListResponse>(endpoints.orders.list(merchantId),{query,requestContext:'orders.list'}),
  create:(merchantId:string,input:CreateOrderInput,idempotencyKey:string)=>apiRequest<Order>(endpoints.orders.list(merchantId),{method:'POST',body:input,headers:{'Idempotency-Key':idempotencyKey},requestContext:'orders.create'}),
  detail:(merchantId:string,orderId:string)=>apiRequest<Order>(endpoints.orders.item(merchantId,orderId),{requestContext:'orders.detail'}),
  update:(merchantId:string,orderId:string,patch:OrderPatch)=>apiRequest<Order>(endpoints.orders.item(merchantId,orderId),{method:'PATCH',body:patch,requestContext:'orders.update'}),
  items:(merchantId:string,orderId:string)=>apiRequest<OrderItemsResponse>(endpoints.orders.items(merchantId,orderId),{requestContext:'orders.items'}),
  replaceItems:(merchantId:string,orderId:string,items:DesiredOrderItem[])=>apiRequest<ReplaceItemsResponse>(endpoints.orders.items(merchantId,orderId),{method:'PUT',body:{items},requestContext:'orders.items.replace'}),
  abandon:(merchantId:string,orderId:string)=>apiRequest<Order>(endpoints.orders.abandon(merchantId,orderId),{method:'POST',requestContext:'orders.abandon'}),
  cancel:(merchantId:string,orderId:string)=>apiRequest<Order>(endpoints.orders.cancel(merchantId,orderId),{method:'POST',requestContext:'orders.cancel'}),
  confirm:(merchantId:string,orderId:string,input:ConfirmOrderInput,idempotencyKey:string,_mockContext?:unknown)=>apiRequest<Order>(endpoints.orders.confirm(merchantId,orderId),{method:'POST',body:input,headers:{'Idempotency-Key':idempotencyKey},requestContext:'orders.confirm'}),
}
