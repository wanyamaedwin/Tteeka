export type NavItem = { label: string; href: string; icon: string; section?: string }
export type Product = { id: string; name: string; category: string; status: 'Active' | 'Draft' }
export type ProductVariant = { id: string; productId: string; productName: string; variant: string; sku: string; barcode: string; price: string; lifecycle: 'Active' | 'Draft' }
export type StaffMember = { name: string; role: string; email: string; initials: string; status: 'Active' | 'Invited' }
export type InventoryItem = ProductVariant & { available: number }
export type PageAction = { label: string; href?: string; onClick?: () => void }

export type SetupItem = { label: string; status: 'Ready' | 'Set up'; href: string }

export type Metric = { label: string; value: string; detail: string; tone?: 'positive' | 'warning' | 'neutral' }
