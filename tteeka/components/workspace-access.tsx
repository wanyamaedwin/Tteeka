import Link from 'next/link'
import { ArrowLeft, LockKeyhole, RefreshCw, Store } from 'lucide-react'
export function AccessDenied({ title = 'You do not have access to this area.' }: { title?: string }) {
  return <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center"><span className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><LockKeyhole /></span><h2 className="mt-4 font-serif text-2xl font-bold">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Ask the workspace owner to update your role or switch to a workspace where you have access.</p><Link href="/app" className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Back to overview</Link></section>
}

export function WorkspaceUnavailable({ suspended }: { suspended: boolean }) {
  return <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center"><span className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">{suspended ? <RefreshCw /> : <Store />}</span><h2 className="mt-4 font-serif text-2xl font-bold">{suspended ? 'Workspace suspended' : 'Membership disabled'}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{suspended ? 'This workspace is temporarily unavailable. Switch workspace to continue working.' : 'Your membership is disabled for this workspace. Switch workspace to continue.'}</p><Link href="/app" className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Switch workspace</Link></section>
}

export function BackLink() { return <Link href="/app" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to overview</Link> }
