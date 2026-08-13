'use client'

import Link from 'next/link'
import { ArrowRight, Boxes, ClipboardList, PackagePlus, Plus, Settings2, Store, Users } from 'lucide-react'
import { AppShell, PageHeader, StatusPill } from '@/components/app-shell'
import { useAuth } from '@/components/auth-provider'
import { useMerchantWorkspace } from '@/components/merchant-workspace-provider'

const actions = [
  { label: 'Add product', hint: 'Create a product and its variants', icon: PackagePlus, href: '/app/catalogue/products', managePermission: 'CATALOGUE_MANAGE' as const, readPermission: 'CATALOGUE_READ' as const },
  { label: 'Receive stock', hint: 'Update available inventory', icon: Boxes, href: '/app/inventory', managePermission: 'INVENTORY_MANAGE' as const, readPermission: 'INVENTORY_READ' as const },
  { label: 'Add staff', hint: 'Invite someone to your workspace', icon: Plus, href: '/app/team/staff', managePermission: 'STAFF_MANAGE' as const, readPermission: 'STAFF_READ' as const },
  { label: 'Manage roles', hint: 'Review access and permissions', icon: Users, href: '/app/team/roles', permission: 'STAFF_MANAGE' as const },
]

const areas = [
  { label: 'Business profile', description: 'Keep your business details and workspace identity up to date.', action: 'Open profile', href: '/app/business/profile', icon: Store, permission: 'MERCHANT_READ' as const },
  { label: 'Staff & roles', description: 'Manage your team members, roles and permissions.', action: 'Open team', href: '/app/team/staff', icon: Users, permission: 'STAFF_READ' as const },
  { label: 'Product catalogue', description: 'Organise products and maintain their variants.', action: 'Open products', href: '/app/catalogue/products', icon: PackagePlus, permission: 'CATALOGUE_READ' as const },
  { label: 'Inventory', description: 'Review the available quantity for each variant.', action: 'Open inventory', href: '/app/inventory', icon: Boxes, permission: 'INVENTORY_READ' as const },
]

const setup = [
  { label: 'Business profile', status: 'Ready' as const, href: '/app/business/profile' },
  { label: 'Team access', status: 'Ready' as const, href: '/app/team/staff' },
  { label: 'Product catalogue', status: 'Set up' as const, href: '/app/catalogue/products' },
  { label: 'Inventory', status: 'Set up' as const, href: '/app/inventory' },
]

export default function HomePage() {
  const { user } = useAuth()
  const firstName = user?.displayName.split(' ')[0] || 'there'
  const { hasPermission, canManage } = useMerchantWorkspace()
  const visibleActions = actions.filter(action => 'managePermission' in action ? canManage(action.managePermission!, action.readPermission!) : hasPermission(action.permission!))
  const visibleAreas = areas.filter(area => !area.permission || hasPermission(area.permission))
  return <AppShell>
    <PageHeader eyebrow="Overview" title={`Good afternoon, ${firstName}`} description="Manage your business, catalogue and inventory from one place." />
    <section aria-labelledby="quick-actions" className="mb-10">
      <div className="mb-5"><h2 id="quick-actions" className="font-serif text-2xl font-bold">Quick actions</h2><p className="mt-1 text-sm text-muted-foreground">Jump into the tasks you use most.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{visibleActions.map(({ label, hint, icon: Icon, href }) => <Link key={label} href={href} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"><span className="grid size-10 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{hint}</span></span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></Link>)}</div>
    </section>
    <div className="grid gap-8 lg:grid-cols-[1.45fr_1fr]">
      <section aria-labelledby="manage-business"><div className="mb-5"><h2 id="manage-business" className="font-serif text-2xl font-bold">Manage your business</h2><p className="mt-1 text-sm text-muted-foreground">Your core workspace areas, all in one view.</p></div><div className="grid gap-3 sm:grid-cols-2">{visibleAreas.map(({ label, description, action, href, icon: Icon }) => <Link key={label} href={href} className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent"><div className="mb-8 flex items-center justify-between"><span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-5" /></span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div><h3 className="text-sm font-semibold">{label}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{description}</p><span className="mt-4 inline-flex text-xs font-semibold text-primary">{action}</span></Link>)}</div></section>
      <section aria-labelledby="setup" className="rounded-2xl bg-primary p-6 text-primary-foreground"><div className="flex items-start justify-between"><div><p className="text-sm opacity-70">Workspace checklist</p><h2 id="setup" className="mt-1 font-serif text-2xl font-bold">Getting started</h2></div><Settings2 className="size-5 opacity-70" /></div><p className="mt-3 text-sm leading-6 opacity-75">A simple view of the areas you can set up next.</p><div className="mt-8 flex flex-col gap-4">{setup.map(item => <Link key={item.label} href={item.href} className="flex items-center justify-between border-b border-primary-foreground/20 pb-4 last:border-0 last:pb-0"><span className="text-sm font-medium">{item.label}</span><StatusPill status={item.status} /></Link>)}</div></section>
    </div>
  </AppShell>
}
