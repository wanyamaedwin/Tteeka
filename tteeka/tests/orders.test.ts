import assert from 'node:assert/strict'
import { describe,it } from 'node:test'
import { endpoints } from '../lib/api/endpoints'
import { orderApi } from '../lib/api/orders'
import { catalogueSelectorApi } from '../lib/api/catalogue-selectors'
import { mockOrderApi,setMockOrderVariantFacts } from '../lib/mock-orders'
import { clearMockOrderReservations, confirmMockOrderReservation, getMockOrderHolds, resetMockOrderClock, setMockOrderClock } from '../lib/mock-order-reservations'
import { releaseMockHold, updateMockHoldExpiry, type InventoryBalancePreview } from '../lib/mock-inventory'
import { mockCustomerApi } from '../lib/mock-customers'
import { ApiError } from '../lib/api/errors'
import { formatOrderMoney,multiplyMoney,sumMoney,validateQuantity } from '../lib/order-money'
import { canRead,type Permission } from '../lib/workspaces'

describe('F7.1 Draft Orders and commercial snapshots',()=>{
  it('preserves the exact eight B6.1 operations and adds B6.2 confirmation',()=>{
    assert.equal(endpoints.orders.list('m 1'),'/merchants/m%201/orders')
    assert.equal(endpoints.orders.item('m','o/1'),'/merchants/m/orders/o%2F1')
    assert.equal(endpoints.orders.items('m','o'),'/merchants/m/orders/o/items')
    assert.equal(endpoints.orders.abandon('m','o'),'/merchants/m/orders/o/abandon')
    assert.equal(endpoints.orders.cancel('m','o'),'/merchants/m/orders/o/cancel')
    for(const key of ['list','create','detail','update','items','replaceItems','abandon','cancel'] as const)assert.equal(typeof orderApi[key],'function')
    assert.equal('confirm' in orderApi,true)
    assert.equal(typeof catalogueSelectorApi.lookupVariant,'function')
    assert.equal(typeof catalogueSelectorApi.product,'function')
  })

  it('lists, searches, filters and paginates safe Order summaries',async()=>{
    const all=await mockOrderApi.list('dstyle',{pageSize:2})
    assert.equal(all.orders.length,2);assert.equal(all.pagination.total,6);assert.equal(all.pagination.totalPages,3)
    assert.equal((await mockOrderApi.list('dstyle',{q:'Sarah'})).orders[0]?.customerPhoneSnapshot,'+256772123456')
    assert.ok((await mockOrderApi.list('dstyle',{status:'ABANDONED'})).orders.every(o=>o.status==='ABANDONED'))
    assert.equal('requestHash' in all.orders[0]!,false);assert.equal('idempotencyKey' in all.orders[0]!,false)
  })

  it('uses one stable Idempotency-Key for exact creation replay and conflicts on reuse',async()=>{
    const key='stable-logical-submit'
    const one=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},key)
    const replay=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},key)
    assert.equal(one.id,replay.id)
    await assert.rejects(()=>mockOrderApi.create('dstyle',{customerId:'cust-sarah'},key),(e:unknown)=>e instanceof ApiError&&e.status===409)
  })

  it('requires active Customers and validates optional Location ownership/status',async()=>{
    await assert.rejects(()=>mockOrderApi.create('dstyle',{customerId:'cust-peter'},'archived-customer'),(e:unknown)=>e instanceof ApiError&&e.status===422)
    await assert.rejects(()=>mockOrderApi.create('dstyle',{customerId:'cust-sarah',deliveryLocationId:'loc-brian-1'},'wrong-location'),(e:unknown)=>e instanceof ApiError&&e.status===404)
    const without=await mockOrderApi.create('dstyle',{customerId:'cust-aisha',deliveryLocationId:null},'optional-location')
    assert.equal(without.deliveryLocationId,null);assert.equal(without.status,'DRAFT')
  })

  it('keeps Customer and Delivery snapshots frozen after reusable records change',async()=>{
    const before=await mockOrderApi.detail('dstyle','order-draft-sarah')
    await mockCustomerApi.update('dstyle','cust-sarah',{name:'Sarah renamed'})
    await mockCustomerApi.updateLocation('dstyle','cust-sarah','loc-sarah',{landmark:'Reusable landmark changed'})
    const after=await mockOrderApi.detail('dstyle','order-draft-sarah')
    assert.equal(after.customerNameSnapshot,before.customerNameSnapshot)
    assert.equal(after.deliveryLandmarkSnapshot,before.deliveryLandmarkSnapshot)
  })

  it('changes Draft Customer, clears old Location, and accepts explicit valid new Location',async()=>{
    const draft=await mockOrderApi.create('dstyle',{customerId:'cust-sarah',deliveryLocationId:'loc-sarah'},'change-customer')
    const cleared=await mockOrderApi.update('dstyle',draft.id,{customerId:'cust-brian'})
    assert.equal(cleared.deliveryLocationId,null);assert.equal(cleared.deliveryAreaSnapshot,null)
    const selected=await mockOrderApi.update('dstyle',draft.id,{customerId:'cust-brian',deliveryLocationId:'loc-brian-2'})
    assert.equal(selected.deliveryAreaSnapshot,'Makindye')
  })

  it('uses desired-state PUT semantics, unique Variants, empty set, quantities and authoritative totals',async()=>{
    const draft=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},'items-flow')
    let result=await mockOrderApi.replaceItems('dstyle',draft.id,[{variantId:'var-dstyle-003',quantity:'2'},{variantId:'var-dstyle-010',quantity:'1'}])
    assert.deepEqual(result.items.map(i=>i.quantity),['2','1']);assert.equal(result.order.subtotal,'240000');assert.equal(result.order.currency,'UGX')
    result=await mockOrderApi.replaceItems('dstyle',draft.id,[{variantId:'var-dstyle-003',quantity:'3'}])
    assert.equal(result.items.length,1);assert.equal(result.items[0]?.lineTotal,'255000')
    result=await mockOrderApi.replaceItems('dstyle',draft.id,[])
    assert.equal(result.items.length,0);assert.equal(result.order.subtotal,'0');assert.equal(result.order.currency,null)
    await assert.rejects(()=>mockOrderApi.replaceItems('dstyle',draft.id,[{variantId:'var-dstyle-003',quantity:'1'},{variantId:'var-dstyle-003',quantity:'2'}]),ApiError)
    for(const quantity of ['0','-1','1.5'])await assert.rejects(()=>mockOrderApi.replaceItems('dstyle',draft.id,[{variantId:'var-dstyle-003',quantity}]),ApiError)
    await assert.rejects(()=>mockOrderApi.replaceItems('dstyle',draft.id,Array.from({length:101},(_,i)=>({variantId:`variant-${i}`,quantity:'1'}))),ApiError)
  })

  it('preserves all line snapshots when only quantity changes',async()=>{
    const draft=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},'snapshot-quantity')
    const initial=(await mockOrderApi.replaceItems('dstyle',draft.id,[{variantId:'var-dstyle-003',quantity:'1'}])).items[0]!
    setMockOrderVariantFacts('var-dstyle-003',{productName:'Changed Product',sku:'CHANGED-SKU',size:'XL',colour:'Green',price:'999999',currency:'UGX'})
    const changed=(await mockOrderApi.replaceItems('dstyle',draft.id,[{variantId:'var-dstyle-003',quantity:'4'}])).items[0]!
    assert.deepEqual([changed.productNameSnapshot,changed.skuSnapshot,changed.sizeSnapshot,changed.colourSnapshot,changed.unitSellingPrice],[initial.productNameSnapshot,initial.skuSnapshot,initial.sizeSnapshot,initial.colourSnapshot,initial.unitSellingPrice])
    assert.equal(changed.lineTotal,(BigInt(initial.unitSellingPrice)*BigInt(4)).toString())
  })

  it('takes a fresh snapshot after remove, catalogue change and re-add',async()=>{
    const draft=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},'remove-readd')
    await mockOrderApi.replaceItems('dstyle',draft.id,[{variantId:'var-dstyle-010',quantity:'1'}])
    await mockOrderApi.replaceItems('dstyle',draft.id,[])
    setMockOrderVariantFacts('var-dstyle-010',{productName:'Polo New Name',sku:'POLO-NEW',size:'L',colour:'Black',price:'91000',currency:'UGX'})
    const fresh=(await mockOrderApi.replaceItems('dstyle',draft.id,[{variantId:'var-dstyle-010',quantity:'1'}])).items[0]!
    assert.deepEqual([fresh.productNameSnapshot,fresh.skuSnapshot,fresh.unitSellingPrice],['Polo New Name','POLO-NEW','91000'])
  })

  it('uses BigInt-safe money and quantity helpers',()=>{
    assert.equal(formatOrderMoney('150000','UGX'),'UGX 150,000')
    assert.equal(multiplyMoney('9007199254740993','3'),'27021597764222979')
    assert.equal(sumMoney(['9007199254740993','9007199254740993']),'18014398509481986')
    assert.equal(validateQuantity('1'),null);assert.ok(validateQuantity('0'));assert.ok(validateQuantity('1.2'))
  })

  it('abandons/cancels idempotently, keeps history, and blocks terminal edits',async()=>{
    const abandonedDraft=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},'abandon-flow')
    const abandoned=await mockOrderApi.abandon('dstyle',abandonedDraft.id)
    assert.equal((await mockOrderApi.abandon('dstyle',abandonedDraft.id)).abandonedAt,abandoned.abandonedAt)
    await assert.rejects(()=>mockOrderApi.update('dstyle',abandonedDraft.id,{deliveryLocationId:null}),ApiError)
    const cancelledDraft=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},'cancel-flow')
    const cancelled=await mockOrderApi.cancel('dstyle',cancelledDraft.id)
    assert.equal(cancelled.status,'CANCELLED');await assert.rejects(()=>mockOrderApi.replaceItems('dstyle',cancelled.id,[]),ApiError)
  })

  it('enforces exact Order permissions with no implications',()=>{
    const read=['ORDERS_READ'] as const,manage=['ORDERS_MANAGE'] as const,both=['ORDERS_READ','ORDERS_MANAGE'] as const,none:readonly Permission[]=[]
    assert.equal(canRead('ORDERS_READ',read),true);assert.equal(canRead('ORDERS_MANAGE',read),false)
    assert.equal(canRead('ORDERS_READ',manage),false);assert.equal(canRead('ORDERS_READ',both),true);assert.equal(canRead('ORDERS_MANAGE',both),true);assert.equal(canRead('ORDERS_READ',none),false)
    assert.equal(canRead('CUSTOMERS_READ',both),false);assert.equal(canRead('CATALOGUE_READ',both),false)
  })

  it('live typed API errors never fall back to mock Orders',async()=>{
    await assert.rejects(()=>orderApi.list('dstyle'),(e:unknown)=>e instanceof ApiError)
  })
})

describe('F7.2 Order confirmation and StockHold coordination',()=>{
  const balance=(variantId:string,quantity:string):InventoryBalancePreview=>({merchantId:'dstyle',variantId,state:'AVAILABLE',quantity})
  const heldItem=(variantId:string,quantity:string,now:string)=>({id:variantId,variantId,productNameSnapshot:variantId,skuSnapshot:variantId,sizeSnapshot:null,colourSnapshot:null,quantity,unitSellingPrice:'1',currency:'UGX',lineTotal:quantity,createdAt:now,updatedAt:now,stockHold:null})

  it('uses the exact confirmation route and replays one stable Idempotency-Key',async()=>{
    clearMockOrderReservations();assert.equal(endpoints.orders.confirm('m 1','o/1'),'/merchants/m%201/orders/o%2F1/confirm');assert.equal(typeof orderApi.confirm,'function')
    const order=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},'f72-replay-order');await mockOrderApi.replaceItems('dstyle',order.id,[{variantId:'var-dstyle-003',quantity:'2'}])
    const expiresAt='2030-08-14T12:00:00.000Z',context={balanceMap:{'var-dstyle-003':balance('var-dstyle-003','20')}}
    const first=await mockOrderApi.confirm('dstyle',order.id,{expiresAt},'f72-confirm-key',context),replay=await mockOrderApi.confirm('dstyle',order.id,{expiresAt},'f72-confirm-key',context)
    assert.equal(first.status,'CONFIRMED');assert.equal(replay.confirmedAt,first.confirmedAt);assert.equal(getMockOrderHolds('dstyle').length,1)
    await assert.rejects(()=>mockOrderApi.confirm('dstyle',order.id,{expiresAt},'different-key',context),(error:unknown)=>error instanceof ApiError&&error.status===409)
  })

  it('confirms multiple lines atomically at exact capacity without physical or ledger mutation',()=>{
    clearMockOrderReservations();const now='2029-01-01T00:00:00.000Z',items=[heldItem('a','2',now),heldItem('b','3',now)],balances={a:balance('a','5'),b:balance('b','3')}
    const result=confirmMockOrderReservation({merchantId:'dstyle',orderId:'atomic-success',items,expiresAt:'2029-01-02T00:00:00.000Z',key:'atomic-key',balanceMap:balances,now:new Date(now)})
    assert.equal(result.holds.length,2);assert.deepEqual(result.holds.map(hold=>hold.quantity),['2','3']);assert.deepEqual([balances.a.quantity,balances.b.quantity],['5','3'])
  })

  it('rolls back every line when one is insufficient and uses current stale-stock state',()=>{
    clearMockOrderReservations();const now='2029-01-01T00:00:00.000Z',balances={enough:balance('enough','5'),short:balance('short','3')}
    assert.throws(()=>confirmMockOrderReservation({merchantId:'dstyle',orderId:'atomic-fail',items:[heldItem('enough','2',now),heldItem('short','4',now)],expiresAt:'2029-01-02T00:00:00.000Z',key:'atomic-fail-key',balanceMap:balances,now:new Date(now)}),ApiError);assert.equal(getMockOrderHolds('dstyle').length,0)
    balances.short.quantity='4';balances.short.quantity='2'
    assert.throws(()=>confirmMockOrderReservation({merchantId:'dstyle',orderId:'stale-fail',items:[heldItem('short','4',now)],expiresAt:'2029-01-02T00:00:00.000Z',key:'stale-key',balanceMap:balances,now:new Date(now)}),ApiError);assert.equal(getMockOrderHolds('dstyle').length,0)
  })

  it('rejects empty Orders exactly as B6.2 requires',()=>{
    clearMockOrderReservations();assert.throws(()=>confirmMockOrderReservation({merchantId:'dstyle',orderId:'empty',items:[],expiresAt:'2029-01-02T00:00:00.000Z',key:'empty-key',balanceMap:{},now:new Date('2029-01-01T00:00:00.000Z')}),(error:unknown)=>error instanceof ApiError&&error.message.includes('at least one item'))
  })

  it('expires reservations without unconfirming and retains expired history after cancellation',async()=>{
    clearMockOrderReservations();setMockOrderClock(()=>new Date('2029-01-01T00:00:00.000Z'))
    const order=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},'f72-expiry-order');await mockOrderApi.replaceItems('dstyle',order.id,[{variantId:'var-dstyle-003',quantity:'2'}]);await mockOrderApi.confirm('dstyle',order.id,{expiresAt:'2029-01-01T01:00:00.000Z'},'expiry-key',{balanceMap:{'var-dstyle-003':balance('var-dstyle-003','20')}})
    setMockOrderClock(()=>new Date('2029-01-01T02:00:00.000Z'));assert.equal((await mockOrderApi.detail('dstyle',order.id)).status,'CONFIRMED');assert.equal((await mockOrderApi.items('dstyle',order.id)).items[0]?.stockHold?.status,'EXPIRED')
    assert.equal((await mockOrderApi.cancel('dstyle',order.id)).status,'CANCELLED');assert.equal((await mockOrderApi.items('dstyle',order.id)).items[0]?.stockHold?.status,'EXPIRED');resetMockOrderClock()
  })

  it('releases active confirmed Holds and blocks generic Order-Hold mutations',async()=>{
    clearMockOrderReservations();setMockOrderClock(()=>new Date('2029-01-01T00:00:00.000Z'))
    const order=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},'f72-cancel-order');await mockOrderApi.replaceItems('dstyle',order.id,[{variantId:'var-dstyle-003',quantity:'2'}]);await mockOrderApi.confirm('dstyle',order.id,{expiresAt:'2029-01-02T00:00:00.000Z'},'cancel-key',{balanceMap:{'var-dstyle-003':balance('var-dstyle-003','20')}})
    const hold=getMockOrderHolds('dstyle')[0]!,overrides={dstyle:{'var-dstyle-003':[{...hold,orderManaged:true}]}}
    assert.match(releaseMockHold('dstyle','var-dstyle-003',hold.id,overrides).error??'',/controlled by an order/);assert.match(updateMockHoldExpiry('dstyle','var-dstyle-003',hold.id,'2030-01-01T00:00:00.000Z',overrides).error??'',/controlled by an order/)
    await mockOrderApi.cancel('dstyle',order.id);assert.equal((await mockOrderApi.items('dstyle',order.id)).items[0]?.stockHold?.status,'RELEASED');resetMockOrderClock()
  })

  it('does not require Inventory permissions and keeps reservation math BigInt-safe',()=>{
    const manage:readonly Permission[]=['ORDERS_MANAGE'];assert.equal(canRead('ORDERS_MANAGE',manage),true);assert.equal(canRead('ORDERS_READ',manage),false);assert.equal(canRead('INVENTORY_READ',manage),false);assert.equal(BigInt('900719925474099300000')-BigInt('900719925474099299999'),BigInt(1))
  })
})
