import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AdminOperatorActivationInput } from '@nestscout/shared'
import { api, type ApiResult } from './api'
import { useAuth } from './auth-provider'

type AdminActivationStatus = {
  required: boolean
  status: 'pending_password_change' | 'active' | 'failed' | null
  email_masked: string | null
  full_name: string | null
  capability_count: number
}

type AdminActivationContextValue = {
  error: string | null
  loading: boolean
  status: AdminActivationStatus | null
  activate(input: AdminOperatorActivationInput): Promise<boolean>
  refresh(): Promise<void>
}

const AdminActivationContext = createContext<AdminActivationContextValue | null>(null)

export function AdminActivationProvider({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth()
  const [status, setStatus] = useState<AdminActivationStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null)

  const applyResult = useCallback((result: ApiResult<AdminActivationStatus>, userId: string) => {
    if (result.success) {
      setStatus(result.data)
      setError(null)
    } else if (result.status === 404 || result.status === 403) {
      setStatus(null)
      setError(null)
    } else {
      setError(result.error)
    }
    setResolvedUserId(userId)
  }, [])

  const refresh = useCallback(async () => {
    if (!session) {
      setStatus(null)
      setResolvedUserId(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const result = await api.get<AdminActivationStatus>('/me/admin-activation')
    applyResult(result, session.user.id)
    setLoading(false)
  }, [applyResult, session])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void api.get<AdminActivationStatus>('/me/admin-activation').then((result) => {
      if (!cancelled) applyResult(result, session.user.id)
    })
    return () => { cancelled = true }
  }, [applyResult, session])

  const activate = useCallback(async (input: AdminOperatorActivationInput) => {
    setLoading(true)
    const result = await api.post<{ ok: true }>('/me/admin-activation', input)
    if (!result.success) {
      setError(result.error)
      setLoading(false)
      return false
    }
    await signOut()
    setStatus(null)
    setResolvedUserId(null)
    setError(null)
    setLoading(false)
    return true
  }, [signOut])

  const unresolvedSession = Boolean(session && resolvedUserId !== session.user.id)
  const visibleStatus = session && !unresolvedSession ? status : null
  const value = useMemo(() => ({ activate, error, loading: loading || unresolvedSession, refresh, status: visibleStatus }), [activate, error, loading, refresh, unresolvedSession, visibleStatus])
  return <AdminActivationContext value={value}>{children}</AdminActivationContext>
}

export function useAdminActivation() {
  const value = use(AdminActivationContext)
  if (!value) throw new Error('useAdminActivation must be used within AdminActivationProvider')
  return value
}
