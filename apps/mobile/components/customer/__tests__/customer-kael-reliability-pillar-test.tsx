import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, renderHook, waitFor } from '@testing-library/react-native'

import {
  clearCustomerKaelEphemeralState,
  clearCustomerKaelPreAgenticState,
  clearCustomerKaelSessionEphemeralState,
  flushCustomerKaelComposerStorage,
  readCustomerKaelAssistantTurns,
  readCustomerKaelComposerState,
  readCustomerKaelMediaDrafts,
  readCustomerKaelPreAgenticState,
  rememberCustomerKaelAssistantTurns,
  rememberCustomerKaelComposerState,
  rememberCustomerKaelMediaDrafts,
  rememberCustomerKaelPreAgenticState,
  customerKaelSessionEphemeralScopeKey,
} from '../kael-chat/customer-kael-ephemeral-state'
import { useCustomerKaelChatUiState } from '../kael-chat/use-customer-kael-chat-ui-state'
import { useCustomerKaelConversationState } from '../kael-chat/use-customer-kael-conversation-state'
import { customerKaelPreAgenticOwnerKey } from '../kael-chat/customer-kael-state-scope'

export const PILLAR = {
  id: 'P104-kael-ephemeral-state-scope',
  invariant: 'unsent Kael composer state and provisional Case exchanges are isolated by the exact account and route scope, survive a mode remount or storage-backed relaunch, and clear when a new session is explicitly started',
  authority: ['governance/RULES.md #7 honest state', 'governance/protocols/frontend-test.md G3 and G4'],
  target: 'apps/mobile/components/customer/kael-chat/customer-kael-ephemeral-state.ts',
  layer: 'integration',
  siblings: ['P75-transaction-critical-route-coverage', 'P76-production-ui-language-normality'],
  mutation: 'drop the scope key, return shared mutable arrays, skip durable composer recovery, or skip explicit clearing; the cross-mode/session assertions turn red',
} as const satisfies PillarManifest

describe('Kael ephemeral state boundary', () => {
  const caseScope = 'account-a:case:blank'
  const normalScope = 'account-a:normal:blank'

  afterEach(async () => {
    clearCustomerKaelEphemeralState(caseScope)
    clearCustomerKaelEphemeralState(normalScope)
    await flushCustomerKaelComposerStorage()
    await AsyncStorage.clear()
    jest.clearAllMocks()
  })

  it('keeps composer and provisional transcript state scoped across mode remounts', () => {
    const turns = [{
      id: 'case-customer-1',
      role: 'customer' as const,
      surface: 'customer_case' as const,
      text_content: 'Điều hòa phòng ngủ không lạnh',
    }]
    rememberCustomerKaelComposerState(caseScope, {
      draft: 'Tôi ở quận 3 và máy không lạnh',
      voiceTranscript: 'Tôi ở quận 3',
    })
    rememberCustomerKaelAssistantTurns(caseScope, turns)

    withPillarContext(PILLAR, () => {
      expect(readCustomerKaelComposerState(caseScope)).toEqual({
        draft: 'Tôi ở quận 3 và máy không lạnh',
        voiceTranscript: 'Tôi ở quận 3',
      })
      expect(readCustomerKaelAssistantTurns(caseScope)).toEqual(turns)
      expect(readCustomerKaelComposerState(normalScope)).toEqual({ draft: '', voiceTranscript: '' })
      expect(readCustomerKaelAssistantTurns(normalScope)).toEqual([])
    }, 'a normal-mode remount must not inherit the Case draft or transcript')
  })

  it('returns defensive transcript copies and clears the exact scope for a new session', () => {
    const turns = [{
      id: 'case-kael-1',
      role: 'kael' as const,
      surface: 'customer_case' as const,
      text_content: 'Bạn cho mình biết quận nhé.',
    }]
    rememberCustomerKaelAssistantTurns(caseScope, turns)
    const firstRead = readCustomerKaelAssistantTurns(caseScope)
    firstRead.push({ ...turns[0], id: 'mutated-outside-cache' })

    withPillarContext(PILLAR, () => {
      expect(readCustomerKaelAssistantTurns(caseScope)).toEqual(turns)
    }, 'presentation code must not mutate the cached provisional transcript')

    clearCustomerKaelEphemeralState(caseScope)
    expect(readCustomerKaelComposerState(caseScope)).toEqual({ draft: '', voiceTranscript: '' })
    expect(readCustomerKaelAssistantTurns(caseScope)).toEqual([])
  })

  it('hydrates both owning hooks from the scope cache after a route remount', () => {
    rememberCustomerKaelComposerState(caseScope, {
      draft: 'Tôi ở quận 3',
      voiceTranscript: '',
    })
    rememberCustomerKaelAssistantTurns(caseScope, [{
      id: 'case-customer-2',
      role: 'customer',
      surface: 'customer_case',
      text_content: 'Máy lạnh không lạnh',
    }])

    const ui = renderHook(() => useCustomerKaelChatUiState(caseScope))
    const conversation = renderHook(() => useCustomerKaelConversationState({
      initialLoading: false,
      initialMode: 'case',
      pendingDraft: null,
      stateScopeKey: caseScope,
    }))

    withPillarContext(PILLAR, () => {
      expect(ui.result.current.draft).toBe('Tôi ở quận 3')
      expect(conversation.result.current.assistantTurns).toHaveLength(1)
      expect(conversation.result.current.assistantTurns[0]?.text_content).toBe('Máy lạnh không lạnh')
    }, 'the route key remount must rehydrate the owning state hooks')

    conversation.unmount()
    ui.unmount()
  })

  it('rotates the pre-Agentic owner when the catalog creates a new session', () => {
    const blankOwner = customerKaelPreAgenticOwnerKey(caseScope, null)
    const createdOwner = customerKaelPreAgenticOwnerKey(caseScope, 'session-created')
    withPillarContext(PILLAR, () => {
      expect(createdOwner).not.toBe(blankOwner)
    }, 'a new backend session must not inherit the previous clarification handshake')
  })

  it('restores an unsent composer draft after the in-memory cache is gone', async () => {
    const persistentScope = 'account-persistent:normal:blank'
    const first = renderHook(() => useCustomerKaelChatUiState(persistentScope))

    act(() => {
      first.result.current.setDraft('reload-check')
    })
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled())
    first.unmount()
    clearCustomerKaelEphemeralState(persistentScope)

    const second = renderHook(() => useCustomerKaelChatUiState(persistentScope))

    await waitFor(() => {
      withPillarContext(PILLAR, () => {
        expect(second.result.current.draft).toBe('reload-check')
      }, 'an app relaunch must restore the unsent draft for the same account and session scope')
    })

    act(() => {
      second.result.current.setDraft('')
    })
    await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalled())

    const otherAccount = renderHook(() => useCustomerKaelChatUiState('account-other:normal:blank'))
    expect(otherAccount.result.current.draft).toBe('')

    otherAccount.unmount()
    second.unmount()
    clearCustomerKaelEphemeralState(persistentScope)
  })

  it('keeps the composer usable when durable storage is unavailable', async () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage unavailable'))
    const ui = renderHook(() => useCustomerKaelChatUiState('account-storage-error:normal:blank'))

    act(() => {
      ui.result.current.setDraft('still-editable')
    })
    await waitFor(() => {
      withPillarContext(PILLAR, () => {
        expect(ui.result.current.draft).toBe('still-editable')
      }, 'a storage failure must not block the in-memory composer state')
    })

    ui.unmount()
    clearCustomerKaelEphemeralState('account-storage-error:normal:blank')
  })

  it('keeps draft, media, transcript, and confirmation state isolated per session', () => {
    const sessionAScope = customerKaelSessionEphemeralScopeKey(caseScope, 'session-a')
    const sessionBScope = customerKaelSessionEphemeralScopeKey(caseScope, 'session-b')
    const sessionAOwner = customerKaelPreAgenticOwnerKey(caseScope, 'session-a')
    const mediaDraft = { uri: 'file:///kael-photo.jpg', type: 'image' as const }
    const pendingConfirmation = {
      message: 'Điều hòa phòng ngủ không lạnh ở Quận 3',
      ownerKey: sessionAOwner,
      stage: 'confirmation' as const,
    }

    rememberCustomerKaelComposerState(sessionAScope, {
      draft: 'Tôi còn muốn bổ sung vị trí lắp đặt',
      voiceTranscript: '',
    })
    rememberCustomerKaelAssistantTurns(sessionAScope, [{
      id: 'session-a-local-turn',
      role: 'kael',
      surface: 'customer_case',
      text_content: 'Mình đã ghi nhận thông tin ban đầu.',
    }])
    rememberCustomerKaelMediaDrafts(sessionAScope, [mediaDraft])
    rememberCustomerKaelPreAgenticState(sessionAOwner, pendingConfirmation)

    withPillarContext(PILLAR, () => {
      expect(readCustomerKaelComposerState(sessionBScope)).toEqual({ draft: '', voiceTranscript: '' })
      expect(readCustomerKaelAssistantTurns(sessionBScope)).toEqual([])
      expect(readCustomerKaelMediaDrafts(sessionBScope)).toEqual([])
      expect(readCustomerKaelPreAgenticState(customerKaelPreAgenticOwnerKey(caseScope, 'session-b'))).toBeNull()
      expect(readCustomerKaelMediaDrafts(sessionAScope)).toEqual([mediaDraft])
      expect(readCustomerKaelPreAgenticState(sessionAOwner)).toEqual(pendingConfirmation)
    }, 'switching sessions must not bleed provisional state into the target session')

    clearCustomerKaelSessionEphemeralState(caseScope, 'session-a')
    clearCustomerKaelPreAgenticState(sessionAOwner)
    expect(readCustomerKaelComposerState(sessionAScope)).toEqual({ draft: '', voiceTranscript: '' })
    expect(readCustomerKaelAssistantTurns(sessionAScope)).toEqual([])
    expect(readCustomerKaelMediaDrafts(sessionAScope)).toEqual([])
    expect(readCustomerKaelPreAgenticState(sessionAOwner)).toBeNull()
  })
})
