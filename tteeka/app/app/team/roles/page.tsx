'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldAlert, ShieldPlus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppShell, PageHeader } from '@/components/app-shell'
import { AccessDenied } from '@/components/workspace-access'
import { ErrorState, LoadingSkeleton } from '@/components/async-state'
import { useAuth } from '@/components/auth-provider'
import { RoleList } from '@/components/roles/role-list'
import { RoleDetailPanel } from '@/components/roles/role-detail-panel'
import { RoleFormDialog } from '@/components/roles/role-form-dialog'
import { RoleStatusConfirmDialog } from '@/components/roles/role-status-confirm-dialog'
import { PermissionPickerDialog } from '@/components/roles/permission-picker-dialog'
import { PermissionCatalogue } from '@/components/roles/permission-catalogue'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { useToast } from '@/components/ui/toast'
import { isMockMode } from '@/lib/config'
import { generateRoleId, type RolePreview } from '@/lib/mock-staff'
import type { StaffMemberPreview } from '@/lib/mock-staff'
import { ApiError } from '@/lib/api/errors'
import {
  createRole,
  listPermissionCatalogue,
  listRoles,
  listStaff,
  replaceRolePermissions,
  updateRole,
  type RoleResponse,
  type StaffResponse,
} from '@/lib/api/access-management'
import { presentPermissionCatalogue, type PermissionMetadata } from '@/lib/permissions'

// ---------------------------------------------------------------------------
// Permission constants
// ---------------------------------------------------------------------------
const PERM_ROLES_READ = 'ROLES_READ' as const
const PERM_ROLES_MANAGE = 'ROLES_MANAGE' as const

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function RolesPage() {
  return (
    <AppShell>
      <RolesPageContent />
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Main content — permission-aware
// ---------------------------------------------------------------------------

function RolesPageContent() {
  const {
    workspace,
    rolesList: mockRoles,
    staffList: mockStaff,
    hasPermission,
    addMockRole,
    updateMockRole,
    updateMockRoleStatus,
    updateMockRolePermissions,
    refreshWorkspace,
  } = useMerchantWorkspace()
  const { clearUser } = useAuth()
  const { toast } = useToast()
  const mockMode = isMockMode()

  const canRead = hasPermission(PERM_ROLES_READ)
  const canManage = hasPermission(PERM_ROLES_MANAGE)
  const canReadStaff = hasPermission('STAFF_READ')
  const [liveRoles, setLiveRoles] = useState<RolePreview[]>([])
  const [liveStaff, setLiveStaff] = useState<StaffMemberPreview[] | undefined>(undefined)
  const [livePermissions, setLivePermissions] = useState<PermissionMetadata[]>([])
  const [liveLoading, setLiveLoading] = useState(!mockMode && canRead)
  const [liveError, setLiveError] = useState<ApiError | null>(null)

  const loadRoles = useCallback(async () => {
    if (mockMode || !canRead) {
      setLiveRoles([])
      setLiveStaff(undefined)
      setLivePermissions([])
      setLiveLoading(false)
      setLiveError(null)
      return
    }
    setLiveLoading(true)
    setLiveError(null)
    try {
      const [rolesResult, catalogResult, staffResult] = await Promise.all([
        listRoles(workspace.id),
        listPermissionCatalogue(workspace.id),
        canReadStaff ? listStaff(workspace.id) : Promise.resolve(null),
      ])
      setLiveRoles(rolesResult.roles.map((role) => mapRole(workspace.id, role)))
      setLivePermissions(presentPermissionCatalogue(catalogResult.permissions))
      setLiveStaff(staffResult?.staff.map(mapStaff))
    } catch (cause) {
      const error = cause instanceof ApiError
        ? cause
        : new ApiError({ message: 'Unable to load roles.' })
      setLiveError(error)
      if (error.status === 401) clearUser()
    } finally {
      setLiveLoading(false)
    }
  }, [canRead, canReadStaff, clearUser, mockMode, workspace.id])

  useEffect(() => { void loadRoles() }, [loadRoles])

  const rolesList = mockMode ? mockRoles : liveRoles
  const staffList = mockMode ? mockStaff : liveStaff

  function storeRole(role: RolePreview) {
    setLiveRoles((current) => {
      const existing = current.some(({ id }) => id === role.id)
      return existing
        ? current.map((item) => item.id === role.id ? role : item)
        : [...current, role]
    })
  }

  async function create(name: string, description: string) {
    if (mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      const role: RolePreview = {
        id: generateRoleId(), merchantId: workspace.id, name,
        description: description || undefined, status: 'ACTIVE',
        permissionKeys: [], createdAt: new Date().toISOString(),
      }
      addMockRole(role)
      toast('Role created.')
      return role
    }
    try {
      const role = mapRole(workspace.id, await createRole(workspace.id, {
        name,
        ...(description ? { description } : {}),
      }))
      storeRole(role)
      toast('Role created.')
      return role
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) clearUser()
      throw cause
    }
  }

  async function patchRole(roleId: string, patch: { name?: string; description?: string | null; status?: 'ACTIVE' | 'DISABLED' }) {
    if (mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      if (patch.status) updateMockRoleStatus(roleId, patch.status)
      else updateMockRole(roleId, {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.description === undefined ? {} : { description: patch.description ?? undefined }),
      })
      return
    }
    try {
      storeRole(mapRole(workspace.id, await updateRole(workspace.id, roleId, patch)))
      await refreshWorkspace()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) clearUser()
      throw cause
    }
  }

  async function syncPermissions(roleId: string, keys: string[]) {
    if (mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      updateMockRolePermissions(roleId, keys)
      return
    }
    try {
      storeRole(mapRole(workspace.id, await replaceRolePermissions(workspace.id, roleId, keys)))
      await refreshWorkspace()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) clearUser()
      throw cause
    }
  }

  const isUnavailable =
    workspace.status !== 'ACTIVE' || workspace.membershipStatus !== 'ACTIVE'

  if (isUnavailable) return null

  // ── No access ─────────────────────────────────────────────────────────────
  if (!canRead && !canManage) {
    return (
      <>
        <PageHeader
          eyebrow="Team"
          title="Roles & Permissions"
          description="Control what staff members can do inside this business."
        />
        <AccessDenied title="You do not have access to Roles & Permissions." />
      </>
    )
  }

  // ── Manage-only (no read) ──────────────────────────────────────────────────
  if (!canRead && canManage) {
    return <ManageOnlyRolesCard rolesList={rolesList} onAdd={async (name, description) => ({
      ok: true,
      role: await create(name, description),
    })} />
  }

  if (!mockMode && liveLoading) return <LoadingSkeleton label="Loading roles" />
  if (!mockMode && liveError?.status === 401) return <LoadingSkeleton label="Returning to sign in" />
  if (!mockMode && liveError?.status === 403) {
    return <AccessDenied title="You do not have access to Roles & Permissions." />
  }
  if (!mockMode && liveError) {
    return (
      <ErrorState
        title="Unable to load roles."
        description={liveError.isNetworkError
          ? "We couldn't reach Tteeka. Check your connection and try again."
          : 'Please try again.'}
        onRetry={() => void loadRoles()}
      />
    )
  }

  // ── Full read (± manage) ───────────────────────────────────────────────────
  return (
    <RolesReadView
      rolesList={rolesList}
      staffList={staffList}
      permissionCatalogue={mockMode ? undefined : livePermissions}
      canManage={canManage}
      workspaceId={workspace.id}
      onCreateRole={create}
      onUpdateRole={async (roleId, name, description) => {
        await patchRole(roleId, { name, description: description || null })
        toast('Role updated.')
      }}
      onDisableRole={async (roleId) => {
        await patchRole(roleId, { status: 'DISABLED' })
        toast('Role disabled.')
      }}
      onReactivateRole={async (roleId) => {
        await patchRole(roleId, { status: 'ACTIVE' })
        toast('Role reactivated.')
      }}
      onUpdatePermissions={async (roleId, keys) => {
        await syncPermissions(roleId, keys)
        toast('Role permissions updated.')
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// RolesReadView — full experience for read (± manage) users
// ---------------------------------------------------------------------------

type TabId = 'roles' | 'catalogue'

type RolesReadViewProps = {
  rolesList: RolePreview[]
  staffList: StaffMemberPreview[] | undefined
  permissionCatalogue?: readonly PermissionMetadata[]
  canManage: boolean
  workspaceId: string
  onCreateRole: (name: string, description: string) => Promise<RolePreview | null>
  onUpdateRole: (roleId: string, name: string, description: string) => Promise<void>
  onDisableRole: (roleId: string) => Promise<void>
  onReactivateRole: (roleId: string) => Promise<void>
  onUpdatePermissions: (roleId: string, keys: string[]) => Promise<void>
}

function RolesReadView({
  rolesList,
  staffList,
  permissionCatalogue,
  canManage,
  onCreateRole,
  onUpdateRole,
  onDisableRole,
  onReactivateRole,
  onUpdatePermissions,
}: RolesReadViewProps) {
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<TabId>('roles')

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'DISABLED'>('all')

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [editRole, setEditRole] = useState<RolePreview | null>(null)
  const [detailRole, setDetailRole] = useState<RolePreview | null>(null)
  const [disableRole, setDisableRole] = useState<RolePreview | null>(null)
  const [reactivateRole, setReactivateRole] = useState<RolePreview | null>(null)
  const [permRole, setPermRole] = useState<RolePreview | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Post-create CTA state
  const [justCreated, setJustCreated] = useState<RolePreview | null>(null)

  // Keep detail panel fresh after mutations
  const freshDetail = detailRole
    ? rolesList.find((r) => r.id === detailRole.id) ?? detailRole
    : null
  const freshPermRole = permRole
    ? rolesList.find((r) => r.id === permRole.id) ?? permRole
    : null

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeCount = rolesList.filter((r) => r.status === 'ACTIVE').length
  const disabledCount = rolesList.filter((r) => r.status === 'DISABLED').length
  const existingNames = rolesList.map((r) => r.name)

  const filtered = useMemo(() => {
    let list = rolesList
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter)
    }
    return list
  }, [rolesList, search, statusFilter])

  const hasFilters = search.trim() !== '' || statusFilter !== 'all'
  const noResults = filtered.length === 0 && rolesList.length > 0

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleCreate(name: string, description: string) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await onCreateRole(name, description)
      setCreateOpen(false)
      if (created) setJustCreated(created)
    } catch {
      setSubmitError("We couldn't save this role.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit(name: string, description: string) {
    if (!editRole) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await onUpdateRole(editRole.id, name, description)
      setEditRole(null)
    } catch {
      setSubmitError("We couldn't save this role.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDisable() {
    if (!disableRole) return
    setSubmitting(true)
    try {
      await onDisableRole(disableRole.id)
      setDisableRole(null)
      if (detailRole?.id === disableRole.id) setDetailRole(null)
    } catch {
      toast("We couldn't save this role.", 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReactivate() {
    if (!reactivateRole) return
    setSubmitting(true)
    try {
      await onReactivateRole(reactivateRole.id)
      setReactivateRole(null)
      if (detailRole?.id === reactivateRole.id) setDetailRole(null)
    } catch {
      toast("We couldn't save this role.", 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePermSave(keys: string[]) {
    if (!freshPermRole) return
    setSubmitting(true)
    try {
      await onUpdatePermissions(freshPermRole.id, keys)
      setPermRole(null)
    } catch {
      toast("We couldn't update these permissions.", 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Roles & Permissions"
        description="Control what staff members can do inside this business."
        action={
          canManage ? (
            <button
              id="create-role-btn"
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ShieldPlus className="size-4" aria-hidden="true" />
              Create role
            </button>
          ) : null
        }
      />

      {/* Just-created CTA */}
      {justCreated && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-accent-foreground/20 bg-accent/10 px-5 py-3.5">
          <div>
            <p className="text-sm font-semibold">
              <span className="text-accent-foreground">{justCreated.name}</span> created successfully.
            </p>
            <p className="text-xs text-muted-foreground">This role has no permissions yet. Add permissions to define what it can do.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => { setPermRole(justCreated); setJustCreated(null) }}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Manage permissions
            </button>
            <button
              type="button"
              onClick={() => setJustCreated(null)}
              aria-label="Dismiss"
              className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex border-b border-border">
        {(['roles', 'catalogue'] as TabId[]).map((tab) => (
          <button
            key={tab}
            id={`tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 pb-3 pt-0.5 text-sm font-semibold transition-colors',
              activeTab === tab
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab === 'roles' ? 'Roles' : 'Permission catalogue'}
          </button>
        ))}
      </div>

      {/* ── Roles tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'roles' && (
        <>
          {/* Summary strip */}
          {rolesList.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-3">
              <StatChip label="Active" value={activeCount} />
              <StatChip label="Disabled" value={disabledCount} />
              <StatChip label="Total" value={rolesList.length} />
            </div>
          )}

          {/* Toolbar */}
          {rolesList.length > 0 && (
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="roles-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search roles…"
                  aria-label="Search roles"
                  className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <select
                id="roles-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                aria-label="Filter by role status"
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 sm:w-44"
              >
                <option value="all">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setStatusFilter('all') }}
                  className="h-10 shrink-0 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-secondary"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* List / empty */}
          {rolesList.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <ShieldPlus className="mb-4 size-10 text-muted-foreground" />
              <p className="font-semibold">No roles have been created for this business.</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Roles define what staff members can do. Create your first role to get started.
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Create role
                </button>
              )}
            </div>
          ) : noResults ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <X className="mb-4 size-8 text-muted-foreground" />
              <p className="font-semibold">No roles match your search or filters.</p>
              <button
                type="button"
                onClick={() => { setSearch(''); setStatusFilter('all') }}
                className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <RoleList
              roles={filtered}
              staffList={staffList}
              canManage={canManage}
              onSelect={setDetailRole}
              onEdit={(r) => { setEditRole(r); setDetailRole(null) }}
              onManagePermissions={(r) => { setPermRole(r); setDetailRole(null) }}
              onDisable={(r) => { setDisableRole(r); setDetailRole(null) }}
              onReactivate={(r) => { setReactivateRole(r); setDetailRole(null) }}
            />
          )}
        </>
      )}

      {/* ── Permission catalogue tab ────────────────────────────────────────── */}
      {activeTab === 'catalogue' && <PermissionCatalogue permissions={permissionCatalogue} />}

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}

      {/* Role detail panel */}
      {freshDetail && (
        <RoleDetailPanel
          open={!!freshDetail}
          role={freshDetail}
          staffList={staffList}
          permissions={permissionCatalogue}
          canManage={canManage}
          onClose={() => setDetailRole(null)}
          onEdit={(r) => { setDetailRole(null); setEditRole(r) }}
          onManagePermissions={(r) => { setDetailRole(null); setPermRole(r) }}
          onDisable={(r) => { setDetailRole(null); setDisableRole(r) }}
          onReactivate={(r) => { setDetailRole(null); setReactivateRole(r) }}
        />
      )}

      {/* Create role */}
      <RoleFormDialog
        open={createOpen}
        mode="create"
        existingNames={existingNames}
        submitError={submitError}
        submitting={submitting}
        onSave={handleCreate}
        onCancel={() => setCreateOpen(false)}
      />

      {/* Edit role */}
      {editRole && (() => {
        const fresh = rolesList.find((r) => r.id === editRole.id) ?? editRole
        return (
          <RoleFormDialog
            open
            mode="edit"
            existingRole={fresh}
            existingNames={existingNames}
            submitError={submitError}
            submitting={submitting}
            onSave={handleEdit}
            onCancel={() => setEditRole(null)}
          />
        )
      })()}

      {/* Disable confirmation */}
      {disableRole && (
        <RoleStatusConfirmDialog
          open
          roleName={disableRole.name}
          action="disable"
          assignedStaffCount={staffList?.filter((m) => m.roleIds.includes(disableRole.id)).length}
          submitting={submitting}
          onConfirm={handleDisable}
          onCancel={() => setDisableRole(null)}
        />
      )}

      {/* Reactivate confirmation */}
      {reactivateRole && (
        <RoleStatusConfirmDialog
          open
          roleName={reactivateRole.name}
          action="reactivate"
          assignedStaffCount={staffList?.filter((m) => m.roleIds.includes(reactivateRole.id)).length}
          submitting={submitting}
          onConfirm={handleReactivate}
          onCancel={() => setReactivateRole(null)}
        />
      )}

      {/* Permission picker */}
      {freshPermRole && (
        <PermissionPickerDialog
          open
          role={freshPermRole}
          submitting={submitting}
          permissions={permissionCatalogue}
          onSave={handlePermSave}
          onCancel={() => setPermRole(null)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// StatChip
// ---------------------------------------------------------------------------

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
      <span className="text-lg font-bold">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ManageOnlyRolesCard
//
// Shown when ROLES_MANAGE without ROLES_READ.
// Does NOT expose existing role list.
// ---------------------------------------------------------------------------

type ManageOnlyRolesCardProps = {
  rolesList: RolePreview[]
  onAdd: (name: string, description: string) => Promise<{ ok: boolean; role?: RolePreview }>
}

function ManageOnlyRolesCard({ rolesList, onAdd }: ManageOnlyRolesCardProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const existingNames = rolesList.map((r) => r.name)

  async function handleCreate(name: string, description: string) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await onAdd(name, description)
      setCreateOpen(false)
    } catch {
      setSubmitError("We couldn't save this role.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Roles & Permissions"
        description="Control what staff members can do inside this business."
      />
      <div className="max-w-xl rounded-2xl border border-border bg-card p-8">
        <div className="mb-5 flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
            <ShieldAlert className="size-4 text-muted-foreground" />
          </span>
          <div>
            <h2 className="font-semibold">Role management</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              You can create roles, but your current workspace permissions do not allow you to view existing roles or their permission grants.
            </p>
          </div>
        </div>
        <button
          id="manage-only-create-role-btn"
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <ShieldPlus className="size-4" />
          Create role
        </button>
      </div>

      <RoleFormDialog
        open={createOpen}
        mode="create"
        existingNames={existingNames}
        submitting={submitting}
        submitError={submitError}
        onSave={handleCreate}
        onCancel={() => setCreateOpen(false)}
      />
    </>
  )
}

function mapRole(merchantId: string, role: RoleResponse): RolePreview {
  return {
    id: role.id,
    merchantId,
    name: role.name,
    description: role.description ?? undefined,
    status: role.status,
    permissionKeys: role.permissions.map(({ key }) => key),
  }
}

function mapStaff(record: StaffResponse): StaffMemberPreview {
  return {
    membershipId: record.id,
    userId: record.user.id,
    name: record.user.displayName,
    phone: record.user.phone,
    email: record.user.email ?? undefined,
    membershipStatus: record.status,
    roleIds: record.roles.map(({ id }) => id),
  }
}
