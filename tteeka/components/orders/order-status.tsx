import { StatusPill } from '@/components/app-shell'
import type { OrderStatus } from '@/lib/api/orders'
const labels:Record<OrderStatus,string>={DRAFT:'Draft',CONFIRMED:'Confirmed',FULFILLED:'Fulfilled',COMPLETED:'Completed',ABANDONED:'Abandoned',CANCELLED:'Cancelled'}
export function OrderStatusBadge({status}:{status:OrderStatus}){return <StatusPill status={labels[status]}/>}
