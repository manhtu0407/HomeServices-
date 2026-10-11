import { useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'

import { useAuth } from './auth-provider'
import { api } from './api'
import { generateClientRequestId } from './client-request-id'
import { clearMobileHealthFailure, peekMobileHealthFailure } from './mobile-health-state'

const HEARTBEAT_INTERVAL_MS = 60_000
const HEARTBEAT_JITTER_MS = 10_000

export function MobileHealthTelemetry() {
  const { loading, passwordRecoveryPending, profileStatus, role, session } = useAuth()
  const sessionNonceRef = useRef<string | null>(null)
  if (sessionNonceRef.current === null) sessionNonceRef.current = generateClientRequestId()

  useEffect(() => {
    if (Platform.OS === 'web' || loading || profileStatus !== 'ready' || !role || passwordRecoveryPending || !session?.access_token) {
      return () => undefined
    }

    let active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive'
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let requestController: AbortController | null = null

    const clearTimer = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }
    const schedule = (delay: number) => {
      clearTimer()
      if (!disposed && active) timer = setTimeout(send, delay)
    }
    const send = () => {
      if (disposed || !active || requestController) return
      const failure = peekMobileHealthFailure()
      const startedAt = Date.now()
      const controller = new AbortController()
      requestController = controller
      void api.post<{ accepted: boolean }>('/telemetry/mobile-health', {
        client_session_id: sessionNonceRef.current!,
        observed_at: new Date(startedAt).toISOString(),
        api_status: failure ? 'yellow' : 'green',
        reason_code: failure?.reason_code ?? 'API_REACHABLE',
        duration_ms: failure?.duration_ms ?? null,
      }, { signal: controller.signal }).then((result) => {
        if (result.success && result.data.accepted) clearMobileHealthFailure(failure)
      }).catch(() => undefined).finally(() => {
        if (requestController === controller) {
          requestController = null
          if (!disposed && active) schedule(HEARTBEAT_INTERVAL_MS + Math.floor(Math.random() * (HEARTBEAT_JITTER_MS + 1)))
        }
      })
    }
    const subscription = AppState.addEventListener('change', (state) => {
      active = state === 'active'
      if (active) send()
      else {
        clearTimer()
        requestController?.abort()
        requestController = null
      }
    })

    if (active) schedule(Math.floor(Math.random() * (HEARTBEAT_JITTER_MS + 1)))
    return () => {
      disposed = true
      active = false
      clearTimer()
      requestController?.abort()
      requestController = null
      subscription.remove()
    }
  }, [loading, passwordRecoveryPending, profileStatus, role, session?.access_token])

  return null
}
