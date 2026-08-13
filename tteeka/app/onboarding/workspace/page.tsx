'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Building2, Store } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ProtectedApp } from '@/components/protected-app'
import { ErrorState, LoadingSkeleton } from '@/components/async-state'
import { ApiError } from '@/lib/api/errors'
import { createWorkspace, getWorkspaceStatus } from '@/lib/api/onboarding'
import { isMockMode } from '@/lib/config'
import { useAuth } from '@/components/auth-provider'

export default function WorkspaceOnboardingPage() {
  return (
    <ProtectedApp>
      <WorkspaceOnboarding />
    </ProtectedApp>
  )
}

function WorkspaceOnboarding() {
  const router = useRouter()
  const { clearUser, refresh } = useAuth()
  const key = useRef(crypto.randomUUID())
  const errorRef = useRef<HTMLParagraphElement>(null)
  const [checking, setChecking] = useState(true)
  const [businessName, setBusinessName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const check = useCallback(async () => {
    setChecking(true)
    setError(null)
    if (isMockMode()) {
      router.replace('/app')
      return
    }
    try {
      const status = await getWorkspaceStatus()
      if (status.state === 'READY') router.replace('/app')
    } catch (cause) {
      const next =
        cause instanceof ApiError
          ? cause
          : new ApiError({ message: 'Unable to check your workspace.' })
      if (next.status === 401) {
        clearUser()
        router.replace('/login')
      } else setError(next)
    } finally {
      setChecking(false)
    }
  }, [clearUser, router])
  useEffect(() => {
    void check()
  }, [check])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createWorkspace({ businessName: businessName.trim() }, key.current)
      await refresh()
      router.replace('/app')
    } catch (cause) {
      const next =
        cause instanceof ApiError
          ? cause
          : new ApiError({ message: 'We couldn’t create your workspace.' })
      if (next.status === 401) {
        clearUser()
        router.replace('/login')
      } else if (next.status === 409 && next.message.includes('already belong'))
        router.replace('/app')
      else {
        setError(next)
        queueMicrotask(() => errorRef.current?.focus())
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) return <LoadingSkeleton label="Checking your workspace" />
  if (
    error &&
    !error.isNetworkError &&
    error.status !== 400 &&
    error.status !== 409
  )
    return (
      <ErrorState
        title={
          error.status === 403
            ? 'Workspace access denied'
            : 'Workspace unavailable'
        }
        description={
          error.status === 403
            ? "You don't have permission to access this workspace."
            : error.message
        }
        onRetry={() => void check()}
      />
    )
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-5 py-10">
      <div
        className="min-w-0 w-full max-w-md flex-1"
        style={{ flexBasis: 0, minWidth: 0, width: '100%' }}
      >
        <div className="mb-8">
          <span className="mb-5 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Store className="size-6" />
          </span>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            One last step
          </p>
          <h1 className="font-serif text-4xl font-bold tracking-tight">
            Create your business workspace
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Give your workspace the business name your team will recognize.
          </p>
        </div>
        <form
          onSubmit={submit}
          aria-describedby={error ? 'workspace-error' : undefined}
          className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
        >
          <label
            htmlFor="businessName"
            className="flex min-w-0 flex-col gap-2 text-sm font-semibold"
          >
            Business name
            <div className="relative min-w-0">
              <Building2 className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
              <input
                id="businessName"
                name="businessName"
                autoComplete="organization"
                required
                maxLength={160}
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Your business"
              />
            </div>
          </label>
          {error && (
            <p
              ref={errorRef}
              id="workspace-error"
              tabIndex={-1}
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive outline-none"
            >
              {error.isNetworkError
                ? 'We couldn’t reach Tteeka. Check your connection and try again.'
                : error.status === 400
                  ? 'Enter a valid business name.'
                  : error.message}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating workspace…' : 'Create workspace'}
          </button>
        </form>
      </div>
    </main>
  )
}
