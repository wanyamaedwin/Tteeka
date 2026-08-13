import { isMockMode } from './config'
import { orderApi } from './api/orders'
import { mockOrderApi } from './mock-orders'
export const ordersService=()=>isMockMode()?mockOrderApi:orderApi
