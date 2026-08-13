import type { InventoryItem, Product, ProductVariant, StaffMember } from './types'

export const products: Product[] = [
  { id: '1', name: 'Daily Brew Blend', category: 'Coffee', status: 'Active' },
  { id: '2', name: 'Ceramic Tumbler', category: 'Accessories', status: 'Active' },
  { id: '3', name: 'Breakfast Granola', category: 'Food', status: 'Draft' },
  { id: '4', name: 'House Chai', category: 'Tea', status: 'Active' },
  { id: '5', name: 'Canvas Tote', category: 'Accessories', status: 'Active' },
]

export const productVariants: ProductVariant[] = [
  { id: 'v1', productId: '1', productName: 'Daily Brew Blend', variant: '250g pouch', sku: 'COF-001-250', barcode: '890100001', price: '₹480', lifecycle: 'Active' },
  { id: 'v2', productId: '1', productName: 'Daily Brew Blend', variant: '1kg pouch', sku: 'COF-001-1K', barcode: '890100002', price: '₹1,450', lifecycle: 'Active' },
  { id: 'v3', productId: '2', productName: 'Ceramic Tumbler', variant: 'Sand', sku: 'ACC-014-SND', barcode: '890100014', price: '₹850', lifecycle: 'Active' },
  { id: 'v4', productId: '4', productName: 'House Chai', variant: '100g tin', sku: 'TEA-004-100', barcode: '890100004', price: '₹280', lifecycle: 'Active' },
  { id: 'v5', productId: '5', productName: 'Canvas Tote', variant: 'Natural', sku: 'ACC-020-NAT', barcode: '890100020', price: '₹650', lifecycle: 'Active' },
]

export const staff: StaffMember[] = [
  { name: 'Aarav Mehta', role: 'Owner', email: 'aarav@northstar.cafe', initials: 'AM', status: 'Active' },
  { name: 'Maya Shah', role: 'Manager', email: 'maya@northstar.cafe', initials: 'MS', status: 'Active' },
  { name: 'Kabir Rao', role: 'Staff', email: 'kabir@northstar.cafe', initials: 'KR', status: 'Active' },
  { name: 'Ira Kapoor', role: 'Staff', email: 'ira@northstar.cafe', initials: 'IK', status: 'Invited' },
]

export const inventory: InventoryItem[] = productVariants.map((variant, index) => ({ ...variant, available: [42, 18, 8, 27, 13][index] }))
export const categories = ['All products', 'Coffee', 'Tea', 'Food', 'Accessories']

export const mockSessionUser = { id: 'preview-user', displayName: 'Aarav Mehta' }
export const mockMerchant = { id: 'preview-merchant', name: 'Northstar Cafe', role: 'Owner' }
export const mockPermissions = ['merchant:read', 'merchant:update', 'catalogue:read', 'inventory:read', 'team:read']
export const mockPreviewMeta = { mode: 'mock' as const, label: 'Design preview', apiCallsEnabled: false }
