import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import {
  addStaff,
  createRole,
  listPermissionCatalogue,
  listRoles,
  listStaff,
  replaceRolePermissions,
  replaceStaffRoles,
  updateRole,
  updateStaffStatus,
} from '../lib/api/access-management'
import { ApiError } from '../lib/api/errors'
import { projectMerchantContext } from '../lib/api/merchant-context'
import { presentPermissionCatalogue } from '../lib/permissions'

const originalFetch = globalThis.fetch
const staffPageSource = readFileSync(
  new URL('../app/app/team/staff/page.tsx', import.meta.url),
  'utf8',
)
const rolesPageSource = readFileSync(
  new URL('../app/app/team/roles/page.tsx', import.meta.url),
  'utf8',
)
const providerSource = readFileSync(
  new URL('../components/merchant-workspace-provider.tsx', import.meta.url),
  'utf8',
)
const addStaffSource = readFileSync(
  new URL('../components/staff/add-staff-dialog.tsx', import.meta.url),
  'utf8',
)
const permissionPickerSource = readFileSync(
  new URL('../components/roles/permission-picker-dialog.tsx', import.meta.url),
  'utf8',
)

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
  delete process.env.NEXT_PUBLIC_TTEEKA_APP_MODE
  delete process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL
})

describe('INT0.2B Staff and Roles live integration', () => {
  it('uses all four exact Staff routes and desired-state bodies', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return jsonResponse({ staff: [] })
    }

    await listStaff('merchant-from-context')
    await addStaff('merchant-from-context', '0772123456')
    await updateStaffStatus('merchant-from-context', 'membership-from-list', 'DISABLED')
    await replaceStaffRoles('merchant-from-context', 'membership-from-list', [
      'role-from-list',
    ])

    assert.deepEqual(calls.map(({ url }) => url), [
      'http://localhost:3000/api/v1/merchants/merchant-from-context/staff',
      'http://localhost:3000/api/v1/merchants/merchant-from-context/staff',
      'http://localhost:3000/api/v1/merchants/merchant-from-context/staff/membership-from-list',
      'http://localhost:3000/api/v1/merchants/merchant-from-context/staff/membership-from-list/roles',
    ])
    assert.deepEqual(calls.map(({ init }) => init?.method), ['GET', 'POST', 'PATCH', 'PUT'])
    assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), { phone: '0772123456' })
    assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { status: 'DISABLED' })
    assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { roleIds: ['role-from-list'] })
    assert.ok(calls.every(({ init }) => init?.credentials === 'include'))
    assert.ok(calls.every(({ init }) => init?.cache === 'no-store'))
  })

  it('uses all five exact Role/catalogue routes and complete permission replacement', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    const calls: { url: string; init?: RequestInit }[] = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init })
      return jsonResponse({ roles: [] })
    }

    await listRoles('merchant-from-context')
    await createRole('merchant-from-context', { name: 'Operator', description: 'Orders' })
    await updateRole('merchant-from-context', 'role-from-list', { status: 'DISABLED' })
    await replaceRolePermissions('merchant-from-context', 'role-from-list', [
      'orders.read',
      'merchant.profile.manage',
    ])
    await listPermissionCatalogue('merchant-from-context')

    assert.deepEqual(calls.map(({ url }) => url), [
      'http://localhost:3000/api/v1/merchants/merchant-from-context/roles',
      'http://localhost:3000/api/v1/merchants/merchant-from-context/roles',
      'http://localhost:3000/api/v1/merchants/merchant-from-context/roles/role-from-list',
      'http://localhost:3000/api/v1/merchants/merchant-from-context/roles/role-from-list/permissions',
      'http://localhost:3000/api/v1/merchants/merchant-from-context/permissions',
    ])
    assert.deepEqual(calls.map(({ init }) => init?.method), ['GET', 'POST', 'PATCH', 'PUT', 'GET'])
    assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), {
      permissionKeys: ['orders.read', 'merchant.profile.manage'],
    })
  })

  it('keeps all four read/manage permissions exact and independent', () => {
    const workspace = projectMerchantContext({
      merchant: { id: 'merchant-from-context', displayName: 'Shop' },
      membership: { id: 'membership-from-context' },
      roles: [{ id: 'role-from-context', name: 'Operator' }],
      permissions: ['merchant.staff.manage', 'merchant.roles.manage'],
    })
    assert.equal(workspace.permissions.includes('STAFF_MANAGE'), true)
    assert.equal(workspace.permissions.includes('STAFF_READ'), false)
    assert.equal(workspace.permissions.includes('ROLES_MANAGE'), true)
    assert.equal(workspace.permissions.includes('ROLES_READ'), false)
    assert.match(staffPageSource, /if \(!canRead && canManage\)/)
    assert.match(rolesPageSource, /if \(!canRead && canManage\)/)
  })

  it('always uses workspace context IDs and contains no hard-coded UUID', () => {
    for (const source of [staffPageSource, rolesPageSource]) {
      assert.match(source, /workspace\.id/)
      assert.doesNotMatch(
        source,
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
      )
    }
  })

  it('preserves 401, 403, and outage failures without mock fallback', async () => {
    process.env.NEXT_PUBLIC_TTEEKA_APP_MODE = 'live'
    process.env.NEXT_PUBLIC_TTEEKA_API_BASE_URL = 'http://localhost:3000/api/v1'
    for (const status of [401, 403] as const) {
      globalThis.fetch = async () => jsonResponse({ message: 'bounded' }, status)
      for (const request of [
        () => listStaff('merchant-from-context'),
        () => listRoles('merchant-from-context'),
      ]) {
        await assert.rejects(
          request,
          (error: unknown) => error instanceof ApiError && error.status === status,
        )
      }
    }
    globalThis.fetch = async () => { throw new TypeError('connection refused') }
    await assert.rejects(
      () => listStaff('merchant-from-context'),
      (error: unknown) => error instanceof ApiError && error.isNetworkError,
    )
    await assert.rejects(
      () => replaceRolePermissions('merchant-from-context', 'role-from-list', []),
      (error: unknown) => error instanceof ApiError && error.isNetworkError,
    )
  })

  it('preserves explicit mock mode and never loads live records through the provider', () => {
    assert.match(staffPageSource, /mockMode \? mockStaff : liveStaff/)
    assert.match(rolesPageSource, /mockMode \? mockRoles : liveRoles/)
    assert.match(staffPageSource, /addMockStaff/)
    assert.match(rolesPageSource, /updateMockRolePermissions/)
    assert.doesNotMatch(providerSource, /listStaff\(|listRoles\(/)
  })

  it('does not mount access-management calls for NO_WORKSPACE', () => {
    const noWorkspaceBranch = providerSource.indexOf("status.state === 'NO_WORKSPACE'")
    const contextRequest = providerSource.indexOf('getMerchantContext(resolvedWorkspaceId)')
    assert.notEqual(noWorkspaceBranch, -1)
    assert.ok(noWorkspaceBranch < contextRequest)
    assert.match(providerSource.slice(noWorkspaceBranch, contextRequest), /return/)
  })

  it('uses the backend catalogue and preserves unknown future keys in desired state', () => {
    const presented = presentPermissionCatalogue([
      { key: 'merchant.staff.read', description: 'Read staff' },
      { key: 'future.safe.read', description: 'Future safe capability' },
    ])
    assert.deepEqual(presented.map(({ key }) => key), [
      'merchant.staff.read',
      'future.safe.read',
    ])
    assert.equal(presented[1]?.group, 'OTHER')
    assert.match(permissionPickerSource, /permissions\.map/)
    assert.match(permissionPickerSource, /onSave\(Array\.from\(selected\)\)/)
  })

  it('keeps staff creation truthful about credentials and invitations', () => {
    assert.match(addStaffSource, /must already have a Tteeka account/)
    assert.match(addStaffSource, /does not create login credentials or send an invitation/)
    assert.doesNotMatch(addStaffSource, /Invitation sent|can now sign in/i)
  })

  it('refreshes Merchant context after authorization mutations without polling', () => {
    assert.match(staffPageSource, /await refreshWorkspace\(\)/)
    assert.match(rolesPageSource, /await refreshWorkspace\(\)/)
    assert.doesNotMatch(staffPageSource + rolesPageSource, /setInterval/)
  })
})
