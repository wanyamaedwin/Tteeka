import { isMockMode } from './config'
import { paymentApi } from './api/payments'
import { mockPaymentApi } from './mock-payments'
export const paymentsService=()=>isMockMode()?mockPaymentApi:paymentApi
