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
  const { session, role, signOut } = useAuth()
  const localVisualAuditSession = session?.user.app_metadata?.provider === 'local-visual-audit'
  const activationUnavailable = localVisualAuditSession || (role !== 'customer' && role !== 'admin_operator')
  const [status, setStatus] = useState<AdminActivationStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedSessionKey, setResolvedSessionKey] = useState<string | null>(null)
  const sessionKey = session ? `${session.user.id}:${role ?? 'unknown'}` : null

  const applyResult = useCallback((result: ApiResult<AdminActivationStatus>, resolvedKey: string) => {
    if (result.success) {
      setStatus(result.data)
      setError(null)
    } else if (result.status === 404 || result.status === 403) {
      setStatus(null)
      setError(null)
    } else {
      setError(result.error)
    }
    setResolvedSessionKey(resolvedKey)
  }, [])

  const refresh = useCallback(async () => {
    if (!session || activationUnavailable || !sessionKey) return
    setLoading(true)
    const result = await api.get<AdminActivationStatus>('/me/admin-activation')
    applyResult(result, sessionKey)
    setLoading(false)
  }, [activationUnavailable, applyResult, session, sessionKey])

  useEffect(() => {
    if (!session || activationUnavailable || !sessionKey) return
    let cancelled = false
    void api.get<AdminActivationStatus>('/me/admin-activation').then((result) => {
      if (!cancelled) applyResult(result, sessionKey)
    })
    return () => { cancelled = true }
  }, [activationUnavailable, applyResult, session, sessionKey])

  const activate = useCallback(async (input: AdminOperatorActivationInput) => {
    if (!session || role !== 'customer' || localVisualAuditSession) {
      return false
    }
    setLoading(true)
    const result = await api.post<{ ok: true }>('/me/admin-activation', input)
    if (!result.success) {
      setError(result.error)
      setLoading(false)
      return false
    }
    await signOut()
    setStatus(null)
    setResolvedSessionKey(null)
    setError(null)
    setLoading(false)
    return true
  }, [localVisualAuditSession, role, session, signOut])

  const unresolvedSession = Boolean(session && !activationUnavailable && resolvedSessionKey !== sessionKey)
  const visibleStatus = session && !activationUnavailable && !unresolvedSession ? status : null
  const visibleError = session && !activationUnavailable && !unresolvedSession ? error : null
  const visibleLoading = Boolean(session && !activationUnavailable && (loading || unresolvedSession))
  const value = useMemo(() => ({ activate, error: visibleError, loading: visibleLoading, refresh, status: visibleStatus }), [activate, refresh, visibleError, visibleLoading, visibleStatus])
  return <AdminActivationContext value={value}>{children}</AdminActivationContext>
}

export function useAdminActivation() {
  const value = use(AdminActivationContext)
  if (!value) throw new Error('useAdminActivation must be used within AdminActivationProvider')
  return value
}
