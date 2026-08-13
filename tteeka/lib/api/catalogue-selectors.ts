import { apiRequest } from './client'
import { endpoints } from './endpoints'

export type CatalogueSelectorProduct = {
  id: string
  name: string
  description: string | null
  category: string | null
  brand: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  createdAt: string
  updatedAt: string
}

export type CatalogueSelectorVariant = {
  id: string
  productId: string
  sku: string
  barcode: string | null
  size: string | null
  colour: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  price: {
    sellingPrice: string
    currency: string
    updatedAt: string
  } | null
  createdAt: string
  updatedAt: string
}

export const catalogueSelectorApi = {
  lookupVariant: (
    merchantId: string,
    query: { sku: string } | { barcode: string },
  ) =>
    apiRequest<CatalogueSelectorVariant>(
      endpoints.catalogue.lookupVariant(merchantId),
      { query, requestContext: 'catalogue.variants.lookup' },
    ),

  product: (merchantId: string, productId: string) =>
    apiRequest<CatalogueSelectorProduct>(
      endpoints.catalogue.product(merchantId, productId),
      { requestContext: 'catalogue.products.detail' },
    ),
}
