import { isMockMode } from './config'
import { deliveryApi } from './api/deliveries'
import { mockDeliveryApi } from './mock-deliveries'
export const deliveriesService=()=>isMockMode()?mockDeliveryApi:deliveryApi
