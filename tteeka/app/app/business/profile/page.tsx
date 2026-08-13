'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, ShieldAlert } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/app-shell'
import { AccessDenied } from '@/components/workspace-access'
import { BusinessProfileView } from '@/components/business/business-profile-view'
import { BusinessProfileForm } from '@/components/business/business-profile-form'
import { UnsavedChangesDialog } from '@/components/business/unsaved-changes-dialog'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { useToast } from '@/components/ui/toast'
import { isMockMode } from '@/lib/config'
import type { BusinessProfile } from '@/lib/workspaces'

// ---------------------------------------------------------------------------
// Permission constants for exact F3.1 checks
// ---------------------------------------------------------------------------
const PERM_PROFILE_READ = 'MERCHANT_PROFILE_READ' as const
const PERM_PROFILE_MANAGE = 'MERCHANT_PROFILE_MANAGE' as const

// ---------------------------------------------------------------------------
// BusinessProfilePage
// ---------------------------------------------------------------------------

export default function BusinessProfilePage() {
  return (
    <AppShell>
      <ProfilePageContent />
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Inner content — workspace-aware
// ---------------------------------------------------------------------------

function ProfilePageContent() {
  const {
    workspace,
    profile,
    hasPermission,
    updateMockProfile,
    registerSwitchGuard,
  } = useMerchantWorkspace()
  const { toast } = useToast()

  const canRead = hasPermission(PERM_PROFILE_READ)
  const canManage = hasPermission(PERM_PROFILE_MANAGE)

  // Workspace unavailable states are handled by AppShell
  const isUnavailable =
    workspace.status !== 'ACTIVE' || workspace.membershipStatus !== 'ACTIVE'

  // ── Edit-mode state ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)

  // ── Unsaved-changes dialog state ─────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  const pendingSwitchId = useRef<string | null>(null)
  // For cancel-while-dirty
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  // ── Register dirty-state guard with workspace provider ───────────────────
  const guardFn = useCallback(
    async (targetId: string): Promise<boolean> => {
      if (!dirty) return true
      pendingSwitchId.current = targetId
      setDialogOpen(true)
      return false // block — resolved asynchronously via dialog actions
    },
    [dirty],
  )

  useEffect(() => {
    if (editing) {
      registerSwitchGuard(guardFn)
    } else {
      registerSwitchGuard(null)
    }
    return () => { registerSwitchGuard(null) }
  }, [editing, guardFn, registerSwitchGuard])

  // ── Reset edit mode on merchant switch ───────────────────────────────────
  const prevWorkspaceId = useRef(workspace.id)
  useEffect(() => {
    if (prevWorkspaceId.current !== workspace.id) {
      prevWorkspaceId.current = workspace.id
      setEditing(false)
      setDirty(false)
    }
  }, [workspace.id])

  // ── Save handler (mock mode) ─────────────────────────────────────────────
  async function handleSave(patch: Partial<BusinessProfile>) {
    if (isMockMode()) {
      // Simulate a brief save delay for realistic UX
      await new Promise((r) => setTimeout(r, 400))
      updateMockProfile(patch)
      setEditing(false)
      setDirty(false)
      toast('Business profile updated.')
    }
    // Live mode: no-op — API integration deferred
  }

  // ── Cancel handler ───────────────────────────────────────────────────────
  function handleCancel() {
    if (dirty) {
      setCancelDialogOpen(true)
    } else {
      setEditing(false)
    }
  }

  // ── Dialog: workspace switch ─────────────────────────────────────────────
  const { switchWorkspace } = useMerchantWorkspace()

  function onSwitchKeep() {
    setDialogOpen(false)
    pendingSwitchId.current = null
  }

  function onSwitchDiscard() {
    const id = pendingSwitchId.current
    setDialogOpen(false)
    pendingSwitchId.current = null
    setEditing(false)
    setDirty(false)
    if (id) switchWorkspace(id)
  }

  // ── Dialog: cancel while dirty ───────────────────────────────────────────
  function onCancelKeep() { setCancelDialogOpen(false) }

  function onCancelDiscard() {
    setCancelDialogOpen(false)
    setEditing(false)
    setDirty(false)
  }

  // ── No access ────────────────────────────────────────────────────────────
  if (isUnavailable) return null // handled by AppShell WorkspaceUnavailable

  if (!canRead && !canManage) {
    return (
      <>
        <PageHeader
          eyebrow="Business"
          title="Business Profile"
          description="Manage the basic information used to identify your business in Tteeka."
        />
        <AccessDenied title="You do not have access to Business Profile." />
      </>
    )
  }

  // ── Manage-only (no read) ─────────────────────────────────────────────────
  if (!canRead && canManage) {
    return (
      <>
        <PageHeader
          eyebrow="Business"
          title="Business Profile"
          description="Manage the basic information used to identify your business in Tteeka."
        />
        <ManageOnlyProfileCard
          onSave={handleSave}
        />
      </>
    )
  }

  // ── Read (± manage) ──────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Business Profile"
        description="Manage the basic information used to identify your business in Tteeka."
        action={
          !editing && canManage ? (
            <button
              id="edit-profile-btn"
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit profile
            </button>
          ) : null
        }
      />

      <div className="max-w-3xl">
        {editing ? (
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <BusinessProfileForm
              saved={profile}
              prefilled
              onSave={handleSave}
              onCancel={handleCancel}
              onDirtyChange={setDirty}
            />
          </div>
        ) : (
          <BusinessProfileView profile={profile} readOnly={!canManage} />
        )}
      </div>

      {/* Workspace-switch dirty dialog */}
      <UnsavedChangesDialog
        open={dialogOpen}
        onKeep={onSwitchKeep}
        onDiscard={onSwitchDiscard}
        description="You have unsaved profile changes. Switching workspace will discard them."
      />

      {/* Cancel-while-dirty dialog */}
      <UnsavedChangesDialog
        open={cancelDialogOpen}
        onKeep={onCancelKeep}
        onDiscard={onCancelDiscard}
        description="Your profile changes haven't been saved."
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// ManageOnlyProfileCard
//
// Shown when user has MERCHANT_PROFILE_MANAGE but NOT MERCHANT_PROFILE_READ.
// Fields start blank; only entered fields are patched. Existing values never shown.
// ---------------------------------------------------------------------------

function ManageOnlyProfileCard({ onSave }: { onSave: (patch: Partial<BusinessProfile>) => Promise<void> }) {
  const [active, setActive] = useState(false)
  const { toast } = useToast()
  const blankProfile: BusinessProfile = { displayName: '', legalName: null, phone: null, email: null }

  async function handleSave(patch: Partial<BusinessProfile>) {
    await onSave(patch)
    setActive(false)
    toast('Business profile updated.')
  }

  if (!active) {
    return (
      <div className="max-w-xl rounded-2xl border border-border bg-card p-8">
        <div className="mb-5 flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
            <ShieldAlert className="size-4 text-muted-foreground" />
          </span>
          <div>
            <h2 className="font-semibold">Business profile management</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              You can update business information, but your current workspace permissions do not allow
              you to view the saved profile.
            </p>
          </div>
        </div>
        <button
          id="manage-only-profile-btn"
          type="button"
          onClick={() => setActive(true)}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Update profile
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="mb-6">
        <h2 className="font-semibold">Update business profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only fields you enter will be changed. Leave any field blank to keep its current value.
        </p>
      </div>
      <BusinessProfileForm
        saved={blankProfile}
        prefilled={false}
        onSave={handleSave}
        onCancel={() => setActive(false)}
      />
    </div>
  )
}
