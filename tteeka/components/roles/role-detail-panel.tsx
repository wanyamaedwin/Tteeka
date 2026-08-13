'use client'

import { useEffect, useRef } from 'react'
import { ShieldCheck, X, Pencil, Power, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PERMISSION_GROUPS, PERMISSION_GROUP_LABELS, getPermissionsByGroup, getPermissionMeta } from '@/lib/permissions'
import type { RolePreview, StaffMemberPreview } from '@/lib/mock-staff'

// ---------------------------------------------------------------------------
// RoleDetailPanel
//
// Slide-in panel showing full Role detail: name, description, status,
// assigned staff count, and permissions grouped by category.
// Permission keys shown in technical monospace style.
// ---------------------------------------------------------------------------

type RoleDetailPanelProps = {
  open: boolean
  role: RolePreview
  staffList: StaffMemberPreview[]
  canManage: boolean
  onClose: () => void
  onEdit: (role: RolePreview) => void
  onManagePermissions: (role: RolePreview) => void
  onDisable: (role: RolePreview) => void
  onReactivate: (role: RolePreview) => void
}

export function RoleDetailPanel({
  open,
  role,
  staffList,
  canManage,
  onClose,
  onEdit,
  onManagePermissions,
  onDisable,
  onReactivate,
}: RoleDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const isActive = role.status === 'ACTIVE'

  // Staff count — derived from live staffList (any membership that holds this role)
  const assignedCount = staffList.filter((m) => m.roleIds.includes(role.id)).length

  // Group permissions for display
  const catalogGroups = PERMISSION_GROUPS.map((g) => ({
    group: g,
    label: PERMISSION_GROUP_LABELS[g],
    keys: role.permissionKeys.filter((k) => {
      const meta = getPermissionMeta(k)
      return meta?.group === g
    }),
  })).filter((g) => g.keys.length > 0)

  // Deprecated keys — not in catalog
  const deprecatedKeys = role.permissionKeys.filter((k) => !getPermissionMeta(k))

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[1px] lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-detail-title"
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-2xl sm:w-[420px]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className={cn(
              'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
              isActive ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground',
            )}>
              <ShieldCheck className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 id="role-detail-title" className="font-semibold leading-tight break-words">{role.name}</h2>
              <span className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                isActive ? 'text-accent-foreground' : 'text-muted-foreground',
              )}>
                <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                {isActive ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close role detail"
            className="ml-2 shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">

          {/* Description */}
          {role.description && (
            <p className="text-sm leading-6 text-muted-foreground">{role.description}</p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
              <p className="text-lg font-bold">{role.permissionKeys.length}</p>
              <p className="text-xs text-muted-foreground">Permission{role.permissionKeys.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
              <p className="text-lg font-bold">{assignedCount}</p>
              <p className="text-xs text-muted-foreground">Assigned staff</p>
            </div>
          </div>

          {/* Permissions */}
          <section aria-labelledby="role-perm-heading">
            <div className="mb-3 flex items-center justify-between">
              <h3 id="role-perm-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Permissions
              </h3>
              {canManage && (
                <button
                  type="button"
                  onClick={() => onManagePermissions(role)}
                  className="text-xs font-semibold text-primary hover:text-primary/80"
                >
                  Manage permissions
                </button>
              )}
            </div>

            {role.permissionKeys.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No permissions assigned</p>
            ) : (
              <div className="space-y-4">
                {catalogGroups.map(({ group, label, keys }) => (
                  <div key={group}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                    <ul className="space-y-1.5">
                      {keys.map((k) => {
                        const meta = getPermissionMeta(k)
                        return (
                          <li key={k} className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
                            <p className="text-sm font-medium">{meta?.label ?? k}</p>
                            {meta?.description && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                            )}
                            <code className="mt-1 block text-xs font-mono text-muted-foreground/60">{k}</code>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}

                {/* Deprecated */}
                {deprecatedKeys.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Deprecated</p>
                    <ul className="space-y-1.5">
                      {deprecatedKeys.map((k) => (
                        <li key={k} className="rounded-lg border border-border bg-secondary/30 px-3 py-2 opacity-60">
                          <p className="text-sm font-medium line-through">Deprecated permission</p>
                          <code className="mt-0.5 block text-xs font-mono text-destructive">{k}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Footer actions */}
        {canManage && (
          <div className="shrink-0 space-y-2 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={() => onEdit(role)}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit role
            </button>
            {isActive ? (
              <button
                type="button"
                onClick={() => onDisable(role)}
                className="flex w-full items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                <Power className="size-4" aria-hidden="true" />
                Disable role
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onReactivate(role)}
                className="flex w-full items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Reactivate role
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
