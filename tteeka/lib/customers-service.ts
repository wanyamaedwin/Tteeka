import { isMockMode } from './config'
import { customerApi } from './api/customers'
import { mockCustomerApi } from './mock-customers'

export const customersService = () => isMockMode() ? mockCustomerApi : customerApi
