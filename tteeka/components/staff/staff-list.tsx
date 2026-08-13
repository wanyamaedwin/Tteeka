'use client'

import { MoreHorizontal, ShieldCheck } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { MockRoleRecord, StaffMemberPreview } from '@/lib/mock-staff'

// ---------------------------------------------------------------------------
// StaffList
//
// Desktop: polished table with columns — Staff member | Phone | Status | Roles | Actions
// Mobile:  structured card list
// ---------------------------------------------------------------------------

type StaffListProps = {
  members: StaffMemberPreview[]
  allRoles: MockRoleRecord[]
  canManage: boolean
  canManageRoles: boolean
  onSelect: (member: StaffMemberPreview) => void
  onManageRoles: (member: StaffMemberPreview) => void
  onDisable: (member: StaffMemberPreview) => void
  onReactivate: (member: StaffMemberPreview) => void
}

export function StaffList({
  members,
  allRoles,
  canManage,
  canManageRoles,
  onSelect,
  onManageRoles,
  onDisable,
  onReactivate,
}: StaffListProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3.5">Staff member</th>
                <th className="px-5 py-3.5">Phone</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Roles</th>
                {(canManage || canManageRoles) && <th className="px-5 py-3.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((member) => (
                <StaffTableRow
                  key={member.membershipId}
                  member={member}
                  allRoles={allRoles}
                  canManage={canManage}
                  canManageRoles={canManageRoles}
                  onSelect={onSelect}
                  onManageRoles={onManageRoles}
                  onDisable={onDisable}
                  onReactivate={onReactivate}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {members.map((member) => (
          <StaffCard
            key={member.membershipId}
            member={member}
            allRoles={allRoles}
            canManage={canManage}
            canManageRoles={canManageRoles}
            onSelect={onSelect}
            onManageRoles={onManageRoles}
            onDisable={onDisable}
            onReactivate={onReactivate}
          />
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Shared role display helper
// ---------------------------------------------------------------------------

function RolePills({ member, allRoles }: { member: StaffMemberPreview; allRoles: MockRoleRecord[] }) {
  if (member.roleIds.length === 0) {
    return <span className="text-xs italic text-muted-foreground">No role assigned</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {member.roleIds.slice(0, 3).map((id) => {
        const role = allRoles.find((r) => r.id === id)
        if (!role) return null
        const isDisabled = role.status === 'DISABLED'
        return (
          <span
            key={id}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              isDisabled
                ? 'bg-secondary/60 text-muted-foreground line-through'
                : 'bg-accent/70 text-accent-foreground',
            )}
          >
            <ShieldCheck className="size-3" aria-hidden="true" />
            {role.name}
          </span>
        )
      })}
      {member.roleIds.length > 3 && (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
          +{member.roleIds.length - 3} more
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatusBadge — not colour-only: includes text label
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: 'ACTIVE' | 'DISABLED' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        status === 'ACTIVE'
          ? 'bg-accent/70 text-accent-foreground'
          : 'bg-secondary text-muted-foreground',
      )}
      aria-label={`Membership status: ${status === 'ACTIVE' ? 'Active' : 'Disabled'}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {status === 'ACTIVE' ? 'Active' : 'Disabled'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Action menu (three-dot)
// ---------------------------------------------------------------------------

function ActionMenu({
  member,
  canManage,
  canManageRoles,
  onSelect,
  onManageRoles,
  onDisable,
  onReactivate,
}: {
  member: StaffMemberPreview
  canManage: boolean
  canManageRoles: boolean
  onSelect: (m: StaffMemberPreview) => void
  onManageRoles: (m: StaffMemberPreview) => void
  onDisable: (m: StaffMemberPreview) => void
  onReactivate: (m: StaffMemberPreview) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const displayName = member.name ?? member.phone

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions for ${displayName}`}
        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-border bg-card p-1.5 shadow-xl"
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => { setOpen(false); onSelect(member) }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
          >
            View details
          </button>
          {(canManage || canManageRoles) && (
            <>
              {canManageRoles && <button
                role="menuitem"
                type="button"
                onClick={() => { setOpen(false); onManageRoles(member) }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                Manage roles
              </button>}
              {canManage && (member.membershipStatus === 'ACTIVE' ? (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => { setOpen(false); onDisable(member) }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  Disable access
                </button>
              ) : (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => { setOpen(false); onReactivate(member) }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  Reactivate access
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Desktop table row
// ---------------------------------------------------------------------------

function StaffTableRow({
  member,
  allRoles,
  canManage,
  canManageRoles,
  onSelect,
  onManageRoles,
  onDisable,
  onReactivate,
}: {
  member: StaffMemberPreview
  allRoles: MockRoleRecord[]
  canManage: boolean
  canManageRoles: boolean
  onSelect: (m: StaffMemberPreview) => void
  onManageRoles: (m: StaffMemberPreview) => void
  onDisable: (m: StaffMemberPreview) => void
  onReactivate: (m: StaffMemberPreview) => void
}) {
  const displayName = member.name ?? member.phone

  return (
    <tr className="transition-colors hover:bg-secondary/20">
      {/* Identity */}
      <td className="px-5 py-4">
        <button
          type="button"
          onClick={() => onSelect(member)}
          className="flex items-center gap-3 text-left"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
            {displayName.slice(0, 2).toUpperCase()}
          </span>
          <span>
            <span className="block font-semibold">{displayName}</span>
            {member.email && (
              <span className="block text-xs text-muted-foreground">{member.email}</span>
            )}
          </span>
        </button>
      </td>

      {/* Phone */}
      <td className="px-5 py-4 text-sm text-muted-foreground">{member.phone}</td>

      {/* Status */}
      <td className="px-5 py-4">
        <StatusBadge status={member.membershipStatus} />
      </td>

      {/* Roles */}
      <td className="px-5 py-4">
        <RolePills member={member} allRoles={allRoles} />
      </td>

      {/* Actions */}
      {(canManage || canManageRoles) && (
        <td className="px-5 py-4 text-right">
          <ActionMenu
            member={member}
            canManage={canManage}
            canManageRoles={canManageRoles}
            onSelect={onSelect}
            onManageRoles={onManageRoles}
            onDisable={onDisable}
            onReactivate={onReactivate}
          />
        </td>
      )}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function StaffCard({
  member,
  allRoles,
  canManage,
  canManageRoles,
  onSelect,
  onManageRoles,
  onDisable,
  onReactivate,
}: {
  member: StaffMemberPreview
  allRoles: MockRoleRecord[]
  canManage: boolean
  canManageRoles: boolean
  onSelect: (m: StaffMemberPreview) => void
  onManageRoles: (m: StaffMemberPreview) => void
  onDisable: (m: StaffMemberPreview) => void
  onReactivate: (m: StaffMemberPreview) => void
}) {
  const displayName = member.name ?? member.phone

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
          {displayName.slice(0, 2).toUpperCase()}
        </span>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(member)}
                className="block truncate text-sm font-semibold text-left"
              >
                {displayName}
              </button>
              <p className="text-xs text-muted-foreground">{member.phone}</p>
              {member.email && <p className="text-xs text-muted-foreground truncate">{member.email}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge status={member.membershipStatus} />
              <ActionMenu
                member={member}
                canManage={canManage}
                canManageRoles={canManageRoles}
                onSelect={onSelect}
                onManageRoles={onManageRoles}
                onDisable={onDisable}
                onReactivate={onReactivate}
              />
            </div>
          </div>

          {/* Roles */}
          <div className="mt-3">
            <RolePills member={member} allRoles={allRoles} />
          </div>
        </div>
      </div>
    </div>
  )
}
