import { apiRequest } from './client'
import { endpoints } from './endpoints'
import type { PaginationMeta } from './types'

export type CustomerStatus = 'ACTIVE' | 'ARCHIVED'
export type Customer = { id: string; merchantId: string; name: string | null; phone: string; status: CustomerStatus; createdAt: string; updatedAt: string }
export type DeliveryLocation = { id: string; merchantId: string; customerId: string; area: string; landmark: string; phone: string; instructions: string | null; mapPinUrl: string | null; status: CustomerStatus; createdAt: string; updatedAt: string }
export type CustomerInput = { phone: string; name?: string | null }
export type CustomerPatch = Partial<CustomerInput & { status: CustomerStatus }>
export type DeliveryLocationInput = { area: string; landmark: string; phone: string; instructions?: string | null; mapPinUrl?: string | null }
export type DeliveryLocationPatch = Partial<DeliveryLocationInput & { status: CustomerStatus }>
export type CustomerListQuery = { q?: string; phone?: string; status?: CustomerStatus; page?: number; pageSize?: number }
export type LocationListQuery = { status?: CustomerStatus; page?: number; pageSize?: number }
export type CustomerListResponse = { customers: Customer[]; pagination: PaginationMeta }
export type LocationListResponse = { deliveryLocations: DeliveryLocation[]; pagination: PaginationMeta }

export const customerApi = {
  list: (merchantId: string, query: CustomerListQuery = {}) => apiRequest<CustomerListResponse>(endpoints.customers.list(merchantId), { query, requestContext: 'customers.list' }),
  create: (merchantId: string, input: CustomerInput) => apiRequest<Customer>(endpoints.customers.list(merchantId), { method: 'POST', body: input, requestContext: 'customers.create' }),
  detail: (merchantId: string, customerId: string) => apiRequest<Customer>(endpoints.customers.item(merchantId, customerId), { requestContext: 'customers.detail' }),
  update: (merchantId: string, customerId: string, patch: CustomerPatch) => apiRequest<Customer>(endpoints.customers.item(merchantId, customerId), { method: 'PATCH', body: patch, requestContext: 'customers.update' }),
  listLocations: (merchantId: string, customerId: string, query: LocationListQuery = {}) => apiRequest<LocationListResponse>(endpoints.customers.locations(merchantId, customerId), { query, requestContext: 'customers.locations.list' }),
  createLocation: (merchantId: string, customerId: string, input: DeliveryLocationInput) => apiRequest<DeliveryLocation>(endpoints.customers.locations(merchantId, customerId), { method: 'POST', body: input, requestContext: 'customers.locations.create' }),
  locationDetail: (merchantId: string, customerId: string, locationId: string) => apiRequest<DeliveryLocation>(endpoints.customers.location(merchantId, customerId, locationId), { requestContext: 'customers.locations.detail' }),
  updateLocation: (merchantId: string, customerId: string, locationId: string, patch: DeliveryLocationPatch) => apiRequest<DeliveryLocation>(endpoints.customers.location(merchantId, customerId, locationId), { method: 'PATCH', body: patch, requestContext: 'customers.locations.update' }),
}
