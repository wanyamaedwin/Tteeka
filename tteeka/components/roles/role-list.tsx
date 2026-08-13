'use client'

import { MoreHorizontal, ShieldCheck, ShieldOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { RolePreview, StaffMemberPreview } from '@/lib/mock-staff'

// ---------------------------------------------------------------------------
// RoleList — desktop table + mobile cards
// ---------------------------------------------------------------------------

type RoleListProps = {
  roles: RolePreview[]
  staffList?: StaffMemberPreview[]
  canManage: boolean
  onSelect: (role: RolePreview) => void
  onEdit: (role: RolePreview) => void
  onManagePermissions: (role: RolePreview) => void
  onDisable: (role: RolePreview) => void
  onReactivate: (role: RolePreview) => void
}

export function RoleList({
  roles,
  staffList,
  canManage,
  onSelect,
  onEdit,
  onManagePermissions,
  onDisable,
  onReactivate,
}: RoleListProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Permissions</th>
                <th className="px-5 py-3.5">Assigned staff</th>
                {canManage && <th className="px-5 py-3.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roles.map((role) => (
                <RoleTableRow
                  key={role.id}
                  role={role}
                  staffList={staffList}
                  canManage={canManage}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onManagePermissions={onManagePermissions}
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
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            staffList={staffList}
            canManage={canManage}
            onSelect={onSelect}
            onEdit={onEdit}
            onManagePermissions={onManagePermissions}
            onDisable={onDisable}
            onReactivate={onReactivate}
          />
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function RoleStatusBadge({ status }: { status: 'ACTIVE' | 'DISABLED' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        status === 'ACTIVE' ? 'bg-accent/70 text-accent-foreground' : 'bg-secondary text-muted-foreground',
      )}
      aria-label={`Role status: ${status === 'ACTIVE' ? 'Active' : 'Disabled'}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {status === 'ACTIVE' ? 'Active' : 'Disabled'}
    </span>
  )
}

function PermissionCountBadge({ role }: { role: RolePreview }) {
  const count = role.permissionKeys.length
  if (count === 0) return <span className="text-xs italic text-muted-foreground">No permissions</span>
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ShieldCheck className="size-3 shrink-0" aria-hidden="true" />
      {count} permission{count !== 1 ? 's' : ''}
    </span>
  )
}

function ActionMenu({
  role,
  canManage,
  onSelect,
  onEdit,
  onManagePermissions,
  onDisable,
  onReactivate,
}: {
  role: RolePreview
  canManage: boolean
  onSelect: (r: RolePreview) => void
  onEdit: (r: RolePreview) => void
  onManagePermissions: (r: RolePreview) => void
  onDisable: (r: RolePreview) => void
  onReactivate: (r: RolePreview) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Actions for ${role.name}`}
        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-border bg-card p-1.5 shadow-xl">
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onSelect(role) }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary">
            View details
          </button>
          {canManage && (
            <>
              <button role="menuitem" type="button" onClick={() => { setOpen(false); onEdit(role) }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary">
                Edit role
              </button>
              <button role="menuitem" type="button" onClick={() => { setOpen(false); onManagePermissions(role) }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary">
                Manage permissions
              </button>
              {role.status === 'ACTIVE' ? (
                <button role="menuitem" type="button" onClick={() => { setOpen(false); onDisable(role) }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10">
                  Disable role
                </button>
              ) : (
                <button role="menuitem" type="button" onClick={() => { setOpen(false); onReactivate(role) }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary">
                  Reactivate role
                </button>
              )}
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

function RoleTableRow({
  role, staffList, canManage, onSelect, onEdit, onManagePermissions, onDisable, onReactivate,
}: {
  role: RolePreview; staffList?: StaffMemberPreview[]; canManage: boolean
  onSelect: (r: RolePreview) => void; onEdit: (r: RolePreview) => void
  onManagePermissions: (r: RolePreview) => void; onDisable: (r: RolePreview) => void
  onReactivate: (r: RolePreview) => void
}) {
  const assignedCount = staffList?.filter((m) => m.roleIds.includes(role.id)).length
  return (
    <tr className="transition-colors hover:bg-secondary/20">
      <td className="px-5 py-4">
        <button type="button" onClick={() => onSelect(role)} className="text-left">
          <p className={cn('font-semibold', role.status === 'DISABLED' && 'text-muted-foreground')}>{role.name}</p>
          {role.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{role.description}</p>}
        </button>
      </td>
      <td className="px-5 py-4"><RoleStatusBadge status={role.status} /></td>
      <td className="px-5 py-4"><PermissionCountBadge role={role} /></td>
      <td className="px-5 py-4 text-sm text-muted-foreground">
        {assignedCount === undefined
          ? <span className="italic">Unavailable</span>
          : assignedCount > 0 ? `${assignedCount} staff` : <span className="italic">None</span>}
      </td>
      {canManage && (
        <td className="px-5 py-4 text-right">
          <ActionMenu role={role} canManage={canManage} onSelect={onSelect} onEdit={onEdit}
            onManagePermissions={onManagePermissions} onDisable={onDisable} onReactivate={onReactivate} />
        </td>
      )}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function RoleCard({
  role, staffList, canManage, onSelect, onEdit, onManagePermissions, onDisable, onReactivate,
}: {
  role: RolePreview; staffList?: StaffMemberPreview[]; canManage: boolean
  onSelect: (r: RolePreview) => void; onEdit: (r: RolePreview) => void
  onManagePermissions: (r: RolePreview) => void; onDisable: (r: RolePreview) => void
  onReactivate: (r: RolePreview) => void
}) {
  const assignedCount = staffList?.filter((m) => m.roleIds.includes(role.id)).length
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn(
          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
          role.status === 'ACTIVE' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground',
        )}>
          {role.status === 'ACTIVE' ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button type="button" onClick={() => onSelect(role)} className="block text-left text-sm font-semibold break-words">
                {role.name}
              </button>
              {role.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{role.description}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <RoleStatusBadge status={role.status} />
              <ActionMenu role={role} canManage={canManage} onSelect={onSelect} onEdit={onEdit}
                onManagePermissions={onManagePermissions} onDisable={onDisable} onReactivate={onReactivate} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <PermissionCountBadge role={role} />
            <span>·</span>
            <span>{assignedCount === undefined
              ? 'Staff count unavailable'
              : assignedCount > 0 ? `${assignedCount} assigned staff` : 'No assigned staff'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
