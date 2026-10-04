import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  NormalChatSuggestionRole,
  NormalChatSuggestionsRequest,
  NormalChatSuggestionsResponse,
} from '@nestscout/shared'
import type { AppLanguage } from './app-language'

export type NormalChatSuggestionsPayload = NormalChatSuggestionsResponse

export type NormalChatSuggestionScope = {
  accountId: string
  role: NormalChatSuggestionRole
  sessionId: string
  sourceTurnId: string
  language: AppLanguage
}

type CacheEntry = { payload: NormalChatSuggestionsPayload; touched: number }
type InFlightEntry = {
  controller: AbortController
  consumers: number
  promise: Promise<NormalChatSuggestionsPayload>
}

const MAX_CACHE_ENTRIES = 20
const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, InFlightEntry>()

function trimCache() {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = [...cache.entries()].sort((left, right) => left[1].touched - right[1].touched)[0]
    if (!oldest) return
    cache.delete(oldest[0])
  }
}

export function normalChatSuggestionCacheKey(scope: NormalChatSuggestionScope) {
  return JSON.stringify([
    scope.accountId,
    scope.role,
    scope.sessionId,
    scope.sourceTurnId,
    scope.language,
  ])
}

export function acquireNormalChatSuggestions(
  scope: NormalChatSuggestionScope,
  fetcher: (input: NormalChatSuggestionsRequest, signal: AbortSignal) => Promise<NormalChatSuggestionsPayload>,
) {
  const key = normalChatSuggestionCacheKey(scope)
  const cached = cache.get(key)
  if (cached) {
    cached.touched = Date.now()
    return { promise: Promise.resolve(cached.payload), release: () => {} }
  }

  let flight = inFlight.get(key)
  if (!flight) {
    const controller = new AbortController()
    const request = { language: scope.language, source_turn_id: scope.sourceTurnId }
    const promise = fetcher(request, controller.signal).then((payload) => {
      if (payload.status === 'ready' && !controller.signal.aborted) {
        cache.set(key, { payload, touched: Date.now() })
        trimCache()
      }
      return payload
    }).finally(() => {
      if (inFlight.get(key)?.promise === promise) inFlight.delete(key)
    })
    flight = { controller, consumers: 0, promise }
    inFlight.set(key, flight)
  }

  flight.consumers += 1
  let released = false
  return {
    promise: flight.promise,
    release: () => {
      if (released) return
      released = true
      const current = inFlight.get(key)
      if (!current) return
      current.consumers -= 1
      if (current.consumers <= 0) {
        current.controller.abort()
        inFlight.delete(key)
      }
    },
  }
}

export function clearNormalChatSuggestionCache(scope: { accountId?: string; sessionId?: string } = {}) {
  const matches = (key: string) => {
    const [accountId, , sessionId] = JSON.parse(key) as [string, string, string]
    return (!scope.accountId || accountId === scope.accountId) && (!scope.sessionId || sessionId === scope.sessionId)
  }
  for (const key of cache.keys()) {
    if (matches(key)) cache.delete(key)
  }
  for (const [key, flight] of inFlight) {
    if (!matches(key)) continue
    flight.controller.abort()
    inFlight.delete(key)
  }
}

export function useNormalChatSuggestions({
  accountId,
  enabled,
  fetcher,
  language,
  role,
  sessionId,
  sourceTurnId,
}: {
  accountId: string | null | undefined
  enabled: boolean
  fetcher: (input: NormalChatSuggestionsRequest, signal: AbortSignal) => Promise<NormalChatSuggestionsPayload>
  language: AppLanguage
  role: NormalChatSuggestionRole
  sessionId: string | null | undefined
  sourceTurnId: string | null | undefined
}) {
  const [state, setState] = useState<{ key: string; payload: NormalChatSuggestionsPayload } | null>(null)
  const previousAccountId = useRef(accountId)
  const scope = useMemo(() => accountId && sessionId && sourceTurnId
    ? { accountId, language, role, sessionId, sourceTurnId }
    : null, [accountId, language, role, sessionId, sourceTurnId])
  const key = scope ? normalChatSuggestionCacheKey(scope) : null

  useEffect(() => {
    const previous = previousAccountId.current
    if (previous && previous !== accountId) clearNormalChatSuggestionCache({ accountId: previous })
    previousAccountId.current = accountId
  }, [accountId])

  useEffect(() => {
    if (!enabled || !scope || !key) {
      setState(null)
      return
    }
    let stale = false
    const request = acquireNormalChatSuggestions(scope, fetcher)
    void request.promise.then((payload) => {
      if (!stale) setState({ key, payload })
    }).catch(() => {
      if (!stale) setState({
        key,
        payload: {
          status: 'unavailable',
          session_id: scope.sessionId,
          source_turn_id: scope.sourceTurnId,
          language: scope.language,
          suggestions: [],
        },
      })
    })
    return () => {
      stale = true
      request.release()
    }
  }, [enabled, fetcher, key, scope])

  return state?.key === key ? state.payload : null
}
