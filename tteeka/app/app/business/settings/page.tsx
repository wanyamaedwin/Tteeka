'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, ShieldAlert } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/app-shell'
import { AccessDenied } from '@/components/workspace-access'
import { BusinessSettingsView } from '@/components/business/business-settings-view'
import { BusinessSettingsForm } from '@/components/business/business-settings-form'
import { UnsavedChangesDialog } from '@/components/business/unsaved-changes-dialog'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { useToast } from '@/components/ui/toast'
import { isMockMode } from '@/lib/config'
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
    settings,
    hasPermission,
    updateMockSettings,
    registerSwitchGuard,
    switchWorkspace,
  } = useMerchantWorkspace()
  const { toast } = useToast()

  const canRead = hasPermission(PERM_SETTINGS_READ)
  const canManage = hasPermission(PERM_SETTINGS_MANAGE)

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
    if (isMockMode()) {
      await new Promise((r) => setTimeout(r, 400))
      updateMockSettings(patch)
      setEditing(false)
      setDirty(false)
      toast('Business settings updated.')
    }
    // Live mode: API integration deferred
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
