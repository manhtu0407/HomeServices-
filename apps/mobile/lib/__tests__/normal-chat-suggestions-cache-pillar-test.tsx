import { act, renderHook, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

const mockDelete = jest.fn()
const mockPost = jest.fn()

jest.mock('../api', () => ({
  api: {
    delete: (...args: unknown[]) => mockDelete(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

import {
  acquireNormalChatSuggestions,
  clearNormalChatSuggestionCache,
  normalChatSuggestionCacheKey,
  useNormalChatSuggestions,
  type NormalChatSuggestionScope,
  type NormalChatSuggestionsPayload,
} from '../normal-chat-suggestions'
import {
  customerNormalChatSessionMethods,
  workerNormalChatSessionMethods,
} from '../services/normal-chat-suggestions'

export const PILLAR = {
  id: 'P303-normal-chat-suggestions-cache',
  invariant: 'Normal-chat suggestion requests are coalesced and cached only within an account, role, session, source turn, and language; scope changes abort stale work, logout/archive clear cache, and draft-only rerenders do not call the endpoint again',
  authority: ['governance/Plan.md §3.4 and §4 Step 3', 'governance/protocols/frontend-test.md G3'],
  target: 'apps/mobile/lib/normal-chat-suggestions.ts',
  layer: 'integration',
  siblings: ['P302-normal-chat-suggestion-model', 'P300-normal-chat-suggestions'],
  mutation: 'remove a cache-key dimension, stop coalescing, retain data after account/session clear, allow a late prior-session response to win, or refetch on a draft-only rerender; at least one cache or scope assertion turns red',
} as const satisfies PillarManifest

const BASE_SCOPE: NormalChatSuggestionScope = {
  accountId: 'account-a',
  role: 'customer',
  sessionId: 'session-a',
  sourceTurnId: 'turn-a',
  language: 'vi',
}

function payload(scope: NormalChatSuggestionScope, text = 'Tôi muốn hỏi thêm.') : NormalChatSuggestionsPayload {
  return {
    status: 'ready',
    session_id: scope.sessionId,
    source_turn_id: scope.sourceTurnId,
    language: scope.language,
    suggestions: [{ id: `${scope.sessionId}-${scope.sourceTurnId}`, text }],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

describe('normal-chat suggestion cache and scope', () => {
  beforeEach(() => {
    clearNormalChatSuggestionCache()
    mockDelete.mockReset().mockResolvedValue({ success: true, data: {} })
    mockPost.mockReset().mockResolvedValue({ success: true, data: {} })
  })
  afterEach(() => clearNormalChatSuggestionCache())

  it('calls the dedicated suggestions route for each role with the source-turn request and signal', async () => {
    const input = { language: 'vi' as const, source_turn_id: BASE_SCOPE.sourceTurnId }
    const controller = new AbortController()

    await customerNormalChatSessionMethods.getSuggestions('conversation/a', input, controller.signal)
    await workerNormalChatSessionMethods.getSuggestions('session/b', input, controller.signal)

    expect(mockPost).toHaveBeenNthCalledWith(
      1,
      '/me/kael/conversations/conversation%2Fa/suggestions',
      input,
      { signal: controller.signal },
    )
    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      '/workers/me/kael/chat/session%2Fb/suggestions',
      input,
      { signal: controller.signal },
    )
  })

  it('clears only archived session cache after a successful archive for either role', async () => {
    const fetcher = jest.fn(async () => payload(BASE_SCOPE))
    const customerEntry = acquireNormalChatSuggestions(BASE_SCOPE, fetcher)
    await customerEntry.promise
    customerEntry.release()

    await customerNormalChatSessionMethods.archive(BASE_SCOPE.sessionId)
    const customerReload = acquireNormalChatSuggestions(BASE_SCOPE, fetcher)
    await customerReload.promise
    customerReload.release()
    expect(fetcher).toHaveBeenCalledTimes(2)

    const workerScope = { ...BASE_SCOPE, role: 'worker' as const, sessionId: 'worker-session' }
    const workerEntry = acquireNormalChatSuggestions(workerScope, fetcher)
    await workerEntry.promise
    workerEntry.release()
    await workerNormalChatSessionMethods.archive(workerScope.sessionId)
    const workerReload = acquireNormalChatSuggestions(workerScope, fetcher)
    await workerReload.promise
    workerReload.release()
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('retains a session cache when the archive request fails', async () => {
    const fetcher = jest.fn(async () => payload(BASE_SCOPE))
    const entry = acquireNormalChatSuggestions(BASE_SCOPE, fetcher)
    await entry.promise
    entry.release()
    mockDelete.mockResolvedValueOnce({ success: false, code: 'NETWORK_ERROR', error: '', status: 503 })

    await customerNormalChatSessionMethods.archive(BASE_SCOPE.sessionId)
    const cached = acquireNormalChatSuggestions(BASE_SCOPE, fetcher)
    await cached.promise
    cached.release()

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('coalesces simultaneous callers and serves the completed result from cache', async () => {
    const response = deferred<NormalChatSuggestionsPayload>()
    let signal: AbortSignal | undefined
    const fetcher = jest.fn((_input, requestSignal: AbortSignal) => {
      signal = requestSignal
      return response.promise
    })

    const first = acquireNormalChatSuggestions(BASE_SCOPE, fetcher)
    const second = acquireNormalChatSuggestions(BASE_SCOPE, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)

    first.release()
    expect(signal?.aborted).toBe(false)
    await act(async () => response.resolve(payload(BASE_SCOPE)))
    await expect(first.promise).resolves.toMatchObject({ status: 'ready' })
    await expect(second.promise).resolves.toMatchObject({ status: 'ready' })
    second.release()

    const cached = acquireNormalChatSuggestions(BASE_SCOPE, fetcher)
    await expect(cached.promise).resolves.toEqual(payload(BASE_SCOPE))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(signal?.aborted).toBe(false)
    cached.release()
  })

  it('isolates every scope key and clears only the archived account/session entries', async () => {
    const fetcher = jest.fn(async (input, _signal: AbortSignal) => payload({
      ...BASE_SCOPE,
      language: input.language,
      sourceTurnId: input.source_turn_id,
    }))
    const otherAccount = { ...BASE_SCOPE, accountId: 'account-b' }
    const otherRole = { ...BASE_SCOPE, role: 'worker' as const }
    const otherSession = { ...BASE_SCOPE, sessionId: 'session-b' }
    const otherTurn = { ...BASE_SCOPE, sourceTurnId: 'turn-b' }
    const otherLanguage = { ...BASE_SCOPE, language: 'en' as const }
    const scopes = [BASE_SCOPE, otherAccount, otherRole, otherSession, otherTurn, otherLanguage]

    for (const scope of scopes) {
      const request = acquireNormalChatSuggestions(scope, fetcher)
      await request.promise
      request.release()
    }
    expect(new Set(scopes.map(normalChatSuggestionCacheKey)).size).toBe(scopes.length)

    clearNormalChatSuggestionCache({ accountId: BASE_SCOPE.accountId, sessionId: BASE_SCOPE.sessionId })
    const cleared = acquireNormalChatSuggestions(BASE_SCOPE, fetcher)
    await cleared.promise
    cleared.release()
    const retained = acquireNormalChatSuggestions(otherAccount, fetcher)
    await retained.promise
    retained.release()
    expect(fetcher).toHaveBeenCalledTimes(scopes.length + 1)
  })

  it('does not refetch on draft-only rerenders and drops results from a previous session', async () => {
    const first = deferred<NormalChatSuggestionsPayload>()
    const second = deferred<NormalChatSuggestionsPayload>()
    const signals: AbortSignal[] = []
    const fetcher = jest.fn((input, signal: AbortSignal) => {
      signals.push(signal)
      return input.source_turn_id === 'turn-a' ? first.promise : second.promise
    })
    const { rerender, result } = renderHook(({ draft, sourceTurnId }: { draft: string; sourceTurnId: string }) => {
      void draft
      return useNormalChatSuggestions({
        accountId: BASE_SCOPE.accountId,
        enabled: true,
        fetcher,
        language: BASE_SCOPE.language,
        role: BASE_SCOPE.role,
        sessionId: BASE_SCOPE.sessionId,
        sourceTurnId,
      })
    }, { initialProps: { draft: '', sourceTurnId: 'turn-a' } })

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    rerender({ draft: 'Tôi đang gõ thêm chữ', sourceTurnId: 'turn-a' })
    expect(fetcher).toHaveBeenCalledTimes(1)

    rerender({ draft: 'Tôi đang gõ thêm chữ', sourceTurnId: 'turn-b' })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(signals[0]?.aborted).toBe(true)

    await act(async () => {
      first.resolve(payload(BASE_SCOPE, 'Câu cũ không được hiện.'))
      second.resolve(payload({ ...BASE_SCOPE, sourceTurnId: 'turn-b' }, 'Câu mới của phiên hiện tại.'))
    })
    await waitFor(() => expect(result.current?.source_turn_id).toBe('turn-b'))
    expect(result.current?.suggestions[0]?.text).toBe('Câu mới của phiên hiện tại.')
  })
})
