import type { Customer, CustomerInput, CustomerListQuery, CustomerListResponse, CustomerPatch, DeliveryLocation, DeliveryLocationInput, DeliveryLocationPatch, LocationListQuery, LocationListResponse } from './api/customers'
import { ApiError } from './api/errors'

const now = '2026-08-10T09:00:00.000Z'
const customers: Customer[] = [
  { id: 'cust-sarah', merchantId: 'dstyle', name: 'Sarah Nakato', phone: '+256772123456', status: 'ACTIVE', createdAt: now, updatedAt: now },
  { id: 'cust-brian', merchantId: 'dstyle', name: 'Brian Ssempala', phone: '+256701555010', status: 'ACTIVE', createdAt: now, updatedAt: now },
  { id: 'cust-aisha', merchantId: 'dstyle', name: 'Aisha Namusoke', phone: '+256752404040', status: 'ACTIVE', createdAt: now, updatedAt: now },
  { id: 'cust-peter', merchantId: 'dstyle', name: 'Peter Mugisha', phone: '+256782909090', status: 'ARCHIVED', createdAt: now, updatedAt: now },
]
const locations: DeliveryLocation[] = [
  { id: 'loc-sarah', merchantId: 'dstyle', customerId: 'cust-sarah', area: 'Ntinda', landmark: 'Near Capital Shoppers', phone: '+256701234567', instructions: 'Call when you reach the gate.', mapPinUrl: 'https://maps.google.com/?q=Ntinda', status: 'ACTIVE', createdAt: now, updatedAt: now },
  { id: 'loc-brian-1', merchantId: 'dstyle', customerId: 'cust-brian', area: 'Kisaasi', landmark: 'Opposite the Shell station', phone: '+256704333222', instructions: null, mapPinUrl: null, status: 'ACTIVE', createdAt: now, updatedAt: now },
  { id: 'loc-brian-2', merchantId: 'dstyle', customerId: 'cust-brian', area: 'Makindye', landmark: 'Near the market entrance', phone: '+256704333222', instructions: 'Call on arrival.', mapPinUrl: null, status: 'ACTIVE', createdAt: now, updatedAt: now },
  { id: 'loc-peter', merchantId: 'dstyle', customerId: 'cust-peter', area: 'Najjanankumbi', landmark: 'Behind the fuel station', phone: '+256782909091', instructions: null, mapPinUrl: null, status: 'ARCHIVED', createdAt: now, updatedAt: now },
]
export async function getMockActiveCustomers(merchantId:string){return (await mockCustomerApi.list(merchantId,{status:'ACTIVE',pageSize:100})).customers}
export async function getMockActiveLocations(merchantId:string,customerId:string){return (await mockCustomerApi.listLocations(merchantId,customerId,{status:'ACTIVE',pageSize:100})).deliveryLocations}
let id = 100

export function normalizeMockUgandaPhone(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, '').replace(/^\+/, '')
  const local = digits.startsWith('256') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits
  return /^7\d{8}$/.test(local) ? `+256${local}` : null
}
function merchantCustomers(merchantId: string) { return customers.filter((c) => c.merchantId === merchantId) }
function uniquePhone(merchantId: string, raw: string, except?: string) {
  const phone = normalizeMockUgandaPhone(raw)
  if (!phone) throw new ApiError({ status: 400, message: 'Enter a valid Uganda phone number.' })
  if (customers.some((c) => c.merchantId === merchantId && c.id !== except && c.phone === phone)) throw new ApiError({ status: 409, message: 'A customer with this phone number already exists.' })
  return phone
}
function normalizedCustomerInput(input: CustomerInput): CustomerInput {
  const name = input.name == null ? null : input.name.trim()
  if (name !== null && (name.length < 1 || name.length > 160)) throw new ApiError({ status: 400, message: 'Some information needs to be corrected.' })
  return { phone: input.phone, name }
}
function normalizedLocationInput(input: DeliveryLocationInput): DeliveryLocationInput {
  const area = input.area.trim(), landmark = input.landmark.trim(), instructions = input.instructions?.trim() || null, mapPinUrl = input.mapPinUrl?.trim() || null
  if (!area || area.length > 120 || !landmark || landmark.length > 240 || (instructions?.length ?? 0) > 500 || (mapPinUrl?.length ?? 0) > 2048) throw new ApiError({ status: 400, message: 'Some information needs to be corrected.' })
  if (mapPinUrl) {
    try { if (!['http:', 'https:'].includes(new URL(mapPinUrl).protocol)) throw new Error() }
    catch { throw new ApiError({ status: 400, message: 'Some information needs to be corrected.' }) }
  }
  return { area, landmark, phone: input.phone, instructions, mapPinUrl }
}
const pagination = (page: number, pageSize: number, total: number) => ({ page, pageSize, total, totalPages: Math.ceil(total / pageSize) })

export const mockCustomerApi = {
  async list(merchantId: string, query: CustomerListQuery = {}): Promise<CustomerListResponse> {
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20, q = query.q?.toLowerCase()
    let rows = merchantCustomers(merchantId).filter((c) => (!query.status || c.status === query.status) && (!query.phone || c.phone === normalizeMockUgandaPhone(query.phone)) && (!q || c.name?.toLowerCase().includes(q) || c.phone.includes(q)))
    rows = rows.sort((a, b) => (a.name ?? '\uffff').localeCompare(b.name ?? '\uffff') || a.phone.localeCompare(b.phone))
    return { customers: rows.slice((page - 1) * pageSize, page * pageSize), pagination: pagination(page, pageSize, rows.length) }
  },
  async create(merchantId: string, input: CustomerInput) { const clean = normalizedCustomerInput(input); const stamp = new Date().toISOString(); const row: Customer = { id: `cust-${++id}`, merchantId, name: clean.name ?? null, phone: uniquePhone(merchantId, clean.phone), status: 'ACTIVE', createdAt: stamp, updatedAt: stamp }; customers.push(row); return row },
  async detail(merchantId: string, customerId: string) { const row = customers.find((c) => c.merchantId === merchantId && c.id === customerId); if (!row) throw new ApiError({ status: 404, message: 'Not found.' }); return { ...row } },
  async update(merchantId: string, customerId: string, patch: CustomerPatch) { const row = await this.detail(merchantId, customerId); const target = customers.find((c) => c.id === row.id)!; Object.assign(target, patch, patch.phone ? { phone: uniquePhone(merchantId, patch.phone, customerId) } : {}, { updatedAt: new Date().toISOString() }); return { ...target } },
  async listLocations(merchantId: string, customerId: string, query: LocationListQuery = {}): Promise<LocationListResponse> { await this.detail(merchantId, customerId); const page = query.page ?? 1, pageSize = query.pageSize ?? 20; const rows = locations.filter((l) => l.merchantId === merchantId && l.customerId === customerId && (!query.status || l.status === query.status)); return { deliveryLocations: rows.slice((page - 1) * pageSize, page * pageSize), pagination: pagination(page, pageSize, rows.length) } },
  async createLocation(merchantId: string, customerId: string, input: DeliveryLocationInput) { await this.detail(merchantId, customerId); const clean = normalizedLocationInput(input); const phone = normalizeMockUgandaPhone(clean.phone); if (!phone) throw new ApiError({ status: 400, message: 'Enter a valid Uganda phone number.' }); const stamp = new Date().toISOString(); const row: DeliveryLocation = { id: `loc-${++id}`, merchantId, customerId, ...clean, phone, instructions: clean.instructions ?? null, mapPinUrl: clean.mapPinUrl ?? null, status: 'ACTIVE', createdAt: stamp, updatedAt: stamp }; locations.unshift(row); return row },
  async locationDetail(merchantId: string, customerId: string, locationId: string) { const row = locations.find((l) => l.merchantId === merchantId && l.customerId === customerId && l.id === locationId); if (!row) throw new ApiError({ status: 404, message: 'Not found.' }); return { ...row } },
  async updateLocation(merchantId: string, customerId: string, locationId: string, patch: DeliveryLocationPatch) { const row = await this.locationDetail(merchantId, customerId, locationId); const target = locations.find((l) => l.id === row.id)!; const phone = patch.phone ? normalizeMockUgandaPhone(patch.phone) : undefined; if (patch.phone && !phone) throw new ApiError({ status: 400, message: 'Enter a valid Uganda phone number.' }); Object.assign(target, patch, phone ? { phone } : {}, { updatedAt: new Date().toISOString() }); return { ...target } },
  reset() { /* fixtures intentionally live for the browser session */ },
}
