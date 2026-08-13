'use client'

import { useEffect, useRef } from 'react'
import { X, Phone, Mail, UserCheck, UserX, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MockRoleRecord, StaffMemberPreview } from '@/lib/mock-staff'

// ---------------------------------------------------------------------------
// StaffDetailPanel
//
// Shows full Membership details for a selected staff member.
// Read-only display — mutations (disable/roles) are triggered via action buttons
// whose callbacks are lifted to the parent page.
// ---------------------------------------------------------------------------

type StaffDetailPanelProps = {
  open: boolean
  member: StaffMemberPreview
  allRoles: MockRoleRecord[]
  canManage: boolean
  /** Current logged-in user's membership userId, for self-disable detection */
  currentUserId?: string
  onClose: () => void
  onDisable: (member: StaffMemberPreview) => void
  onReactivate: (member: StaffMemberPreview) => void
  onManageRoles: (member: StaffMemberPreview) => void
}

export function StaffDetailPanel({
  open,
  member,
  allRoles,
  canManage,
  currentUserId,
  onClose,
  onDisable,
  onReactivate,
  onManageRoles,
}: StaffDetailPanelProps) {
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

  const isActive = member.membershipStatus === 'ACTIVE'
  const isSelf = currentUserId !== undefined && currentUserId === member.userId

  // Resolve role names (including DISABLED historical roles)
  const assignedRoles = member.roleIds
    .map((id) => allRoles.find((r) => r.id === id))
    .filter((r): r is MockRoleRecord => !!r)
  const activeAssigned = assignedRoles.filter((r) => r.status === 'ACTIVE')
  const disabledAssigned = assignedRoles.filter((r) => r.status === 'DISABLED')

  const displayName = member.name ?? member.phone

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[1px] lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — slides in from right on mobile, fixed panel on desktop */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-detail-title"
        className={cn(
          'fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-2xl transition-transform',
          'sm:w-[400px]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-accent font-semibold text-accent-foreground">
              {(member.name ?? member.phone).slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h2 id="staff-detail-title" className="font-semibold leading-tight">
                {displayName}
              </h2>
              <span className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                isActive ? 'text-accent-foreground' : 'text-muted-foreground',
              )}>
                <span className={cn('size-1.5 rounded-full bg-current')} />
                {isActive ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close staff detail"
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Contact info */}
          <section aria-labelledby="contact-heading">
            <h3 id="contact-heading" className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contact
            </h3>
            <dl className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <dt className="sr-only">Phone</dt>
                <dd>{member.phone}</dd>
              </div>
              {member.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <dt className="sr-only">Email</dt>
                  <dd className="truncate">{member.email}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Membership status */}
          <section aria-labelledby="status-heading">
            <h3 id="status-heading" className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Workspace access
            </h3>
            <div className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3.5',
              isActive ? 'border-accent-foreground/20 bg-accent/10' : 'border-border bg-secondary/40',
            )}>
              {isActive
                ? <UserCheck className="size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
                : <UserX className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <div>
                <p className="text-sm font-medium">{isActive ? 'Active' : 'Disabled'}</p>
                <p className="text-xs text-muted-foreground">
                  {isActive
                    ? 'This person can access this workspace.'
                    : 'This person cannot currently access this workspace.'}
                </p>
              </div>
            </div>
          </section>

          {/* Roles */}
          <section aria-labelledby="roles-heading">
            <div className="mb-3 flex items-center justify-between">
              <h3 id="roles-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assigned roles
              </h3>
              {canManage && (
                <button
                  type="button"
                  onClick={() => onManageRoles(member)}
                  className="text-xs font-semibold text-primary hover:text-primary/80"
                >
                  Manage roles
                </button>
              )}
            </div>

            {assignedRoles.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No role assigned</p>
            ) : (
              <div className="space-y-2">
                {activeAssigned.map((role) => (
                  <div key={role.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">{role.name}</p>
                      {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
                    </div>
                  </div>
                ))}
                {disabledAssigned.map((role) => (
                  <div key={role.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/20 px-3 py-2.5 opacity-70">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium line-through">{role.name}</p>
                      <p className="text-xs text-destructive">Role disabled</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer actions */}
        {canManage && (
          <div className="shrink-0 border-t border-border px-6 py-4 space-y-2">
            {isActive ? (
              <button
                type="button"
                onClick={() => onDisable(member)}
                className="w-full rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                Disable access
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onReactivate(member)}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Reactivate access
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
