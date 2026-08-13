'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from './auth-provider'
import { ErrorState, LoadingSkeleton } from './async-state'

export function ProtectedApp({ children }: { children: React.ReactNode }) {
  const { state, error, refresh } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => { if (state === 'unauthenticated') router.replace(`/login?next=${encodeURIComponent(pathname)}`) }, [state, pathname, router])
  if (state === 'loading') return <LoadingSkeleton label="Restoring your session" />
  if (state === 'error') return <ErrorState description={error?.message ?? 'We could not restore your session.'} onRetry={() => void refresh()} />
  if (state !== 'authenticated') return null
  return <>{children}</>
}
