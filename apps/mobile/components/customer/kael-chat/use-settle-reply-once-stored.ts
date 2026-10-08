import { useCallback, useEffect, useRef } from 'react'

import type { CustomerKaelMode } from '../ui/types'

// A Work reply can finish revealing before its stored turn arrives with the request result.
// Removing the live reply then would blank the answer until the turn lands, so in Work handling
// the hand-over waits for the stored turn, or for the request to end without one.
export function useSettleReplyOnceStored({
  mode,
  requestInFlight,
  settle,
  storedTurns,
}: {
  mode: CustomerKaelMode
  requestInFlight: boolean
  settle: (responseId: string) => void
  storedTurns: readonly { id: string }[]
}) {
  const deferredRef = useRef<string | null>(null)

  const settleWhenStored = useCallback((responseId: string) => {
    const stored = storedTurns.some((turn) => turn.id === responseId)
    if (mode !== 'case' || !requestInFlight || stored) {
      deferredRef.current = null
      settle(responseId)
      return
    }
    deferredRef.current = responseId
  }, [mode, requestInFlight, settle, storedTurns])

  useEffect(() => {
    const responseId = deferredRef.current
    if (!responseId) return
    if (requestInFlight && !storedTurns.some((turn) => turn.id === responseId)) return
    deferredRef.current = null
    settle(responseId)
  }, [requestInFlight, settle, storedTurns])

  return settleWhenStored
}
