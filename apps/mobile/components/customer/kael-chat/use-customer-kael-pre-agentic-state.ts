import { useCallback, useEffect, useRef } from 'react'

import {
  readCustomerKaelPreAgenticState,
  rememberCustomerKaelPreAgenticState,
  type CustomerKaelPreAgenticState,
} from './customer-kael-ephemeral-state'
import { customerKaelPreAgenticOwnerKey } from './customer-kael-state-scope'

export function useCustomerKaelPreAgenticState(
  requestOwnerKey: string,
  activeSessionId: string | null,
) {
  const ownerKey = customerKaelPreAgenticOwnerKey(requestOwnerKey, activeSessionId)
  const pendingStateRef = useRef<CustomerKaelPreAgenticState | null>(
    readCustomerKaelPreAgenticState(ownerKey),
  )
  const previousOwnerKeyRef = useRef(ownerKey)

  useEffect(() => {
    const previousOwnerKey = previousOwnerKeyRef.current
    if (previousOwnerKey !== ownerKey) {
      rememberCustomerKaelPreAgenticState(previousOwnerKey, pendingStateRef.current)
      pendingStateRef.current = readCustomerKaelPreAgenticState(ownerKey)
      previousOwnerKeyRef.current = ownerKey
    }
    return () => {
      rememberCustomerKaelPreAgenticState(ownerKey, pendingStateRef.current)
    }
  }, [ownerKey])

  const getPendingState = useCallback(() => pendingStateRef.current, [])
  const setPendingState = useCallback((state: CustomerKaelPreAgenticState | null) => {
    pendingStateRef.current = state
    rememberCustomerKaelPreAgenticState(ownerKey, state)
  }, [ownerKey])

  return {
    getPendingState,
    ownerKey,
    setPendingState,
  }
}
