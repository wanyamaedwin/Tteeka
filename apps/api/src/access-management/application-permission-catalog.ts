import { MERCHANT_PERMISSIONS } from '../merchants/merchant-permissions';
import { ACCESS_MANAGEMENT_PERMISSIONS } from './access-management-permissions';

export interface ApplicationPermissionCatalogEntry {
  readonly key: string;
  readonly description: string;
}

export const APPLICATION_PERMISSION_CATALOG = [
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
