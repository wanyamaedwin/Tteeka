'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  Boxes,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Users,
  ContactRound,
  ClipboardList,
  Truck,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { logout, logoutAll } from '@/lib/api/auth'
import { clearMockUser } from '@/lib/api/mock-auth'
import { isMockMode } from '@/lib/config'
import { useAuth } from '@/components/auth-provider'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'
import { cn } from '@/lib/utils'
import { MockModeBadge } from '@/components/mock-mode-badge'
import { roleLabels, type Permission } from '@/lib/workspaces'
import { AccessDenied, WorkspaceUnavailable } from '@/components/workspace-access'

// ---------------------------------------------------------------------------
// Navigation definition
// Updated: Business > Settings uses MERCHANT_SETTINGS_READ permission;
//          Business parent uses MERCHANT_PROFILE_READ for sidebar visibility.
//          Team parent shows for STAFF_READ or STAFF_MANAGE; Staff child gated on STAFF_READ.
// ---------------------------------------------------------------------------

const nav = [
  { label: 'Overview', href: '/app', icon: LayoutDashboard },
  {
    label: 'Business',
    href: '/app/business/profile',
    icon: Store,
    permission: 'MERCHANT_PROFILE_READ' as const,
    children: [
      { label: 'Profile', href: '/app/business/profile', permission: 'MERCHANT_PROFILE_READ' as const },
      { label: 'Settings', href: '/app/business/settings', permission: 'MERCHANT_SETTINGS_READ' as const },
    ],
  },
  {
    label: 'Team',
    href: '/app/team/staff',
    icon: Users,
    // Parent visible if user has either read or manage — page itself handles the exact case
    anyPermission: ['STAFF_READ', 'STAFF_MANAGE', 'ROLES_READ', 'ROLES_MANAGE'] as const,
    children: [
      { label: 'Staff', href: '/app/team/staff', permission: 'STAFF_READ' as const },
      { label: 'Roles', href: '/app/team/roles', permission: 'STAFF_MANAGE' as const },

    ],
  },
  {
    label: 'Catalogue',
    href: '/app/catalogue/products',
    icon: ShoppingBag,
    // Visible for read OR manage (page handles exact permission case)
    anyPermission: ['CATALOGUE_READ', 'CATALOGUE_MANAGE'] as const,
  },
  { label: 'Inventory', href: '/app/inventory', icon: Boxes, permission: 'INVENTORY_READ' as const },
  { label: 'Customers', href: '/app/customers', icon: ContactRound, permission: 'CUSTOMERS_READ' as const },
  { label: 'Orders', href: '/app/orders', icon: ClipboardList, permission: 'ORDERS_READ' as const },
  { label: 'Deliveries', href: '/app/deliveries', icon: Truck, permission: 'DELIVERIES_READ' as const },
]


// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

export function AppShell({
  children,
  requiredPermission,
}: {
  children: React.ReactNode
  requiredPermission?: Permission
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)

  const { user, clearUser } = useAuth()
  const { workspace, workspaces, switching, requestWorkspaceSwitch, hasPermission } =
    useMerchantWorkspace()

  async function signOut(all = false) {
    if (!window.confirm(all ? 'Sign out of all sessions?' : 'Sign out of Tteeka?')) return
    try {
      if (isMockMode()) clearMockUser()
      else await (all ? logoutAll() : logout())
    } finally {
      clearUser()
      window.location.href = '/login'
    }
  }

  async function handleWorkspaceSwitch(id: string) {
    setWorkspaceOpen(false)
    setOpen(false)
    await requestWorkspaceSwitch(id)
  }

  const displayName = user?.displayName || 'Account'
  const initials = (user?.displayName || 'A').slice(0, 2).toUpperCase()

  const availableNav = nav.filter((item) => {
    if ('anyPermission' in item && item.anyPermission) {
      return item.anyPermission.some((p) => hasPermission(p as Parameters<typeof hasPermission>[0]))
    }
    return !item.permission || hasPermission(item.permission)
  })

  const unavailable =
    workspace.status !== 'ACTIVE' || workspace.membershipStatus !== 'ACTIVE'
  const denied = Boolean(requiredPermission && !hasPermission(requiredPermission))

  const content = unavailable ? (
    <WorkspaceUnavailable suspended={workspace.status === 'SUSPENDED'} />
  ) : denied ? (
    <AccessDenied />
  ) : (
    children
  )

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-sidebar px-5 py-6 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-2">
          <Link href="/app" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <span className="grid size-9 place-items-center rounded-xl bg-primary font-serif text-lg font-bold text-primary-foreground">
              T
            </span>
            <span className="font-serif text-2xl font-bold tracking-tight">tteeka</span>
          </Link>
          <button
            className="rounded-lg p-2 text-muted-foreground lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>

        {/* Workspace switcher */}
        <div className="relative mt-10">
          <button
            type="button"
            onClick={() => setWorkspaceOpen((v) => !v)}
            aria-expanded={workspaceOpen}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-accent font-semibold text-accent-foreground">
              {workspace.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{workspace.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {workspace.location ? `${workspace.location} · ` : ''}{roleLabels[workspace.role]}
              </span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>

          {workspaceOpen && (
            <div className="absolute inset-x-0 top-16 z-30 rounded-xl border border-border bg-card p-2 shadow-xl">
              <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Switch workspace
              </p>
              {workspaces.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={switching}
                  onClick={() => void handleWorkspaceSwitch(item.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-accent',
                    item.id === workspace.id && 'bg-accent',
                  )}
                >
                  <span className="grid size-8 place-items-center rounded-md bg-secondary text-xs font-semibold">
                    {item.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.location} · {roleLabels[item.role]}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.status === 'SUSPENDED'
                        ? 'Suspended'
                        : item.membershipStatus === 'DISABLED'
                          ? 'Access disabled'
                          : 'Active'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Main navigation">
          {availableNav.map((item) => {
            const Icon = item.icon
            const active =
              pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <div key={item.label}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-sidebar-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
                {item.children && active && (
                  <div className="ml-9 flex flex-col gap-1 border-l border-border py-2 pl-3">
                    {item.children
                      .filter((child) => hasPermission(child.permission))
                      .map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            'rounded-md px-2 py-1.5 text-sm',
                            pathname === child.href
                              ? 'font-semibold text-primary'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {child.label}
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer links */}
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <Link
            href="/app/business/settings"
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-sidebar-foreground hover:bg-accent"
          >
            <Settings className="size-4" />
            Settings
          </Link>
          <button className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-sidebar-foreground hover:bg-accent">
            <CircleHelp className="size-4" />
            Help centre
          </button>
        </div>
      </aside>

      {/* Sidebar overlay (mobile) */}
      {open && (
        <button
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <header className="flex h-20 items-center justify-between border-b border-border bg-background px-5 md:px-8">
          <button
            className="rounded-lg p-2 hover:bg-accent lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>

          <div className="hidden text-sm text-muted-foreground md:block">
            Monday, 11 August 2026{' '}
            <span className="mx-2 text-border">/</span>
            {workspace.name}{' '}
            <span className="mx-2 text-border">/</span>
            <MockModeBadge />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
              aria-label="Notifications"
            >
              <Bell className="size-5" />
            </button>

            <div className="relative flex items-center gap-2 border-l border-border pl-3">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label="Open account menu"
                className="flex items-center gap-2"
              >
                <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {initials}
                </span>
                <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
                  {displayName}
                </span>
                <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-11 z-20 flex w-56 flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-lg">
                  <p className="truncate px-3 pt-2 text-xs font-semibold">
                    {workspace.name} · {roleLabels[workspace.role]}
                  </p>
                  <p className="truncate px-3 pb-2 text-xs text-muted-foreground">
                    {user?.displayName || 'Signed-in account'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    Sign out
                  </button>
                  <button
                    type="button"
                    onClick={() => void signOut(true)}
                    className="rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                  >
                    Sign out all sessions
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-10">{content}</main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared layout components
// ---------------------------------------------------------------------------

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow ?? 'Workspace'}
        </p>
        <h1 className="font-serif text-4xl font-bold tracking-tight text-balance md:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function StatusPill({ status }: { status: string }) {
  const positive = status === 'Active' || status === 'Ready'
  const warning = status === 'Invited' || status === 'Set up'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        positive
          ? 'bg-accent text-accent-foreground'
          : warning
            ? 'bg-secondary text-secondary-foreground'
            : 'bg-destructive/10 text-destructive',
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}
