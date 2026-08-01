import { act, renderHook } from '@testing-library/react-native'

import {
  createCustomerKaelRequestGuard,
  customerKaelStateScopeKey,
  useCustomerKaelRequestGuard,
  type CustomerKaelRequestGuard,
} from '../kael-chat/customer-kael-state-scope'
import {
  createCustomerKaelConversationState,
  customerKaelConversationReducer,
} from '../kael-chat/use-customer-kael-conversation-state'
import type { KaelChatResponse } from '@/lib/api-types'
import type { PendingKaelChatDraft } from '@/lib/pending-kael-chat-draft'

describe('customer Kael async state scope', () => {
  it('rejects a response after the customer changes cases', () => {
    const firstScope = customerKaelStateScopeKey({
      accountId: 'customer-a',
      caseId: 'job-a',
      mode: 'case',
      sessionId: null,
    })
    const guard = createCustomerKaelRequestGuard(firstScope)
    const firstRequest = guard.begin('conversation')

    guard.setScope(customerKaelStateScopeKey({
      accountId: 'customer-a',
      caseId: 'job-b',
      mode: 'case',
      sessionId: null,
    }))

    expect(guard.isCurrent(firstRequest)).toBe(false)
  })

  it('rejects a response after the signed-in customer changes', () => {
    const firstScope = customerKaelStateScopeKey({
      accountId: 'customer-a',
      caseId: null,
      mode: 'normal',
      sessionId: 'chat-a',
    })
    const guard = createCustomerKaelRequestGuard(firstScope)
    const firstRequest = guard.begin('conversation')

    guard.setScope(customerKaelStateScopeKey({
      accountId: 'customer-b',
      caseId: null,
      mode: 'normal',
      sessionId: 'chat-a',
    }))

    expect(guard.isCurrent(firstRequest)).toBe(false)
  })

  it('lets only the newest request in one channel commit', () => {
    const scope = customerKaelStateScopeKey({
      accountId: 'customer-a',
      caseId: null,
      mode: 'normal',
      sessionId: null,
    })
    const guard = createCustomerKaelRequestGuard(scope)
    const olderRequest = guard.begin('conversation')
    const newerRequest = guard.begin('conversation')

    expect(guard.isCurrent(olderRequest)).toBe(false)
    expect(guard.isCurrent(newerRequest)).toBe(true)
  })

  it('does not let catalog hydration cancel a user message in the same scope', () => {
    const scope = customerKaelStateScopeKey({
      accountId: 'customer-a',
      caseId: null,
      mode: 'case',
      sessionId: null,
    })
    const guard = createCustomerKaelRequestGuard(scope)
    const messageRequest = guard.begin('message')
    const hydrationRequest = guard.begin('conversation')

    expect(guard.isCurrent(messageRequest)).toBe(true)
    expect(guard.isCurrent(hydrationRequest)).toBe(true)

    guard.setScope(`${scope}:next`)

    expect(guard.isCurrent(messageRequest)).toBe(false)
    expect(guard.isCurrent(hydrationRequest)).toBe(false)
  })

  it('does not revalidate an old response after returning to an earlier scope', () => {
    const firstScope = customerKaelStateScopeKey({
      accountId: 'customer-a',
      caseId: 'job-a',
      mode: 'case',
      sessionId: null,
    })
    const guard = createCustomerKaelRequestGuard(firstScope)
    const firstRequest = guard.begin('conversation')
    const secondScope = customerKaelStateScopeKey({
      accountId: 'customer-a',
      caseId: 'job-b',
      mode: 'case',
      sessionId: null,
    })

    guard.setScope(secondScope)
    guard.setScope(firstScope)

    expect(guard.isCurrent(firstRequest)).toBe(false)
  })

  it('gives every booking handoff its own conversation scope', () => {
    const firstScope = customerKaelStateScopeKey({
      accountId: 'customer-a',
      caseId: null,
      handoffId: 'draft-a',
      mode: 'case',
      sessionId: null,
    })
    const secondScope = customerKaelStateScopeKey({
      accountId: 'customer-a',
      caseId: null,
      handoffId: 'draft-b',
      mode: 'case',
      sessionId: null,
    })

    expect(secondScope).not.toBe(firstScope)
  })

  it('invalidates hook-owned requests after a committed scope change and unmount', () => {
    const { result, rerender, unmount } = renderHook<
      CustomerKaelRequestGuard,
      { scope: string }
    >(
      ({ scope }) => useCustomerKaelRequestGuard(scope),
      { initialProps: { scope: 'customer-a:job-a' } },
    )
    let firstRequest: ReturnType<typeof result.current.begin>
    act(() => {
      firstRequest = result.current.begin('conversation')
    })

    rerender({ scope: 'customer-a:job-b' })
    expect(result.current.isCurrent(firstRequest!)).toBe(false)

    let secondRequest: ReturnType<typeof result.current.begin>
    act(() => {
      secondRequest = result.current.begin('conversation')
    })
    expect(result.current.isCurrent(secondRequest!)).toBe(true)

    unmount()
    expect(result.current.isCurrent(secondRequest!)).toBe(false)
  })

  it('commits session hydration as one state transition and consumes only the owned draft', () => {
    const pendingDraft = {
      message: 'Ống nước đang rò',
      photoDrafts: [{ type: 'image', uri: 'file:///owned-photo.jpg' }],
      profileId: 'water_diagnose',
      scheduleMode: 'scheduled',
      scheduledAt: '2026-07-15T03:00:00.000Z',
      serviceType: 'plumbing',
    } as PendingKaelChatDraft
    const response = {
      turns: [{ id: 'turn-1', role: 'kael', text_content: 'Đã nhận' }],
    } as unknown as KaelChatResponse
    const initial = createCustomerKaelConversationState({
      initialLoading: true,
      initialMode: 'case',
      pendingDraft,
    })

    const hydrated = customerKaelConversationReducer(initial, {
      consumePendingDraft: true,
      response,
      type: 'resolve-hydration',
    })

    expect(hydrated).toMatchObject({
      chat: response,
      composerMediaDrafts: [],
      error: null,
      intakeDisplayMessage: pendingDraft.message,
      loading: false,
      pendingDraft: null,
      routeDraftEvidencePending: false,
      turns: response.turns,
    })
  })

  it('clears conversation-owned state atomically when switching modes', () => {
    const initial = {
      ...createCustomerKaelConversationState({
        initialLoading: false,
        initialMode: 'case',
        pendingDraft: null,
      }),
      assistantTurns: [{ id: 'local', role: 'kael' as const, surface: 'customer_case' as const, text_content: 'Old' }],
      error: 'Old error',
      loading: true,
      turns: [{ id: 'turn-1' } as never],
    }

    const switched = customerKaelConversationReducer(initial, { mode: 'normal', type: 'switch-mode' })

    expect(switched).toMatchObject({
      assistantTurns: [],
      chat: null,
      composerMediaDrafts: [],
      error: null,
      intakeDisplayMessage: null,
      loading: false,
      localMode: 'normal',
      turns: [],
    })
  })
})
