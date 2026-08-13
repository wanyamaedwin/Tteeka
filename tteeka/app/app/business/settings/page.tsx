'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, ShieldAlert } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/app-shell'
import { ErrorState, LoadingSkeleton } from '@/components/async-state'
import { useAuth } from '@/components/auth-provider'
import { AccessDenied } from '@/components/workspace-access'
import { BusinessSettingsView } from '@/components/business/business-settings-view'
import { BusinessSettingsForm } from '@/components/business/business-settings-form'
import { UnsavedChangesDialog } from '@/components/business/unsaved-changes-dialog'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { useToast } from '@/components/ui/toast'
import { isMockMode } from '@/lib/config'
import { ApiError } from '@/lib/api/errors'
import {
  getMerchantSettings,
  updateMerchantSettings,
} from '@/lib/api/merchant-profile-settings'
import type { BusinessSettings } from '@/lib/workspaces'

// ---------------------------------------------------------------------------
// Permission constants — exact F3.1 spec
// ---------------------------------------------------------------------------
const PERM_SETTINGS_READ = 'MERCHANT_SETTINGS_READ' as const
const PERM_SETTINGS_MANAGE = 'MERCHANT_SETTINGS_MANAGE' as const

// ---------------------------------------------------------------------------
// BusinessSettingsPage
// ---------------------------------------------------------------------------

export default function BusinessSettingsPage() {
  return (
    <AppShell>
      <SettingsPageContent />
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Inner content — workspace-aware
// ---------------------------------------------------------------------------

function SettingsPageContent() {
  const {
    workspace,
    settings: mockSettings,
    hasPermission,
    updateMockSettings,
    registerSwitchGuard,
    switchWorkspace,
  } = useMerchantWorkspace()
  const { clearUser } = useAuth()
  const { toast } = useToast()
  const mockMode = isMockMode()

  const canRead = hasPermission(PERM_SETTINGS_READ)
  const canManage = hasPermission(PERM_SETTINGS_MANAGE)

  const [liveSettings, setLiveSettings] = useState<BusinessSettings | null>(null)
  const [liveLoading, setLiveLoading] = useState(!mockMode && canRead)
  const [liveError, setLiveError] = useState<ApiError | null>(null)
  const settings = mockMode ? mockSettings : liveSettings

  const loadSettings = useCallback(async () => {
    if (mockMode || !canRead) {
      setLiveSettings(null)
      setLiveError(null)
      setLiveLoading(false)
      return
    }
    setLiveLoading(true)
    setLiveError(null)
    try {
      setLiveSettings(await getMerchantSettings(workspace.id))
    } catch (cause) {
      const error = cause instanceof ApiError
        ? cause
        : new ApiError({ message: 'Unable to load settings.' })
      setLiveSettings(null)
      setLiveError(error)
      if (error.status === 401) clearUser()
    } finally {
      setLiveLoading(false)
    }
  }, [canRead, clearUser, mockMode, workspace.id])

  useEffect(() => { void loadSettings() }, [loadSettings])

  const isUnavailable =
    workspace.status !== 'ACTIVE' || workspace.membershipStatus !== 'ACTIVE'

  // ── Edit-mode state ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)

  // ── Unsaved-changes dialogs ──────────────────────────────────────────────
  const [switchDialogOpen, setSwitchDialogOpen] = useState(false)
  const pendingSwitchId = useRef<string | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  // ── Guard registration ───────────────────────────────────────────────────
  const guardFn = useCallback(
    async (targetId: string): Promise<boolean> => {
      if (!dirty) return true
      pendingSwitchId.current = targetId
      setSwitchDialogOpen(true)
      return false
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

  // ── Reset on merchant switch ─────────────────────────────────────────────
  const prevWorkspaceId = useRef(workspace.id)
  useEffect(() => {
    if (prevWorkspaceId.current !== workspace.id) {
      prevWorkspaceId.current = workspace.id
      setEditing(false)
      setDirty(false)
    }
  }, [workspace.id])

  // ── Save (mock) ──────────────────────────────────────────────────────────
  async function handleSave(patch: Partial<BusinessSettings>) {
    if (mockMode) {
      await new Promise((r) => setTimeout(r, 400))
      updateMockSettings(patch)
      setEditing(false)
      setDirty(false)
      toast('Business settings updated.')
      return
    }
    try {
      const saved = await updateMerchantSettings(workspace.id, patch)
      if (canRead) setLiveSettings(saved)
      setEditing(false)
      setDirty(false)
      toast('Business settings updated.')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) clearUser()
      throw cause
    }
  }

  // ── Cancel ───────────────────────────────────────────────────────────────
  function handleCancel() {
    if (dirty) {
      setCancelDialogOpen(true)
    } else {
      setEditing(false)
    }
  }

  // ── Switch dialog actions ─────────────────────────────────────────────────
  function onSwitchKeep() { setSwitchDialogOpen(false); pendingSwitchId.current = null }
  function onSwitchDiscard() {
    const id = pendingSwitchId.current
    setSwitchDialogOpen(false)
    pendingSwitchId.current = null
    setEditing(false)
    setDirty(false)
    if (id) switchWorkspace(id)
  }

  // ── Cancel dialog actions ─────────────────────────────────────────────────
  function onCancelKeep() { setCancelDialogOpen(false) }
  function onCancelDiscard() { setCancelDialogOpen(false); setEditing(false); setDirty(false) }

  // ── No access ─────────────────────────────────────────────────────────────
  if (isUnavailable) return null

  if (!canRead && !canManage) {
    return (
      <>
        <PageHeader
          eyebrow="Business"
          title="Business Settings"
          description="Manage the core settings Tteeka uses for this business."
        />
        <AccessDenied title="You do not have access to Business Settings." />
      </>
    )
  }

  // ── Manage-only (no read) ─────────────────────────────────────────────────
  if (!canRead && canManage) {
    return (
      <>
        <PageHeader
          eyebrow="Business"
          title="Business Settings"
          description="Manage the core settings Tteeka uses for this business."
        />
        <ManageOnlySettingsCard onSave={handleSave} />
      </>
    )
  }

  if (!mockMode && liveLoading) {
    return (
      <>
        <PageHeader
          eyebrow="Business"
          title="Business Settings"
          description="Manage the core settings Tteeka uses for this business."
        />
        <div className="max-w-3xl">
          <LoadingSkeleton label="Loading business settings" />
        </div>
      </>
    )
  }

  if (!mockMode && liveError?.status === 401) {
    return <LoadingSkeleton label="Returning to sign in" />
  }

  if (!mockMode && liveError?.status === 403) {
    return (
      <>
        <PageHeader
          eyebrow="Business"
          title="Business Settings"
          description="Manage the core settings Tteeka uses for this business."
        />
        <AccessDenied title="You do not have access to Business Settings." />
      </>
    )
  }

  if (!settings) {
    return (
      <>
        <PageHeader
          eyebrow="Business"
          title="Business Settings"
          description="Manage the core settings Tteeka uses for this business."
        />
        <div className="max-w-3xl">
          <ErrorState
            title="Unable to load settings."
            description={liveError?.isNetworkError
              ? "We couldn't reach Tteeka. Check your connection and try again."
              : 'Please try again.'}
            onRetry={() => void loadSettings()}
          />
        </div>
      </>
    )
  }

  // ── Read (± manage) ──────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Business Settings"
        description="Manage the core settings Tteeka uses for this business."
        action={
          !editing && canManage ? (
            <button
              id="edit-settings-btn"
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit settings
            </button>
          ) : null
        }
      />

      <div className="max-w-3xl">
        {editing ? (
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <BusinessSettingsForm
              saved={settings}
              prefilled
              onSave={handleSave}
              onCancel={handleCancel}
              onDirtyChange={setDirty}
            />
          </div>
        ) : (
          <BusinessSettingsView settings={settings} readOnly={!canManage} />
        )}
      </div>

      {/* Workspace-switch dirty dialog */}
      <UnsavedChangesDialog
        open={switchDialogOpen}
        onKeep={onSwitchKeep}
        onDiscard={onSwitchDiscard}
        description="You have unsaved settings changes. Switching workspace will discard them."
      />

      {/* Cancel-while-dirty dialog */}
      <UnsavedChangesDialog
        open={cancelDialogOpen}
        onKeep={onCancelKeep}
        onDiscard={onCancelDiscard}
        description="Your settings changes haven't been saved."
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// ManageOnlySettingsCard
// ---------------------------------------------------------------------------

function ManageOnlySettingsCard({ onSave }: { onSave: (patch: Partial<BusinessSettings>) => Promise<void> }) {
  const [active, setActive] = useState(false)
  const { toast } = useToast()
  const blankSettings: BusinessSettings = { currency: '', timezone: '' }

  async function handleSave(patch: Partial<BusinessSettings>) {
    await onSave(patch)
    setActive(false)
    toast('Business settings updated.')
  }

  if (!active) {
    return (
      <div className="max-w-xl rounded-2xl border border-border bg-card p-8">
        <div className="mb-5 flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
            <ShieldAlert className="size-4 text-muted-foreground" />
          </span>
          <div>
            <h2 className="font-semibold">Business settings management</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Your current role can update business settings but cannot view the saved values.
            </p>
          </div>
        </div>
        <button
          id="manage-only-settings-btn"
          type="button"
          onClick={() => setActive(true)}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Update settings
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="mb-6">
        <h2 className="font-semibold">Update business settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only settings you select will be changed. Leave any field unselected to keep its current value.
        </p>
      </div>
      <BusinessSettingsForm
        saved={blankSettings}
        prefilled={false}
        onSave={handleSave}
        onCancel={() => setActive(false)}
      />
    </div>
  )
}
