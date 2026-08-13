import { apiRequest } from './client'
import { endpoints } from './endpoints'
import type { PaginationMeta } from './types'

export type DeliveryStatus='PENDING'|'READY'|'DISPATCHED'|'DELIVERED'|'FAILED'|'CANCELLED'
export type DeliveryAttemptResult='DELIVERED'|'FAILED'
export type DeliveryFailureReason='CUSTOMER_UNREACHABLE'|'CUSTOMER_UNAVAILABLE'|'CUSTOMER_REFUSED'|'WRONG_LOCATION'|'ADDRESS_NOT_FOUND'|'VEHICLE_OR_RIDER_ISSUE'|'WEATHER_OR_ACCESS_ISSUE'|'OTHER'
export type DeliverySummary={id:string;orderId:string;status:DeliveryStatus;recipientNameSnapshot:string|null;deliveryPhoneSnapshot:string;areaSnapshot:string;landmarkSnapshot:string;createdAt:string;updatedAt:string;readyAt:string|null;dispatchedAt:string|null;deliveredAt:string|null;failedAt:string|null;cancelledAt:string|null}
export type DeliveryJob=DeliverySummary&{recipientPhoneSnapshot:string;instructionsSnapshot:string|null;mapPinUrlSnapshot:string|null}
export type DeliveryAttempt={id:string;deliveryJobId:string;attemptNumber:number;result:DeliveryAttemptResult;failureReason:DeliveryFailureReason|null;note:string|null;attemptedAt:string;createdAt:string}
export type DeliveryListQuery={q?:string;orderId?:string;status?:DeliveryStatus;createdFrom?:string;createdTo?:string;page?:number;pageSize?:number}
export type DeliveryListResponse={deliveries:DeliverySummary[];pagination:PaginationMeta}
export type DeliveryAttemptListQuery={result?:DeliveryAttemptResult;failureReason?:DeliveryFailureReason;page?:number;pageSize?:number}
export type DeliveryAttemptListResponse={deliveryId:string;attempts:DeliveryAttempt[];pagination:PaginationMeta}
export type RecordDeliveryAttemptInput={result:'DELIVERED';failureReason?:null;note?:string|null}|{result:'FAILED';failureReason:DeliveryFailureReason;note?:string|null}
export type RecordDeliveryAttemptResponse={delivery:DeliveryJob;attempt:DeliveryAttempt}
const command=(path:string,context:string)=>apiRequest<DeliveryJob>(path,{method:'POST',requestContext:context})
export const deliveryApi={
 list:(merchantId:string,query:DeliveryListQuery={})=>apiRequest<DeliveryListResponse>(endpoints.deliveries.list(merchantId),{query,requestContext:'deliveries.list'}),
 create:(merchantId:string,orderId:string,key:string)=>apiRequest<DeliveryJob>(endpoints.deliveries.list(merchantId),{method:'POST',body:{orderId},headers:{'Idempotency-Key':key},requestContext:'deliveries.create'}),
 detail:(merchantId:string,deliveryId:string)=>apiRequest<DeliveryJob>(endpoints.deliveries.item(merchantId,deliveryId),{requestContext:'deliveries.detail'}),
 ready:(merchantId:string,deliveryId:string)=>command(endpoints.deliveries.ready(merchantId,deliveryId),'deliveries.ready'),
 dispatch:(merchantId:string,deliveryId:string)=>command(endpoints.deliveries.dispatch(merchantId,deliveryId),'deliveries.dispatch'),
 cancel:(merchantId:string,deliveryId:string)=>command(endpoints.deliveries.cancel(merchantId,deliveryId),'deliveries.cancel'),
 attempts:(merchantId:string,deliveryId:string,query:DeliveryAttemptListQuery={})=>apiRequest<DeliveryAttemptListResponse>(endpoints.deliveries.attempts(merchantId,deliveryId),{query,requestContext:'deliveries.attempts'}),
 recordAttempt:(merchantId:string,deliveryId:string,input:RecordDeliveryAttemptInput,key:string)=>apiRequest<RecordDeliveryAttemptResponse>(endpoints.deliveries.attempts(merchantId,deliveryId),{method:'POST',body:input,headers:{'Idempotency-Key':key},requestContext:'deliveries.attempts.record'}),
}
