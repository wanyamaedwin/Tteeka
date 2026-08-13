import { ApiError } from './api/errors'
import type { CreateOrderInput, DesiredOrderItem, Order, OrderItem, OrderItemsResponse, OrderListQuery, OrderListResponse, OrderPatch, ReplaceItemsResponse } from './api/orders'
import { mockCustomerApi } from './mock-customers'
import { MOCK_MERCHANT_PRODUCTS_FIXTURE } from './mock-catalogue'
import { MOCK_MERCHANT_VARIANTS_FIXTURE } from './mock-variants'
import { MOCK_MERCHANT_PRICING_FIXTURE } from './mock-pricing'
import { MOCK_MERCHANT_INVENTORY_FIXTURE } from './mock-inventory'
import { cancelMockOrderReservation, confirmMockOrderReservation, getMockOrderItemHold } from './mock-order-reservations'

const stamp='2026-08-13T09:00:00.000Z'
const base=(id:string,customerId:string,name:string|null,phone:string,status:Order['status'],subtotal:string,currency:string|null):Order=>({id,merchantId:'dstyle',customerId,status,customerNameSnapshot:name,customerPhoneSnapshot:phone,deliveryLocationId:null,deliveryAreaSnapshot:null,deliveryLandmarkSnapshot:null,deliveryPhoneSnapshot:null,deliveryInstructionsSnapshot:null,deliveryMapPinUrlSnapshot:null,currency,subtotal,createdAt:stamp,updatedAt:stamp,abandonedAt:status==='ABANDONED'?stamp:null,cancelledAt:status==='CANCELLED'?stamp:null,confirmedAt:null,stockHoldExpiresAt:null})
const orders:Order[]=[
  {...base('order-draft-sarah','cust-sarah','Sarah Nakato','+256772123456','DRAFT','240000','UGX'),deliveryLocationId:'loc-sarah',deliveryAreaSnapshot:'Ntinda',deliveryLandmarkSnapshot:'Near Capital Shoppers',deliveryPhoneSnapshot:'+256701234567',deliveryInstructionsSnapshot:'Call when you reach the gate.',deliveryMapPinUrlSnapshot:'https://maps.google.com/?q=Ntinda'},
  base('order-draft-aisha','cust-aisha','Aisha Namusoke','+256752404040','DRAFT','0',null),
  {...base('order-abandoned','cust-brian','Brian Ssempala (snapshot)','+256701555010','ABANDONED','85000','UGX'),deliveryAreaSnapshot:'Kisaasi',deliveryLandmarkSnapshot:'Old Shell landmark',deliveryPhoneSnapshot:'+256704333222'},
  base('order-cancelled','cust-peter','Peter Mugisha','+256782909090','CANCELLED','70000','UGX'),
  {...base('order-confirmed-expired','cust-brian','Brian Ssempala','+256701555010','CONFIRMED','85000','UGX'),deliveryLocationId:'loc-brian',deliveryAreaSnapshot:'Kisaasi',deliveryLandmarkSnapshot:'Near the old Shell station',deliveryPhoneSnapshot:'+256704333222',deliveryInstructionsSnapshot:'Call at the blue gate.',deliveryMapPinUrlSnapshot:'https://maps.google.com/?q=Kisaasi',confirmedAt:'2026-08-12T09:00:00.000Z',stockHoldExpiresAt:'2026-08-13T08:00:00.000Z'},
  {...base('order-confirmed-no-location','cust-peter','Peter Mugisha','+256782909090','CONFIRMED','70000','UGX'),confirmedAt:'2026-08-13T09:00:00.000Z',stockHoldExpiresAt:'2026-08-14T09:00:00.000Z'},
]
const item=(id:string,variantId:string,product:string,sku:string,size:string|null,colour:string|null,quantity:string,price:string):OrderItem=>({id,variantId,productNameSnapshot:product,skuSnapshot:sku,sizeSnapshot:size,colourSnapshot:colour,quantity,unitSellingPrice:price,currency:'UGX',lineTotal:(BigInt(quantity)*BigInt(price)).toString(),createdAt:stamp,updatedAt:stamp,stockHold:null})
const itemMap:Record<string,OrderItem[]>={
  'order-draft-sarah':[item('oi-1','var-dstyle-003','Classic Oxford Shirt','DS-OXF-WHT-M','M','White','2','85000'),item('oi-2','var-dstyle-010','Premium Polo Shirt','DS-POLO-BLK-L','L','Black','1','70000')],
  'order-abandoned':[item('oi-3','var-dstyle-002','Historic Oxford Shirt','HIST-OXF-L','L','White','1','85000')],
  'order-cancelled':[item('oi-4','var-dstyle-010','Premium Polo Shirt','DS-POLO-BLK-L','L','Black','1','70000')],
  'order-confirmed-expired':[{...item('oi-5','var-dstyle-003','Classic Oxford Shirt','DS-OXF-WHT-M','M','White','1','85000'),stockHold:{id:'expired-order-hold',quantity:'1',status:'EXPIRED',expiresAt:'2026-08-13T08:00:00.000Z',releasedAt:null,expiredAt:'2026-08-13T08:00:00.000Z'}}],
}
let sequence=200
const createKeys=new Map<string,{hash:string;orderId:string}>()
const variantOverrides=new Map<string,{productName:string;sku:string;size:string|null;colour:string|null;price:string;currency:string}>()
function findOrder(merchantId:string,orderId:string){const order=orders.find(row=>row.merchantId===merchantId&&row.id===orderId);if(!order)throw new ApiError({status:404,message:'Not found.'});return order}
async function references(merchantId:string,input:CreateOrderInput|OrderPatch,current?:Order){
  const customerId=input.customerId??current?.customerId
  if(!customerId)throw new ApiError({status:422,message:'Order reference is unavailable.'})
  const customer=await mockCustomerApi.detail(merchantId,customerId)
  if(customer.status!=='ACTIVE')throw new ApiError({status:422,message:'Order reference is unavailable.'})
  const hasLocation=Object.prototype.hasOwnProperty.call(input,'deliveryLocationId')
  const locationId=hasLocation?input.deliveryLocationId??null:(input.customerId&&input.customerId!==current?.customerId?null:current?.deliveryLocationId??null)
  const location=locationId?await mockCustomerApi.locationDetail(merchantId,customerId,locationId):null
  if(location&&location.status!=='ACTIVE')throw new ApiError({status:422,message:'Order reference is unavailable.'})
  return {customer,location}
}
function applySnapshots(order:Order,customer:Awaited<ReturnType<typeof mockCustomerApi.detail>>,location:Awaited<ReturnType<typeof mockCustomerApi.locationDetail>>|null){Object.assign(order,{customerId:customer.id,customerNameSnapshot:customer.name,customerPhoneSnapshot:customer.phone,deliveryLocationId:location?.id??null,deliveryAreaSnapshot:location?.area??null,deliveryLandmarkSnapshot:location?.landmark??null,deliveryPhoneSnapshot:location?.phone??null,deliveryInstructionsSnapshot:location?.instructions??null,deliveryMapPinUrlSnapshot:location?.mapPinUrl??null,updatedAt:new Date().toISOString()})}
function currentVariant(merchantId:string,variantId:string){
  const override=variantOverrides.get(variantId);if(override)return override
  const variant=MOCK_MERCHANT_VARIANTS_FIXTURE[merchantId]?.find(v=>v.id===variantId),product=MOCK_MERCHANT_PRODUCTS_FIXTURE[merchantId]?.find(p=>p.id===variant?.productId),price=MOCK_MERCHANT_PRICING_FIXTURE[merchantId]?.[variantId]
  if(!variant||variant.status!=='ACTIVE'||!product||product.status!=='ACTIVE'||!price)throw new ApiError({status:422,message:'One or more Order items are unavailable.'})
  return {productName:product.name,sku:variant.sku,size:variant.size,colour:variant.colour,price:price.sellingPrice,currency:price.currency}
}
export function setMockOrderVariantFacts(variantId:string,facts:{productName:string;sku:string;size:string|null;colour:string|null;price:string;currency:string}){variantOverrides.set(variantId,facts)}
export const mockOrderApi={
  async list(merchantId:string,query:OrderListQuery={}):Promise<OrderListResponse>{const page=query.page??1,pageSize=query.pageSize??20,q=query.q?.toLowerCase();let rows=orders.filter(o=>o.merchantId===merchantId&&(!query.status||o.status===query.status)&&(!query.customerId||o.customerId===query.customerId)&&(!q||o.customerNameSnapshot?.toLowerCase().includes(q)||o.customerPhoneSnapshot.includes(q)));rows=rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));return{orders:rows.slice((page-1)*pageSize,page*pageSize),pagination:{page,pageSize,total:rows.length,totalPages:Math.ceil(rows.length/pageSize)}}},
  async create(merchantId:string,input:CreateOrderInput,key:string){const hash=JSON.stringify([input.customerId,input.deliveryLocationId??null]),saved=createKeys.get(`${merchantId}:${key}`);if(saved){if(saved.hash!==hash)throw new ApiError({status:409,message:'Idempotency key already used.'});return{...findOrder(merchantId,saved.orderId)}}const {customer,location}=await references(merchantId,input);const order=base(`order-${++sequence}`,customer.id,customer.name,customer.phone,'DRAFT','0',null);order.merchantId=merchantId;applySnapshots(order,customer,location);orders.unshift(order);itemMap[order.id]=[];createKeys.set(`${merchantId}:${key}`,{hash,orderId:order.id});return{...order}},
  async detail(merchantId:string,orderId:string){return{...findOrder(merchantId,orderId)}},
  async update(merchantId:string,orderId:string,patch:OrderPatch){const order=findOrder(merchantId,orderId);if(order.status!=='DRAFT')throw new ApiError({status:409,message:'Order transition is not allowed.'});const refs=await references(merchantId,patch,order);applySnapshots(order,refs.customer,refs.location);return{...order}},
  async items(merchantId:string,orderId:string):Promise<OrderItemsResponse>{const order=findOrder(merchantId,orderId);return{orderId:order.id,currency:order.currency,subtotal:order.subtotal,items:(itemMap[order.id]??[]).map(i=>({...i,stockHold:getMockOrderItemHold(merchantId,orderId,i.variantId)??i.stockHold}))}},
  async replaceItems(merchantId:string,orderId:string,desired:DesiredOrderItem[]):Promise<ReplaceItemsResponse>{const order=findOrder(merchantId,orderId);if(order.status!=='DRAFT')throw new ApiError({status:409,message:'Order transition is not allowed.'});if(desired.length>100||new Set(desired.map(i=>i.variantId)).size!==desired.length)throw new ApiError({status:400,message:'Invalid Order item request.'});const previous=itemMap[order.id]??[];const next=desired.map(d=>{if(!/^\d+$/.test(d.quantity)||BigInt(d.quantity)<=BigInt(0))throw new ApiError({status:400,message:'Invalid Order item request.'});const old=previous.find(i=>i.variantId===d.variantId);if(old)return{...old,quantity:BigInt(d.quantity).toString(),lineTotal:(BigInt(old.unitSellingPrice)*BigInt(d.quantity)).toString(),updatedAt:new Date().toISOString()};const v=currentVariant(merchantId,d.variantId);return item(`oi-${++sequence}`,d.variantId,v.productName,v.sku,v.size,v.colour,BigInt(d.quantity).toString(),v.price)})
    const currencies=new Set(next.map(i=>i.currency));if(currencies.size>1)throw new ApiError({status:422,message:'Order items must use one currency.'});itemMap[order.id]=next;order.currency=next[0]?.currency??null;order.subtotal=next.reduce((sum,i)=>sum+BigInt(i.lineTotal),BigInt(0)).toString();order.updatedAt=new Date().toISOString();return{order:{...order},items:next.map(i=>({...i}))}},
  async abandon(merchantId:string,orderId:string){return transition(merchantId,orderId,'ABANDONED')},async cancel(merchantId:string,orderId:string){return transition(merchantId,orderId,'CANCELLED')},
  async confirm(merchantId:string,orderId:string,input:{expiresAt:string},key:string,context?:{balanceMap?:typeof MOCK_MERCHANT_INVENTORY_FIXTURE[string];holdOverrides?:Record<string,Record<string,import('./mock-inventory').StockHoldPreview[]>>}){const order=findOrder(merchantId,orderId);if(order.status!=='DRAFT'&&order.status!=='CONFIRMED')throw new ApiError({status:409,message:'Order transition is not allowed.'});const confirmation=confirmMockOrderReservation({merchantId,orderId,items:itemMap[order.id]??[],expiresAt:input.expiresAt,key,balanceMap:context?.balanceMap??MOCK_MERCHANT_INVENTORY_FIXTURE[merchantId]??{},genericHoldOverrides:context?.holdOverrides});order.status='CONFIRMED';order.confirmedAt=confirmation.confirmedAt;order.stockHoldExpiresAt=confirmation.expiresAt;order.updatedAt=confirmation.confirmedAt;return{...order}},
}
function transition(merchantId:string,orderId:string,target:'ABANDONED'|'CANCELLED'){const order=findOrder(merchantId,orderId);if(order.status===target)return{...order};if(order.status!=='DRAFT'&&!(target==='CANCELLED'&&order.status==='CONFIRMED'))throw new ApiError({status:409,message:'Order transition is not allowed.'});order.status=target;const now=new Date().toISOString();order.updatedAt=now;if(target==='ABANDONED')order.abandonedAt=now;else{order.cancelledAt=now;cancelMockOrderReservation(merchantId,orderId)}return{...order}}
