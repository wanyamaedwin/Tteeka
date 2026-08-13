import { apiRequest } from './client'
import { endpoints } from './endpoints'

export type MembershipStatus = 'ACTIVE' | 'DISABLED'
export type RoleStatus = 'ACTIVE' | 'DISABLED'
export type PermissionStatus = 'ACTIVE' | 'DEPRECATED'

export interface StaffResponse {
  id: string
  status: MembershipStatus
  user: {
    id: string
    displayName: string
    phone: string
    email: string | null
  }
  roles: {
    id: string
    name: string
    status: RoleStatus
  }[]
}

export interface RoleResponse {
  id: string
  name: string
  description: string | null
  status: RoleStatus
  permissions: {
    key: string
    status: PermissionStatus
  }[]
}

export interface PermissionCatalogueEntry {
  key: string
  description: string
}

export function listStaff(merchantId: string) {
  return apiRequest<{ staff: StaffResponse[] }>(endpoints.staff.list(merchantId), {
    requestContext: 'staff.list',
  })
}

export function addStaff(merchantId: string, phone: string) {
  return apiRequest<StaffResponse>(endpoints.staff.list(merchantId), {
    method: 'POST',
    body: { phone },
    requestContext: 'staff.add',
  })
}

export function updateStaffStatus(
  merchantId: string,
  membershipId: string,
  status: MembershipStatus,
) {
  return apiRequest<StaffResponse>(endpoints.staff.item(merchantId, membershipId), {
    method: 'PATCH',
    body: { status },
    requestContext: 'staff.status.patch',
  })
}

export function replaceStaffRoles(
  merchantId: string,
  membershipId: string,
  roleIds: string[],
) {
  return apiRequest<StaffResponse>(endpoints.staff.roles(merchantId, membershipId), {
    method: 'PUT',
    body: { roleIds },
    requestContext: 'staff.roles.put',
  })
}

export function listRoles(merchantId: string) {
  return apiRequest<{ roles: RoleResponse[] }>(endpoints.roles.list(merchantId), {
    requestContext: 'roles.list',
  })
}

export function createRole(
  merchantId: string,
  input: { name: string; description?: string | null },
) {
  return apiRequest<RoleResponse>(endpoints.roles.list(merchantId), {
    method: 'POST',
    body: input,
    requestContext: 'roles.create',
  })
}

export function updateRole(
  merchantId: string,
  roleId: string,
  patch: { name?: string; description?: string | null; status?: RoleStatus },
) {
  return apiRequest<RoleResponse>(endpoints.roles.item(merchantId, roleId), {
    method: 'PATCH',
    body: patch,
    requestContext: 'roles.patch',
  })
}

export function replaceRolePermissions(
  merchantId: string,
  roleId: string,
  permissionKeys: string[],
) {
  return apiRequest<RoleResponse>(endpoints.roles.permissions(merchantId, roleId), {
    method: 'PUT',
    body: { permissionKeys },
    requestContext: 'roles.permissions.put',
  })
}

export function listPermissionCatalogue(merchantId: string) {
  return apiRequest<{ permissions: PermissionCatalogueEntry[] }>(
    endpoints.roles.allPermissions(merchantId),
    { requestContext: 'roles.permissions.list' },
  )
}
