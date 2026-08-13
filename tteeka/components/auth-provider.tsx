'use client'

import { ApiError } from '@/lib/api/errors'
import { getCurrentUser } from '@/lib/api/auth'
import { getMockUser } from '@/lib/api/mock-auth'
import { isMockMode } from '@/lib/config'
import type { AuthUser } from '@/lib/api/types'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'error'
type AuthContextValue = { user: AuthUser | null; state: AuthState; error: ApiError | null; refresh: () => Promise<void>; setUser: (user: AuthUser) => void; clearUser: () => void }

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [state, setState] = useState<AuthState>('loading')
  const [error, setError] = useState<ApiError | null>(null)
  const refresh = useCallback(async () => {
    setState('loading'); setError(null)
    if (isMockMode()) { const nextUser = getMockUser(); setUserState(nextUser); setState(nextUser ? 'authenticated' : 'unauthenticated'); return }
    try { const nextUser = await getCurrentUser(); if (!nextUser) { setUserState(null); setState('unauthenticated'); return }; setUserState(nextUser); setState('authenticated') }
    catch (cause) { const next = cause instanceof ApiError ? cause : new ApiError({ message: 'Unable to restore your session.' }); setError(next); setState(next.status === 401 ? 'unauthenticated' : 'error'); if (next.status === 401) setUserState(null) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const setUser = useCallback((next: AuthUser) => { setUserState(next); setState('authenticated'); setError(null) }, [])
  const clearUser = useCallback(() => { setUserState(null); setState('unauthenticated') }, [])
  const value = useMemo(() => ({ user, state, error, refresh, setUser, clearUser }), [user, state, error, refresh, setUser, clearUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used within AuthProvider'); return value }
