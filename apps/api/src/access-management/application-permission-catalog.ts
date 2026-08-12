import { MERCHANT_PERMISSIONS } from '../merchants/merchant-permissions';
import { CATALOGUE_PERMISSIONS } from '../catalogue/catalogue-permissions';
import { INVENTORY_PERMISSIONS } from '../inventory/inventory-permissions';
import { CUSTOMER_PERMISSIONS } from '../customers/customer-permissions';
import { DELIVERY_PERMISSIONS } from '../deliveries/delivery-permissions';
import { ORDER_PERMISSIONS } from '../orders/order-permissions';
import { PAYMENT_PERMISSIONS } from '../payments/payment-permissions';
import { ACCESS_MANAGEMENT_PERMISSIONS } from './access-management-permissions';

export interface ApplicationPermissionCatalogEntry {
  readonly key: string;
  readonly description: string;
}

export const APPLICATION_PERMISSION_CATALOG = [
  {
    key: CATALOGUE_PERMISSIONS.MANAGE,
    description: 'Manage merchant product catalogue',
  },
  {
    key: CATALOGUE_PERMISSIONS.PRICE_MANAGE,
    description: 'Manage merchant catalogue pricing and cost history',
  },
  {
    key: CATALOGUE_PERMISSIONS.READ,
    description: 'Read merchant product catalogue',
  },
  {
    key: CUSTOMER_PERMISSIONS.MANAGE,
    description: 'Manage merchant customers and delivery locations',
  },
  {
    key: CUSTOMER_PERMISSIONS.READ,
    description: 'Read merchant customers and delivery locations',
  },
  {
    key: DELIVERY_PERMISSIONS.MANAGE,
    description: 'Manage merchant delivery jobs and attempts',
  },
  {
    key: DELIVERY_PERMISSIONS.READ,
    description: 'Read merchant delivery jobs and attempts',
  },
  {
    key: INVENTORY_PERMISSIONS.MANAGE,
    description: 'Receive and manually adjust merchant inventory',
  },
  {
    key: INVENTORY_PERMISSIONS.READ,
    description: 'Read merchant inventory and movement history',
  },
  {
    key: MERCHANT_PERMISSIONS.PROFILE_MANAGE,
    description: 'Manage merchant profile information',
  },
  {
    key: MERCHANT_PERMISSIONS.PROFILE_READ,
    description: 'Read merchant profile information',
  },
  {
    key: ACCESS_MANAGEMENT_PERMISSIONS.ROLES_MANAGE,
    description: 'Manage merchant roles and role assignments',
  },
  {
    key: ACCESS_MANAGEMENT_PERMISSIONS.ROLES_READ,
    description: 'Read merchant roles and assignable permissions',
  },
  {
    key: MERCHANT_PERMISSIONS.SETTINGS_MANAGE,
    description: 'Manage merchant core operational settings',
  },
  {
    key: MERCHANT_PERMISSIONS.SETTINGS_READ,
    description: 'Read merchant core operational settings',
  },
  {
    key: ACCESS_MANAGEMENT_PERMISSIONS.STAFF_MANAGE,
    description: 'Manage merchant staff memberships',
  },
  {
    key: ACCESS_MANAGEMENT_PERMISSIONS.STAFF_READ,
    description: 'Read merchant staff memberships',
  },
  {
    key: ORDER_PERMISSIONS.MANAGE,
    description: 'Manage merchant draft orders',
  },
  {
    key: ORDER_PERMISSIONS.READ,
    description: 'Read merchant orders and commercial snapshots',
  },
  {
    key: PAYMENT_PERMISSIONS.MANAGE,
    description: 'Report and manually verify merchant payments',
  },
  {
    key: PAYMENT_PERMISSIONS.READ,
    description: 'Read merchant payment transactions and summaries',
  },
] as const satisfies readonly ApplicationPermissionCatalogEntry[];

export const APPLICATION_PERMISSION_KEYS = APPLICATION_PERMISSION_CATALOG.map(
  ({ key }) => key,
);

const applicationPermissionKeySet = new Set<string>(
  APPLICATION_PERMISSION_KEYS,
);

export function isApplicationPermissionKey(value: string): boolean {
  return applicationPermissionKeySet.has(value);
}
