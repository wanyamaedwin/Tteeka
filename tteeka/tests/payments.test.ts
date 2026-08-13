import assert from 'node:assert/strict'
import { describe,it } from 'node:test'
import { endpoints } from '../lib/api/endpoints'
import { paymentApi } from '../lib/api/payments'
import { mockPaymentApi,mockProviderOperationCount } from '../lib/mock-payments'
import { mockOrderApi } from '../lib/mock-orders'
import { ApiError } from '../lib/api/errors'
import { canRead,type Permission } from '../lib/workspaces'

describe('F8.1 Payment Transactions and manual verification',()=>{
  it('preserves B7.1 and adds exactly the two B7.2 operations',()=>{
    assert.equal(endpoints.payments.list('m 1','o/1'),'/merchants/m%201/orders/o%2F1/payments')
    assert.equal(endpoints.payments.item('m','o','p/1'),'/merchants/m/orders/o/payments/p%2F1')
    assert.equal(endpoints.payments.verificationPending('m','o','p'),'/merchants/m/orders/o/payments/p/verification-pending')
    assert.equal(endpoints.payments.verify('m','o','p'),'/merchants/m/orders/o/payments/p/verify')
    assert.equal(endpoints.payments.reject('m','o','p'),'/merchants/m/orders/o/payments/p/reject')
    assert.equal(endpoints.payments.summary('m','o'),'/merchants/m/orders/o/payment-summary')
    assert.equal(endpoints.payments.providerVerify('m','o','p'),'/merchants/m/orders/o/payments/p/provider-verify')
    assert.equal(endpoints.payments.verificationAttempts('m','o','p'),'/merchants/m/orders/o/payments/p/verification-attempts')
    for(const key of ['list','report','detail','verificationPending','verify','reject','summary','providerVerify','verificationAttempts'] as const)assert.equal(typeof paymentApi[key],'function')
  })

  it('reports Cash idempotently, excludes it until verification, and keeps Order unchanged',async()=>{
    const before=await mockOrderApi.detail('dstyle','order-draft-sarah'),key='cash-report-key'
    const first=await mockPaymentApi.report('dstyle',before.id,{method:'CASH',amount:'10000',payerPhone:null,merchantReference:'Till 9'},key)
    const replay=await mockPaymentApi.report('dstyle',before.id,{method:'CASH',amount:'10000',payerPhone:null,merchantReference:'Till 9'},key)
    assert.equal(first.id,replay.id);assert.equal(first.status,'REPORTED');assert.equal(first.providerReference,null)
    assert.equal((await mockPaymentApi.summary('dstyle',before.id)).verifiedAmount,'0')
    assert.equal((await mockOrderApi.detail('dstyle',before.id)).status,before.status)
    await assert.rejects(()=>mockPaymentApi.report('dstyle',before.id,{method:'CASH',amount:'10001'},key),(e:unknown)=>e instanceof ApiError&&e.status===409)
  })

  it('reports MTN and Airtel with canonical phones and optional provider references',async()=>{
    const mtn=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'20000',payerPhone:'0772 123 456'},'mtn-report-key')
    const airtel=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'AIRTEL_MONEY',amount:'30000',payerPhone:'0701555010',providerReference:' AIR-44 '},'airtel-report-key')
    assert.equal(mtn.payerPhone,'+256772123456');assert.equal(mtn.providerReference,null);assert.equal(airtel.payerPhone,'+256701555010');assert.equal(airtel.providerReference,'AIR-44')
    assert.equal((await mockPaymentApi.summary('dstyle','order-draft-sarah')).verifiedAmount,'0')
  })

  it('rejects Cash provider references and missing/invalid Mobile Money phone',async()=>{
    await assert.rejects(()=>mockPaymentApi.report('dstyle','order-draft-sarah',{method:'CASH',amount:'1',providerReference:'forbidden'},'cash-ref'),ApiError)
    await assert.rejects(()=>mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'1'},'phone-missing'),ApiError)
    await assert.rejects(()=>mockPaymentApi.report('dstyle','order-draft-sarah',{method:'AIRTEL_MONEY',amount:'1',payerPhone:'123'},'phone-invalid'),ApiError)
  })

  it('supports pending, direct Mobile verify, Cash verify and rejection with verified-only summary',async()=>{
    const cash=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'CASH',amount:'30000'},'verify-cash')
    await mockPaymentApi.verify('dstyle','order-draft-sarah',cash.id)
    assert.equal((await mockPaymentApi.summary('dstyle','order-draft-sarah')).status,'PARTIALLY_PAID')
    const mobile=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'40000',payerPhone:'0712345678'},'pending-mobile')
    await mockPaymentApi.verificationPending('dstyle','order-draft-sarah',mobile.id)
    assert.equal((await mockPaymentApi.summary('dstyle','order-draft-sarah')).verifiedAmount,'30000')
    await mockPaymentApi.verify('dstyle','order-draft-sarah',mobile.id)
    const direct=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'AIRTEL_MONEY',amount:'170000',payerPhone:'0752123456'},'direct-mobile')
    await mockPaymentApi.verify('dstyle','order-draft-sarah',direct.id)
    assert.equal((await mockPaymentApi.summary('dstyle','order-draft-sarah')).status,'PAID')
    const rejected=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'10000',payerPhone:'0772123456'},'reject-mobile')
    await mockPaymentApi.reject('dstyle','order-draft-sarah',rejected.id)
    assert.equal((await mockPaymentApi.detail('dstyle','order-draft-sarah',rejected.id)).status,'REJECTED')
    assert.equal((await mockPaymentApi.summary('dstyle','order-draft-sarah')).status,'PAID')
  })

  it('aggregates multiple VERIFIED payments into partial, paid, and overpaid states using BigInt',async()=>{
    const order=await mockOrderApi.create('dstyle',{customerId:'cust-aisha'},'summary-order');await mockOrderApi.replaceItems('dstyle',order.id,[{variantId:'var-dstyle-003',quantity:'2'}])
    for(const [amount,key] of [['30000','sum-a'],['140000','sum-b']] as const){const payment=await mockPaymentApi.report('dstyle',order.id,{method:'CASH',amount},key);await mockPaymentApi.verify('dstyle',order.id,payment.id)}
    assert.deepEqual(await mockPaymentApi.summary('dstyle',order.id),{orderId:order.id,currency:'UGX',orderAmount:'170000',verifiedAmount:'170000',amountDue:'0',overpaidAmount:'0',status:'PAID'})
    const extra=await mockPaymentApi.report('dstyle',order.id,{method:'CASH',amount:'9223372036854775807'},'sum-extra');await mockPaymentApi.verify('dstyle',order.id,extra.id)
    const over=await mockPaymentApi.summary('dstyle',order.id);assert.equal(over.status,'OVERPAID');assert.equal(over.overpaidAmount,(BigInt('9223372036854775807')).toString())
  })

  it('keeps a zero empty Order UNPAID and rejects reporting to it or terminal Orders',async()=>{
    assert.equal((await mockPaymentApi.summary('dstyle','order-draft-aisha')).status,'UNPAID')
    await assert.rejects(()=>mockPaymentApi.report('dstyle','order-draft-aisha',{method:'CASH',amount:'1'},'zero-order'),ApiError)
    await assert.rejects(()=>mockPaymentApi.report('dstyle','order-cancelled',{method:'CASH',amount:'1'},'terminal-order'),ApiError)
  })

  it('serializes verify/reject outcomes and leaves terminal states actionless',async()=>{
    const payment=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'CASH',amount:'1'},'race-payment');await mockPaymentApi.verify('dstyle','order-draft-sarah',payment.id)
    await assert.rejects(()=>mockPaymentApi.reject('dstyle','order-draft-sarah',payment.id),(e:unknown)=>e instanceof ApiError&&e.status===409)
    assert.equal((await mockPaymentApi.detail('dstyle','order-draft-sarah',payment.id)).status,'VERIFIED')
  })

  it('preserves Order, reservation, physical Inventory and ledger independence',async()=>{
    const before=await mockOrderApi.detail('dstyle','order-confirmed-expired'),items=await mockOrderApi.items('dstyle',before.id),payment=await mockPaymentApi.report('dstyle',before.id,{method:'CASH',amount:'1'},'independent-payment');await mockPaymentApi.verify('dstyle',before.id,payment.id)
    const after=await mockOrderApi.detail('dstyle',before.id),afterItems=await mockOrderApi.items('dstyle',before.id);assert.equal(after.status,before.status);assert.equal(after.stockHoldExpiresAt,before.stockHoldExpiresAt);assert.deepEqual(afterItems.items.map(i=>i.stockHold),items.items.map(i=>i.stockHold))
  })

  it('keeps Payment and Orders/Inventory permissions exact and independent',()=>{
    const read:readonly Permission[]=['PAYMENTS_READ'],manage:readonly Permission[]=['PAYMENTS_MANAGE'],both:readonly Permission[]=['PAYMENTS_READ','PAYMENTS_MANAGE']
    assert.equal(canRead('PAYMENTS_READ',read),true);assert.equal(canRead('PAYMENTS_MANAGE',read),false);assert.equal(canRead('PAYMENTS_READ',manage),false);assert.equal(canRead('PAYMENTS_READ',both),true);assert.equal(canRead('ORDERS_READ',both),false);assert.equal(canRead('INVENTORY_READ',both),false)
  })

  it('live API failure never falls back to mock Payments',async()=>{await assert.rejects(()=>paymentApi.list('dstyle','order'),(e:unknown)=>e instanceof ApiError)})
})

describe('F8.2 provider verification attempts',()=>{
  it('records provider success, sets immutable PROVIDER source, and updates summary',async()=>{const payment=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'5000',payerPhone:'0772000111',providerReference:'VERIFY-ONE'},'f82-success-report'),before=await mockPaymentApi.summary('dstyle','order-draft-sarah'),result=await mockPaymentApi.providerVerify('dstyle','order-draft-sarah',payment.id,'f82-success-check'),after=await mockPaymentApi.summary('dstyle','order-draft-sarah');assert.equal(result.attempt.status,'VERIFIED');assert.equal(result.payment.status,'VERIFIED');assert.equal(result.payment.verificationSource,'PROVIDER');assert.equal(BigInt(after.verifiedAmount)-BigInt(before.verifiedAmount),BigInt(5000));assert.equal((await mockPaymentApi.verify('dstyle','order-draft-sarah',payment.id)).verificationSource,'PROVIDER')})
  it('keeps NOT_VERIFIED attempt independent from Payment and summary',async()=>{const payment=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'AIRTEL_MONEY',amount:'6000',payerPhone:'0701000111',providerReference:'NO-MATCH-ONE'},'f82-no-report'),before=await mockPaymentApi.summary('dstyle','order-draft-sarah'),result=await mockPaymentApi.providerVerify('dstyle','order-draft-sarah',payment.id,'f82-no-check'),after=await mockPaymentApi.summary('dstyle','order-draft-sarah');assert.equal(result.attempt.status,'NOT_VERIFIED');assert.equal(result.payment.status,'REPORTED');assert.equal(result.payment.verificationSource,null);assert.equal(after.verifiedAmount,before.verifiedAmount)})
  it('keeps technical FAILED attempt independent from Payment',async()=>{const payment=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'7000',payerPhone:'0772000222',providerReference:'FAIL-ONE'},'f82-fail-report'),result=await mockPaymentApi.providerVerify('dstyle','order-draft-sarah',payment.id,'f82-fail-check');assert.equal(result.attempt.status,'FAILED');assert.equal(result.payment.status,'REPORTED');assert.notEqual(result.payment.status,'FAILED')})
  it('mirrors unavailable as one completed FAILED attempt and an unchanged Payment',async()=>{const payment=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'8000',payerPhone:'0772000333',providerReference:'UNAVAILABLE-ONE'},'f82-unavailable-report'),key='f82-unavailable-check';await assert.rejects(()=>mockPaymentApi.providerVerify('dstyle','order-draft-sarah',payment.id,key),(e:unknown)=>e instanceof ApiError&&e.status===503);await assert.rejects(()=>mockPaymentApi.providerVerify('dstyle','order-draft-sarah',payment.id,key),(e:unknown)=>e instanceof ApiError&&e.status===503);const history=await mockPaymentApi.verificationAttempts('dstyle','order-draft-sarah',payment.id);assert.equal(history.total,1);assert.equal(history.items[0].status,'FAILED');assert.ok(history.items[0].completedAt);assert.equal(mockProviderOperationCount(payment.id),1);assert.equal((await mockPaymentApi.detail('dstyle','order-draft-sarah',payment.id)).status,'REPORTED')})
  it('replays the same Attempt without another provider operation',async()=>{const payment=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'9000',payerPhone:'0772000444',providerReference:'NO-MATCH-REPLAY'},'f82-replay-report'),key='f82-replay-check',first=await mockPaymentApi.providerVerify('dstyle','order-draft-sarah',payment.id,key),again=await mockPaymentApi.providerVerify('dstyle','order-draft-sarah',payment.id,key);assert.equal(first.attempt.id,again.attempt.id);assert.equal(mockProviderOperationCount(payment.id),1);assert.equal((await mockPaymentApi.verificationAttempts('dstyle','order-draft-sarah',payment.id)).total,1)})
  it('conflicts when a Merchant key is reused for another fingerprint without mutation',async()=>{const one=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'1000',payerPhone:'0772000555',providerReference:'NO-MATCH-A'},'f82-conflict-a'),two=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'1000',payerPhone:'0772000666',providerReference:'NO-MATCH-B'},'f82-conflict-b'),key='f82-shared-key';await mockPaymentApi.providerVerify('dstyle','order-draft-sarah',one.id,key);await assert.rejects(()=>mockPaymentApi.providerVerify('dstyle','order-draft-sarah',two.id,key),(e:unknown)=>e instanceof ApiError&&e.status===409);assert.equal((await mockPaymentApi.detail('dstyle','order-draft-sarah',two.id)).status,'REPORTED')})
  it('rejects Cash and missing references without creating Attempts',async()=>{const cash=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'CASH',amount:'1'},'f82-cash'),mobile=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'1',payerPhone:'0772000777'},'f82-missing');await assert.rejects(()=>mockPaymentApi.providerVerify('dstyle','order-draft-sarah',cash.id,'f82-cash-check'),(e:unknown)=>e instanceof ApiError&&e.status===422);await assert.rejects(()=>mockPaymentApi.providerVerify('dstyle','order-draft-sarah',mobile.id,'f82-missing-check'),(e:unknown)=>e instanceof ApiError&&e.status===422);assert.equal((await mockPaymentApi.verificationAttempts('dstyle','order-draft-sarah',cash.id)).total,0);assert.equal((await mockPaymentApi.verificationAttempts('dstyle','order-draft-sarah',mobile.id)).total,0)})
  it('lets the first manual/provider transition own source',async()=>{const manual=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'2',payerPhone:'0772000888',providerReference:'VERIFY-RACE'},'f82-race-manual');await mockPaymentApi.verify('dstyle','order-draft-sarah',manual.id);await assert.rejects(()=>mockPaymentApi.providerVerify('dstyle','order-draft-sarah',manual.id,'f82-race-late'),ApiError);assert.equal((await mockPaymentApi.detail('dstyle','order-draft-sarah',manual.id)).verificationSource,'MANUAL');const provider=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'3',payerPhone:'0772000999',providerReference:'VERIFY-RACE-TWO'},'f82-race-provider');await mockPaymentApi.providerVerify('dstyle','order-draft-sarah',provider.id,'f82-race-first');assert.equal((await mockPaymentApi.verify('dstyle','order-draft-sarah',provider.id)).verificationSource,'PROVIDER')})
  it('returns newest-first serializer-safe history fields only',async()=>{const history=await mockPaymentApi.verificationAttempts('dstyle','order-confirmed-expired','pay-reported-mtn');assert.equal(history.items[0].id,'attempt-unavailable');assert.equal(history.items[1].id,'attempt-failed');const serialized=JSON.stringify(history);for(const field of ['idempotencyKey','requestHash','payerPhoneSnapshot','amountSnapshot','currencySnapshot','providerReferenceSnapshot'])assert.equal(serialized.includes(field),false)})
  it('counts MANUAL and PROVIDER verified amounts identically',async()=>{const manual=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'CASH',amount:'4'},'f82-summary-manual'),provider=await mockPaymentApi.report('dstyle','order-draft-sarah',{method:'MTN_MOMO',amount:'4',payerPhone:'0772111222',providerReference:'VERIFY-SUMMARY'},'f82-summary-provider'),before=await mockPaymentApi.summary('dstyle','order-draft-sarah');await mockPaymentApi.verify('dstyle','order-draft-sarah',manual.id);await mockPaymentApi.providerVerify('dstyle','order-draft-sarah',provider.id,'f82-summary-check');const after=await mockPaymentApi.summary('dstyle','order-draft-sarah');assert.equal(BigInt(after.verifiedAmount)-BigInt(before.verifiedAmount),BigInt(8))})
  it('keeps payments.read and payments.manage exact and independent',()=>{const read:readonly Permission[]=['PAYMENTS_READ'],manage:readonly Permission[]=['PAYMENTS_MANAGE'],both:readonly Permission[]=['PAYMENTS_READ','PAYMENTS_MANAGE'];assert.equal(canRead('PAYMENTS_READ',read),true);assert.equal(canRead('PAYMENTS_MANAGE',read),false);assert.equal(canRead('PAYMENTS_READ',manage),false);assert.equal(canRead('PAYMENTS_MANAGE',manage),true);assert.equal(canRead('PAYMENTS_READ',both),true);assert.equal(canRead('ORDERS_MANAGE',both),false);assert.equal(canRead('INVENTORY_MANAGE',both),false)})
})
