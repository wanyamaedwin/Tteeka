const segment = (value: string) => encodeURIComponent(value)
const merchant = (merchantId: string) => `/merchants/${segment(merchantId)}`

export const endpoints = {
  auth: {
    login: '/auth/login', me: '/auth/me', logout: '/auth/logout', logoutAll: '/auth/logout-all',
  },
  merchant: {
    context: (merchantId: string) => `${merchant(merchantId)}/context`,
    profile: (merchantId: string) => `${merchant(merchantId)}/profile`,
    settings: (merchantId: string) => `${merchant(merchantId)}/settings`,
  },
  staff: {
    list: (merchantId: string) => `${merchant(merchantId)}/staff`,
    item: (merchantId: string, membershipId: string) => `${merchant(merchantId)}/staff/${segment(membershipId)}`,
    roles: (merchantId: string, membershipId: string) => `${merchant(merchantId)}/staff/${segment(membershipId)}/roles`,
  },
  roles: {
    list: (merchantId: string) => `${merchant(merchantId)}/roles`,
    item: (merchantId: string, roleId: string) => `${merchant(merchantId)}/roles/${segment(roleId)}`,
    permissions: (merchantId: string, roleId: string) => `${merchant(merchantId)}/roles/${segment(roleId)}/permissions`,
    allPermissions: (merchantId: string) => `${merchant(merchantId)}/permissions`,
  },
  catalogue: {
    products: (merchantId: string) => `${merchant(merchantId)}/products`,
    product: (merchantId: string, productId: string) => `${merchant(merchantId)}/products/${segment(productId)}`,
    variants: (merchantId: string, productId: string) => `${merchant(merchantId)}/products/${segment(productId)}/variants`,
    variant: (merchantId: string, productId: string, variantId: string) => `${merchant(merchantId)}/products/${segment(productId)}/variants/${segment(variantId)}`,
    price: (merchantId: string, productId: string, variantId: string) => `${merchant(merchantId)}/products/${segment(productId)}/variants/${segment(variantId)}/price`,
    priceHistory: (merchantId: string, productId: string, variantId: string) => `${merchant(merchantId)}/products/${segment(productId)}/variants/${segment(variantId)}/price-history`,
    lookupVariant: (merchantId: string) => `${merchant(merchantId)}/variants/lookup`,
  },
  inventory: {
    list: (merchantId: string) => `${merchant(merchantId)}/inventory`,
    item: (merchantId: string, variantId: string) => `${merchant(merchantId)}/inventory/${segment(variantId)}`,
    ledger: (merchantId: string, variantId: string) => `${merchant(merchantId)}/inventory/${segment(variantId)}/ledger`,
    movements: (merchantId: string, variantId: string) => `${merchant(merchantId)}/inventory/${segment(variantId)}/movements`,
    holds: (merchantId: string, variantId: string) => `${merchant(merchantId)}/inventory/${segment(variantId)}/holds`,
    hold: (merchantId: string, variantId: string, holdId: string) => `${merchant(merchantId)}/inventory/${segment(variantId)}/holds/${segment(holdId)}`,
    releaseHold: (merchantId: string, variantId: string, holdId: string) => `${merchant(merchantId)}/inventory/${segment(variantId)}/holds/${segment(holdId)}/release`,
    updateHoldExpiry: (merchantId: string, variantId: string, holdId: string) => `${merchant(merchantId)}/inventory/${segment(variantId)}/holds/${segment(holdId)}/expiry`,
  },
  customers: {
    list: (merchantId: string) => `${merchant(merchantId)}/customers`,
    item: (merchantId: string, customerId: string) => `${merchant(merchantId)}/customers/${segment(customerId)}`,
    locations: (merchantId: string, customerId: string) => `${merchant(merchantId)}/customers/${segment(customerId)}/delivery-locations`,
    location: (merchantId: string, customerId: string, locationId: string) => `${merchant(merchantId)}/customers/${segment(customerId)}/delivery-locations/${segment(locationId)}`,
  },
  orders: {
    list: (merchantId: string) => `${merchant(merchantId)}/orders`,
    item: (merchantId: string, orderId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}`,
    items: (merchantId: string, orderId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/items`,
    abandon: (merchantId: string, orderId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/abandon`,
    cancel: (merchantId: string, orderId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/cancel`,
    confirm: (merchantId: string, orderId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/confirm`,
  },
  payments: {
    list: (merchantId: string, orderId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/payments`,
    item: (merchantId: string, orderId: string, paymentId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/payments/${segment(paymentId)}`,
    verificationPending: (merchantId: string, orderId: string, paymentId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/payments/${segment(paymentId)}/verification-pending`,
    verify: (merchantId: string, orderId: string, paymentId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/payments/${segment(paymentId)}/verify`,
    reject: (merchantId: string, orderId: string, paymentId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/payments/${segment(paymentId)}/reject`,
    providerVerify: (merchantId: string, orderId: string, paymentId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/payments/${segment(paymentId)}/provider-verify`,
    verificationAttempts: (merchantId: string, orderId: string, paymentId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/payments/${segment(paymentId)}/verification-attempts`,
    summary: (merchantId: string, orderId: string) => `${merchant(merchantId)}/orders/${segment(orderId)}/payment-summary`,
  },
  deliveries: {
    list: (merchantId: string) => `${merchant(merchantId)}/deliveries`,
    item: (merchantId: string, deliveryId: string) => `${merchant(merchantId)}/deliveries/${segment(deliveryId)}`,
    ready: (merchantId: string, deliveryId: string) => `${merchant(merchantId)}/deliveries/${segment(deliveryId)}/ready`,
    dispatch: (merchantId: string, deliveryId: string) => `${merchant(merchantId)}/deliveries/${segment(deliveryId)}/dispatch`,
    cancel: (merchantId: string, deliveryId: string) => `${merchant(merchantId)}/deliveries/${segment(deliveryId)}/cancel`,
    attempts: (merchantId: string, deliveryId: string) => `${merchant(merchantId)}/deliveries/${segment(deliveryId)}/attempts`,
  },
} as const
