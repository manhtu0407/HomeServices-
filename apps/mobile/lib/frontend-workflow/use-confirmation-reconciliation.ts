import { useEffect, useEffectEvent, useRef } from 'react'
import { AppState } from 'react-native'

type ConfirmationReconciliationInput = {
  sessionId: string | null
  ownerId: string | null
  pendingSessionId: string | null
  reconciling: boolean
  reconcile: () => Promise<void>
  onUnavailable: () => void
}

export function useConfirmationReconciliation({
  sessionId,
  ownerId,
  pendingSessionId,
  reconciling,
  reconcile,
  onUnavailable,
}: ConfirmationReconciliationInput) {
  const lifecycle = useRef({ active: false, generation: 0, inFlight: false })
  const reconcileSafely = useEffectEvent(async () => {
    if (!lifecycle.current.active || lifecycle.current.inFlight) return
    const generation = lifecycle.current.generation
    lifecycle.current.inFlight = true
    try {
      await reconcile()
    } catch {
      if (lifecycle.current.active && lifecycle.current.generation === generation) onUnavailable()
    } finally {
      if (lifecycle.current.generation === generation) lifecycle.current.inFlight = false
    }
  })

  useEffect(() => {
    if (!sessionId || !ownerId) return
    lifecycle.current.active = true
    lifecycle.current.generation += 1
    lifecycle.current.inFlight = false
    void reconcileSafely()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcileSafely()
    })
    return () => {
      lifecycle.current.active = false
      lifecycle.current.generation += 1
      subscription.remove()
    }
  }, [ownerId, sessionId])

  useEffect(() => {
    if (!sessionId || !ownerId || !reconciling || pendingSessionId !== sessionId) return
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void reconcileSafely()
    }, 3_000)
    return () => clearInterval(interval)
  }, [ownerId, pendingSessionId, reconciling, sessionId])
}
