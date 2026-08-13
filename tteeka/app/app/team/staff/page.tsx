'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldAlert, UserPlus } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/app-shell'
import { AccessDenied } from '@/components/workspace-access'
import { ErrorState, LoadingSkeleton } from '@/components/async-state'
import { useAuth } from '@/components/auth-provider'
import { StaffList } from '@/components/staff/staff-list'
import { StaffSearchBar, type StaffFilters } from '@/components/staff/staff-search-bar'
import { StaffEmptyState } from '@/components/staff/staff-empty-state'
import { StaffDetailPanel } from '@/components/staff/staff-detail-panel'
import { AddStaffDialog } from '@/components/staff/add-staff-dialog'
import { RoleAssignmentDialog } from '@/components/staff/role-assignment-dialog'
import { DisableConfirmDialog } from '@/components/staff/disable-confirm-dialog'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { useToast } from '@/components/ui/toast'
import { isMockMode } from '@/lib/config'
import { normalizePhone, type StaffMemberPreview } from '@/lib/mock-staff'
import type { RolePreview } from '@/lib/mock-staff'
import { ApiError } from '@/lib/api/errors'
import {
  addStaff,
  listRoles,
  listStaff,
  replaceStaffRoles,
  updateStaffStatus,
  type RoleResponse,
  type StaffResponse,
} from '@/lib/api/access-management'

// ---------------------------------------------------------------------------
// Permission constants
// ---------------------------------------------------------------------------
const PERM_STAFF_READ = 'STAFF_READ' as const
const PERM_STAFF_MANAGE = 'STAFF_MANAGE' as const

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function StaffPage() {
  return (
    <AppShell>
      <StaffPageContent />
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Main content — permission-aware
// ---------------------------------------------------------------------------

function StaffPageContent() {
  const {
    workspace,
    staffList: mockStaff,
    staffRoles: mockRoles,
    hasPermission,
    addMockStaff,
    updateMockMembershipStatus,
    updateMockMembershipRoles,
    refreshWorkspace,
  } = useMerchantWorkspace()
  const { clearUser } = useAuth()
  const { toast } = useToast()
  const mockMode = isMockMode()

  const canRead = hasPermission(PERM_STAFF_READ)
  const canManage = hasPermission(PERM_STAFF_MANAGE)
  const canReadRoles = hasPermission('ROLES_READ')
  const canManageRoles = hasPermission('ROLES_MANAGE')
  const [liveStaff, setLiveStaff] = useState<StaffMemberPreview[]>([])
  const [liveRoles, setLiveRoles] = useState<RolePreview[]>([])
  const [liveLoading, setLiveLoading] = useState(!mockMode && canRead)
  const [liveError, setLiveError] = useState<ApiError | null>(null)

  const loadStaff = useCallback(async () => {
    if (mockMode || !canRead) {
      setLiveStaff([])
      setLiveRoles([])
      setLiveLoading(false)
      setLiveError(null)
      return
    }
    setLiveLoading(true)
    setLiveError(null)
    try {
      const [staffResult, roleResult] = await Promise.all([
        listStaff(workspace.id),
        canReadRoles ? listRoles(workspace.id) : Promise.resolve(null),
      ])
      setLiveStaff(staffResult.staff.map(mapStaff))
      setLiveRoles(roleResult
        ? roleResult.roles.map((role) => mapRole(workspace.id, role))
        : rolesFromStaff(workspace.id, staffResult.staff))
    } catch (cause) {
      const error = cause instanceof ApiError
        ? cause
        : new ApiError({ message: 'Unable to load team members.' })
      setLiveError(error)
      if (error.status === 401) clearUser()
    } finally {
      setLiveLoading(false)
    }
  }, [canRead, canReadRoles, clearUser, mockMode, workspace.id])

  useEffect(() => { void loadStaff() }, [loadStaff])

  const staffList = mockMode ? mockStaff : liveStaff
  const staffRoles = mockMode ? mockRoles : liveRoles

  async function addByPhone(phone: string) {
    try {
      return mapStaff(await addStaff(workspace.id, phone))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) clearUser()
      throw cause
    }
  }

  function acceptAdded(member: StaffMemberPreview) {
    if (mockMode) addMockStaff(member)
    else if (canRead) setLiveStaff((current) => [...current, member])
    toast('Staff member added.')
  }

  async function setStatus(membershipId: string, status: 'ACTIVE' | 'DISABLED') {
    if (mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      updateMockMembershipStatus(membershipId, status)
      return
    }
    try {
      const updated = mapStaff(await updateStaffStatus(workspace.id, membershipId, status))
      setLiveStaff((current) => current.map((member) =>
        member.membershipId === membershipId ? updated : member))
      await refreshWorkspace()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) clearUser()
      throw cause
    }
  }

  async function setRoles(membershipId: string, roleIds: string[]) {
    if (mockMode) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      updateMockMembershipRoles(membershipId, roleIds)
      return
    }
    try {
      const updated = mapStaff(await replaceStaffRoles(workspace.id, membershipId, roleIds))
      setLiveStaff((current) => current.map((member) =>
        member.membershipId === membershipId ? updated : member))
      await refreshWorkspace()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) clearUser()
      throw cause
    }
  }

  const isUnavailable =
    workspace.status !== 'ACTIVE' || workspace.membershipStatus !== 'ACTIVE'

  if (isUnavailable) return null // AppShell handles WorkspaceUnavailable

  // ── No access ────────────────────────────────────────────────────────────
  if (!canRead && !canManage) {
    return (
      <>
        <PageHeader
          eyebrow="Team"
          title="Staff"
          description="Manage who can access this business and what roles they are assigned."
        />
        <AccessDenied title="You do not have access to Staff." />
      </>
    )
  }

  // ── Manage-only (no read) ─────────────────────────────────────────────────
  if (!canRead && canManage) {
    return (
      <ManageOnlyStaffCard
        existingPhones={[]}
        onAdd={acceptAdded}
        onAddPhone={mockMode ? undefined : addByPhone}
      />
    )
  }

  if (!mockMode && liveLoading) {
    return <LoadingSkeleton label="Loading team members" />
  }

  if (!mockMode && liveError?.status === 401) {
    return <LoadingSkeleton label="Returning to sign in" />
  }

  if (!mockMode && liveError?.status === 403) {
    return <AccessDenied title="You do not have access to Staff." />
  }

  if (!mockMode && liveError) {
    return (
      <ErrorState
        title="Unable to load team members."
        description={liveError.isNetworkError
          ? "We couldn't reach Tteeka. Check your connection and try again."
          : 'Please try again.'}
        onRetry={() => void loadStaff()}
      />
    )
  }

  // ── Read (± manage) ──────────────────────────────────────────────────────
  return (
    <StaffReadView
      staffList={staffList}
      staffRoles={staffRoles}
      canManage={canManage}
      canManageRoles={canReadRoles && canManageRoles}
      workspaceId={workspace.id}
      onAddStaff={acceptAdded}
      onAddPhone={mockMode ? undefined : addByPhone}
      onDisable={async (membershipId) => {
        await setStatus(membershipId, 'DISABLED')
        toast('Staff access disabled.')
      }}
      onReactivate={async (membershipId) => {
        await setStatus(membershipId, 'ACTIVE')
        toast('Staff access reactivated.')
      }}
      onUpdateRoles={async (membershipId, roleIds) => {
        await setRoles(membershipId, roleIds)
        toast('Staff roles updated.')
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// StaffReadView — the full staff experience for read (± manage) users
// ---------------------------------------------------------------------------

type StaffReadViewProps = {
  staffList: StaffMemberPreview[]
  staffRoles: ReturnType<typeof useMerchantWorkspace>['staffRoles']
  canManage: boolean
  canManageRoles: boolean
  workspaceId: string
  onAddStaff: (member: StaffMemberPreview) => void
  onAddPhone?: (phone: string) => Promise<StaffMemberPreview>
  onDisable: (membershipId: string) => Promise<void>
  onReactivate: (membershipId: string) => Promise<void>
  onUpdateRoles: (membershipId: string, roleIds: string[]) => Promise<void>
}

function StaffReadView({
  staffList,
  staffRoles,
  canManage,
  canManageRoles,
  onAddStaff,
  onAddPhone,
  onDisable,
  onReactivate,
  onUpdateRoles,
}: StaffReadViewProps) {
  const { toast } = useToast()

  // ── Filter state ─────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<StaffFilters>({
    search: '',
    status: 'all',
    roleId: 'all',
  })

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)
  const [detailMember, setDetailMember] = useState<StaffMemberPreview | null>(null)
  const [rolesMember, setRolesMember] = useState<StaffMemberPreview | null>(null)
  const [disableMember, setDisableMember] = useState<StaffMemberPreview | null>(null)
  const [reactivateMember, setReactivateMember] = useState<StaffMemberPreview | null>(null)
  const [actionSubmitting, setActionSubmitting] = useState(false)

  // Keep detail panel fresh when staffList updates (e.g. after role change)
  const freshDetail = detailMember
    ? staffList.find((m) => m.membershipId === detailMember.membershipId) ?? detailMember
    : null

  // ── Derived stats ─────────────────────────────────────────────────────────
  const activeCount = staffList.filter((m) => m.membershipStatus === 'ACTIVE').length
  const disabledCount = staffList.filter((m) => m.membershipStatus === 'DISABLED').length

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = staffList
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase()
      list = list.filter(
        (m) =>
          m.name?.toLowerCase().includes(q) ||
          m.phone.toLowerCase().includes(q) ||
          normalizePhone(m.phone).includes(normalizePhone(q)) ||
          m.email?.toLowerCase().includes(q),
      )
    }
    if (filters.status !== 'all') {
      list = list.filter((m) => m.membershipStatus === filters.status)
    }
    if (filters.roleId === 'none') {
      list = list.filter((m) => m.roleIds.length === 0)
    } else if (filters.roleId !== 'all') {
      list = list.filter((m) => m.roleIds.includes(filters.roleId))
    }
    return list
  }, [staffList, filters])

  const hasFilters =
    filters.search.trim() !== '' ||
    filters.status !== 'all' ||
    filters.roleId !== 'all'

  // ── Existing phones for conflict detection ────────────────────────────────
  const existingPhones = staffList.map((m) => m.phone)

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleDisableConfirm() {
    if (!disableMember) return
    setActionSubmitting(true)
    try {
      await onDisable(disableMember.membershipId)
      setDisableMember(null)
      if (detailMember?.membershipId === disableMember.membershipId) setDetailMember(null)
    } catch {
      toast("We couldn't update this team member.", 'error')
    } finally {
      setActionSubmitting(false)
    }
  }

  async function handleReactivateConfirm() {
    if (!reactivateMember) return
    setActionSubmitting(true)
    try {
      await onReactivate(reactivateMember.membershipId)
      setReactivateMember(null)
      if (detailMember?.membershipId === reactivateMember.membershipId) setDetailMember(null)
    } catch {
      toast("We couldn't update this team member.", 'error')
    } finally {
      setActionSubmitting(false)
    }
  }

  async function handleRolesSave(newRoleIds: string[]) {
    if (!rolesMember) return
    setActionSubmitting(true)
    try {
      await onUpdateRoles(rolesMember.membershipId, newRoleIds)
      setRolesMember(null)
    } catch {
      toast("We couldn't update this team member.", 'error')
    } finally {
      setActionSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Staff"
        description="Manage who can access this business and what roles they are assigned."
        action={
          canManage ? (
            <button
              id="add-staff-btn"
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Add staff
            </button>
          ) : null
        }
      />

      {/* Summary strip */}
      {staffList.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          <StatChip label="Active" value={activeCount} />
          <StatChip label="Disabled" value={disabledCount} />
          <StatChip label="Total" value={staffList.length} />
        </div>
      )}

      {/* Toolbar */}
      {staffList.length > 0 && (
        <div className="mb-5">
          <StaffSearchBar
            filters={filters}
            roles={staffRoles}
            onChange={setFilters}
          />
        </div>
      )}

      {/* List or empty state */}
      {staffList.length === 0 ? (
        <StaffEmptyState
          variant="no-staff"
          canManage={canManage}
          onAddStaff={() => setAddOpen(true)}
        />
      ) : filtered.length === 0 ? (
        <StaffEmptyState
          variant="no-results"
          onClearFilters={() => setFilters({ search: '', status: 'all', roleId: 'all' })}
        />
      ) : (
        <StaffList
          members={filtered}
          allRoles={staffRoles}
          canManage={canManage}
          canManageRoles={canManageRoles}
          onSelect={(m) => setDetailMember(m)}
          onManageRoles={(m) => setRolesMember(m)}
          onDisable={(m) => setDisableMember(m)}
          onReactivate={(m) => setReactivateMember(m)}
        />
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      {/* Add staff */}
      <AddStaffDialog
        open={addOpen}
        existingPhones={existingPhones}
        onAddPhone={onAddPhone}
        onAdd={(member) => { onAddStaff(member); setAddOpen(false) }}
        onClose={() => setAddOpen(false)}
      />

      {/* Staff detail panel */}
      {freshDetail && (
        <StaffDetailPanel
          open={!!freshDetail}
          member={freshDetail}
          allRoles={staffRoles}
          canManage={canManage}
          canManageRoles={canManageRoles}
          onClose={() => setDetailMember(null)}
          onDisable={(m) => { setDetailMember(null); setDisableMember(m) }}
          onReactivate={(m) => { setDetailMember(null); setReactivateMember(m) }}
          onManageRoles={(m) => { setDetailMember(null); setRolesMember(m) }}
        />
      )}

      {/* Role assignment */}
      {canManageRoles && rolesMember && (() => {
        const fresh = staffList.find((m) => m.membershipId === rolesMember.membershipId) ?? rolesMember
        return (
          <RoleAssignmentDialog
            open
            member={fresh}
            allRoles={staffRoles}
            submitting={actionSubmitting}
            onSave={handleRolesSave}
            onCancel={() => setRolesMember(null)}
          />
        )
      })()}

      {/* Disable confirmation */}
      <DisableConfirmDialog
        open={!!disableMember}
        staffName={disableMember?.name ?? disableMember?.phone}
        action="disable"
        submitting={actionSubmitting}
        onConfirm={handleDisableConfirm}
        onCancel={() => setDisableMember(null)}
      />

      {/* Reactivate confirmation */}
      <DisableConfirmDialog
        open={!!reactivateMember}
        staffName={reactivateMember?.name ?? reactivateMember?.phone}
        action="reactivate"
        submitting={actionSubmitting}
        onConfirm={handleReactivateConfirm}
        onCancel={() => setReactivateMember(null)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// StatChip — small summary metric
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
// ManageOnlyStaffCard
//
// Shown when STAFF_MANAGE without STAFF_READ.
// Does NOT expose existing staff directory.
// ---------------------------------------------------------------------------

type ManageOnlyProps = {
  existingPhones: string[]
  onAdd: (member: StaffMemberPreview) => void
  onAddPhone?: (phone: string) => Promise<StaffMemberPreview>
}

function ManageOnlyStaffCard({ existingPhones, onAdd, onAddPhone }: ManageOnlyProps) {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Staff"
        description="Manage who can access this business and what roles they are assigned."
      />
      <div className="max-w-xl rounded-2xl border border-border bg-card p-8">
        <div className="mb-5 flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
            <ShieldAlert className="size-4 text-muted-foreground" />
          </span>
          <div>
            <h2 className="font-semibold">Staff management</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              You can add or update staff access, but your current workspace permissions do not allow
              you to view the staff directory.
            </p>
          </div>
        </div>
        <button
          id="manage-only-add-staff-btn"
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <UserPlus className="size-4" />
          Add staff
        </button>
      </div>

      <AddStaffDialog
        open={addOpen}
        existingPhones={existingPhones}
        onAddPhone={onAddPhone}
        onAdd={(member) => { onAdd(member); setAddOpen(false) }}
        onClose={() => setAddOpen(false)}
      />
    </>
  )
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

function rolesFromStaff(merchantId: string, records: StaffResponse[]): RolePreview[] {
  const roles = new Map<string, RolePreview>()
  for (const record of records) {
    for (const role of record.roles) {
      roles.set(role.id, {
        id: role.id,
        merchantId,
        name: role.name,
        status: role.status,
        permissionKeys: [],
      })
    }
  }
  return [...roles.values()]
}
