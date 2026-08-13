import { apiRequest } from './client'
import { endpoints } from './endpoints'

export type PaymentMethod = 'CASH' | 'MTN_MOMO' | 'AIRTEL_MONEY'
export type PaymentStatus = 'REPORTED' | 'VERIFICATION_PENDING' | 'VERIFIED' | 'REJECTED' | 'FAILED' | 'REVERSED' | 'REFUNDED'
export type PaymentSummaryStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID' | 'REFUNDED'
export type PaymentVerificationSource = 'MANUAL' | 'PROVIDER'
export type PaymentProvider = 'MTN_MOMO' | 'AIRTEL_MONEY'
export type VerificationAttemptStatus = 'PENDING' | 'VERIFIED' | 'NOT_VERIFIED' | 'FAILED'
export type PaymentTransaction = {
  id:string;orderId:string;method:PaymentMethod;status:PaymentStatus;verificationSource:PaymentVerificationSource|null;amount:string;currency:string
  payerPhone:string|null;providerReference:string|null;merchantReference:string|null;note:string|null
  reportedAt:string;verificationPendingAt:string|null;verifiedAt:string|null;rejectedAt:string|null
  failedAt:string|null;reversedAt:string|null;refundedAt:string|null;createdAt:string;updatedAt:string
}
export type ReportPaymentInput = {method:PaymentMethod;amount:string;payerPhone?:string|null;providerReference?:string|null;merchantReference?:string|null;note?:string|null}
export type PaymentListQuery = {status?:PaymentStatus;method?:PaymentMethod;page?:number;pageSize?:number}
export type PaymentListResponse = {items:PaymentTransaction[];page:number;pageSize:number;total:number}
export type PaymentSummary = {orderId:string;currency:string|null;orderAmount:string;verifiedAmount:string;amountDue:string;overpaidAmount:string;status:PaymentSummaryStatus}
export type VerificationAttempt = {id:string;provider:PaymentProvider;status:VerificationAttemptStatus;providerTransactionId:string|null;providerStatusCode:string|null;providerStatusText:string|null;failureCode:string|null;failureMessage:string|null;requestedAt:string;completedAt:string|null;createdAt:string}
export type VerificationAttemptListQuery = {status?:VerificationAttemptStatus;page?:number;pageSize?:number}
export type VerificationAttemptListResponse = {items:VerificationAttempt[];page:number;pageSize:number;total:number}
export type ProviderVerifyResponse = {payment:Pick<PaymentTransaction,'id'|'status'|'verificationSource'|'verifiedAt'>;attempt:VerificationAttempt}

const command=(path:string,context:string)=>apiRequest<PaymentTransaction>(path,{method:'POST',requestContext:context})
export const paymentApi={
  list:(merchantId:string,orderId:string,query:PaymentListQuery={})=>apiRequest<PaymentListResponse>(endpoints.payments.list(merchantId,orderId),{query,requestContext:'payments.list'}),
  report:(merchantId:string,orderId:string,input:ReportPaymentInput,key:string)=>apiRequest<PaymentTransaction>(endpoints.payments.list(merchantId,orderId),{method:'POST',body:input,headers:{'Idempotency-Key':key},requestContext:'payments.report'}),
  detail:(merchantId:string,orderId:string,paymentId:string)=>apiRequest<PaymentTransaction>(endpoints.payments.item(merchantId,orderId,paymentId),{requestContext:'payments.detail'}),
  verificationPending:(merchantId:string,orderId:string,paymentId:string)=>command(endpoints.payments.verificationPending(merchantId,orderId,paymentId),'payments.verificationPending'),
  verify:(merchantId:string,orderId:string,paymentId:string)=>command(endpoints.payments.verify(merchantId,orderId,paymentId),'payments.verify'),
  reject:(merchantId:string,orderId:string,paymentId:string)=>command(endpoints.payments.reject(merchantId,orderId,paymentId),'payments.reject'),
  providerVerify:(merchantId:string,orderId:string,paymentId:string,key:string)=>apiRequest<ProviderVerifyResponse>(endpoints.payments.providerVerify(merchantId,orderId,paymentId),{method:'POST',body:{},headers:{'Idempotency-Key':key},requestContext:'payments.providerVerify'}),
  verificationAttempts:(merchantId:string,orderId:string,paymentId:string,query:VerificationAttemptListQuery={})=>apiRequest<VerificationAttemptListResponse>(endpoints.payments.verificationAttempts(merchantId,orderId,paymentId),{query,requestContext:'payments.verificationAttempts'}),
  summary:(merchantId:string,orderId:string)=>apiRequest<PaymentSummary>(endpoints.payments.summary(merchantId,orderId),{requestContext:'payments.summary'}),
}
