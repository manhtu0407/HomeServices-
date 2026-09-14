import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { CustomerKaelMode } from '../ui/types'

type CustomerKaelRequestChannel =
  | 'conversation'
  | 'confirmation-reconcile'
  | 'evidence'
  | 'message'
  | 'memory-preference'
  | 'media-picker'

type CustomerKaelRequestToken = {
  channel: CustomerKaelRequestChannel
  epoch: number
  generation: number
}

export type CustomerKaelRequestGuard = {
  begin: (channel: CustomerKaelRequestChannel) => CustomerKaelRequestToken
  cancel: (token: CustomerKaelRequestToken) => void
  isCurrent: (token: CustomerKaelRequestToken) => boolean
  setScope: (scope: string) => void
}

export function customerKaelStateScopeKey(input: {
  accountId: string | null
  caseId: string | null
  handoffId?: string | null
  mode: CustomerKaelMode
  sessionId: string | null
}) {
  return JSON.stringify([
    input.accountId ?? '',
    input.mode,
    input.caseId ?? '',
    input.sessionId ?? '',
    input.handoffId ?? '',
  ])
}

export function customerKaelPreAgenticOwnerKey(requestOwnerKey: string, activeSessionId: string | null) {
  return `${requestOwnerKey}:${activeSessionId ?? 'blank'}`
}

export function customerKaelModeStateScopeKey(stateScopeKey: string, mode: CustomerKaelMode) {
  try {
    const parsed = JSON.parse(stateScopeKey)
    if (Array.isArray(parsed) && parsed.length === 5) {
      parsed[1] = mode
      return JSON.stringify(parsed)
    }
  } catch {
    // Keep a deterministic fallback for test or legacy owners that are not JSON scopes.
  }
  return stateScopeKey
}

export function createCustomerKaelRequestGuard(initialScope: string): CustomerKaelRequestGuard {
  let epoch = 0
  let scope = initialScope
  const generations = new Map<CustomerKaelRequestChannel, number>()

  const isCurrent = (token: CustomerKaelRequestToken) =>
    token.epoch === epoch && generations.get(token.channel) === token.generation

  return {
    begin(channel) {
      const generation = (generations.get(channel) ?? 0) + 1
      generations.set(channel, generation)
      return { channel, epoch, generation }
    },
    cancel(token) {
      if (!isCurrent(token)) return
      generations.set(token.channel, token.generation + 1)
    },
    isCurrent,
    setScope(nextScope) {
      if (scope === nextScope) return
      scope = nextScope
      epoch += 1
      generations.clear()
    },
  }
}

export function useCustomerKaelRequestGuard(scope: string) {
  const [guard] = useState(() => createCustomerKaelRequestGuard(scope))
  const latestScopeRef = useRef(scope)

  useLayoutEffect(() => {
    latestScopeRef.current = scope
    guard.setScope(scope)
  }, [guard, scope])

  useEffect(() => () => {
    guard.setScope(`${latestScopeRef.current}:unmounted`)
  }, [guard])

  return guard
}
