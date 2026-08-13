import { describe, it } from 'node:test'
import assert from 'node:assert'
import { endpoints } from '../lib/api/endpoints'
import { customerApi } from '../lib/api/customers'
import { mockCustomerApi, normalizeMockUgandaPhone } from '../lib/mock-customers'
import { canRead, type Permission } from '../lib/workspaces'
import { ApiError } from '../lib/api/errors'

describe('F6 Customers and Delivery Locations', () => {
  it('builds all eight authoritative B5 endpoint paths', () => {
    assert.equal(endpoints.customers.list('m 1'), '/merchants/m%201/customers')
    assert.equal(endpoints.customers.item('m', 'c/1'), '/merchants/m/customers/c%2F1')
    assert.equal(endpoints.customers.locations('m', 'c'), '/merchants/m/customers/c/delivery-locations')
    assert.equal(endpoints.customers.location('m', 'c', 'l'), '/merchants/m/customers/c/delivery-locations/l')
    for (const name of ['list','create','detail','update','listLocations','createLocation','locationDetail','updateLocation'] as const) assert.equal(typeof customerApi[name], 'function')
  })

  it('normalizes supported Uganda phone forms and rejects invalid values', () => {
    assert.equal(normalizeMockUgandaPhone('0772 123 456'), '+256772123456')
    assert.equal(normalizeMockUgandaPhone('+256772123456'), '+256772123456')
    assert.equal(normalizeMockUgandaPhone('772123456'), '+256772123456')
    assert.equal(normalizeMockUgandaPhone('123'), null)
  })

  it('lists and searches customers by name and canonical phone semantics', async () => {
    const byName = await mockCustomerApi.list('dstyle', { q: 'Sarah' })
    assert.equal(byName.customers[0]?.name, 'Sarah Nakato')
    const archived = await mockCustomerApi.list('dstyle', { status: 'ARCHIVED' })
    assert.ok(archived.customers.every((c) => c.status === 'ARCHIVED'))
    const exactPhone = await mockCustomerApi.list('dstyle', { phone: '0772123456' })
    assert.equal(exactPhone.customers[0]?.phone, '+256772123456')
    assert.equal((await mockCustomerApi.list('dstyle', { page: 1, pageSize: 2 })).pagination.total, 4)
  })

  it('provides the four required realistic fixture scenarios without a default location', async () => {
    const all = await mockCustomerApi.list('dstyle', { pageSize: 100 })
    assert.equal(all.customers.length, 4)
    assert.equal((await mockCustomerApi.listLocations('dstyle', 'cust-sarah')).deliveryLocations.length, 1)
    assert.equal((await mockCustomerApi.listLocations('dstyle', 'cust-brian')).deliveryLocations.length, 2)
    assert.equal((await mockCustomerApi.listLocations('dstyle', 'cust-aisha')).deliveryLocations.length, 0)
    const archived = (await mockCustomerApi.listLocations('dstyle', 'cust-peter')).deliveryLocations
    assert.equal(archived[0]?.status, 'ARCHIVED')
    assert.equal('defaultLocationId' in all.customers[0]!, false)
  })

  it('enforces exact read/manage permission separation', () => {
    const readOnly = ['CUSTOMERS_READ'] as const
    const manageOnly = ['CUSTOMERS_MANAGE'] as const
    const both = ['CUSTOMERS_READ','CUSTOMERS_MANAGE'] as const
    const neither: readonly Permission[] = []
    assert.equal(canRead('CUSTOMERS_READ', readOnly), true)
    assert.equal(canRead('CUSTOMERS_MANAGE', readOnly), false)
    assert.equal(canRead('CUSTOMERS_READ', manageOnly), false)
    assert.equal(canRead('CUSTOMERS_READ', both), true)
    assert.equal(canRead('CUSTOMERS_MANAGE', both), true)
    assert.equal(canRead('CUSTOMERS_READ', neither), false)
  })

  it('retains archived customer phone uniqueness', async () => {
    await assert.rejects(() => mockCustomerApi.create('dstyle', { name: 'Another Peter', phone: '0782909090' }), (error: unknown) => error instanceof ApiError && error.status === 409)
  })

  it('creates, refreshes, edits and retains a customer with no location', async () => {
    const created = await mockCustomerApi.create('dstyle', { name: 'Joan Atim', phone: '0700123987' })
    assert.equal(created.status, 'ACTIVE')
    assert.equal((await mockCustomerApi.detail('dstyle', created.id)).name, 'Joan Atim')
    assert.equal((await mockCustomerApi.update('dstyle', created.id, { name: null })).name, null)
    assert.equal((await mockCustomerApi.listLocations('dstyle', created.id)).pagination.total, 0)
  })

  it('rejects invalid required location data and invalid phones', async () => {
    await assert.rejects(() => mockCustomerApi.create('dstyle', { phone: '123' }), (error: unknown) => error instanceof ApiError && error.status === 400)
    await assert.rejects(() => mockCustomerApi.createLocation('dstyle', 'cust-aisha', { area: 'Kira', landmark: 'Stage', phone: '123' }), (error: unknown) => error instanceof ApiError && error.status === 400)
  })

  it('allows shared Delivery Location phones and keeps locations customer-scoped', async () => {
    const first = await mockCustomerApi.createLocation('dstyle','cust-aisha',{area:'Kira',landmark:'Near the taxi stage',phone:'0704333222'})
    const second = await mockCustomerApi.createLocation('dstyle','cust-aisha',{area:'Entebbe',landmark:'Opposite the market',phone:'0704333222',instructions:'Call on arrival.',mapPinUrl:null})
    assert.equal(first.phone, second.phone)
    const rows = await mockCustomerApi.listLocations('dstyle','cust-aisha')
    assert.ok(rows.deliveryLocations.every((location) => location.customerId === 'cust-aisha'))
    assert.equal(rows.deliveryLocations.length, 2)
  })

  it('supports independent archive/reactivate PATCH lifecycles', async () => {
    const customer = await mockCustomerApi.update('dstyle','cust-sarah',{status:'ARCHIVED'})
    assert.equal(customer.status,'ARCHIVED')
    const location = await mockCustomerApi.updateLocation('dstyle','cust-sarah','loc-sarah',{status:'ARCHIVED'})
    assert.equal(location.status,'ARCHIVED')
    assert.equal((await mockCustomerApi.update('dstyle','cust-sarah',{status:'ACTIVE'})).status,'ACTIVE')
    assert.equal((await mockCustomerApi.updateLocation('dstyle','cust-sarah','loc-sarah',{status:'ACTIVE'})).status,'ACTIVE')
  })

  it('returns generic not-found behavior for foreign customer/location relationships', async () => {
    await assert.rejects(() => mockCustomerApi.detail('another-merchant', 'cust-sarah'), (error: unknown) => error instanceof ApiError && error.status === 404)
    await assert.rejects(() => mockCustomerApi.locationDetail('dstyle', 'cust-brian', 'loc-sarah'), (error: unknown) => error instanceof ApiError && error.status === 404)
  })

  it('live API errors do not fall back to mock records', async () => {
    await assert.rejects(() => customerApi.list('dstyle'), (error: unknown) => error instanceof ApiError)
  })
})
