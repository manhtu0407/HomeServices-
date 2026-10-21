import { TextDecoder as NodeTextDecoder } from 'node:util'
import { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { useRef } from 'react'
import { act, fireEvent, render, renderHook } from '@testing-library/react-native'
import { kaelEmergencyGuidanceCopy, type ServiceType } from '@nestscout/shared'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

jest.mock('@/lib/runtime-config', () => ({ mobileRuntimeConfig: {
  apiBaseUrl: 'https://api.test/functions/v1/mobile-api', supabasePublishableKey: 'test-public',
} }))
jest.mock('@/lib/services', () => {
  const actual = jest.requireActual('@/lib/services')
  const stream = jest.requireActual('@/lib/kael-stream') as typeof import('@/lib/kael-stream')
  return { ...actual, kaelChatStreamService: { ...actual.kaelChatStreamService,
    sendTurn: (...args: Parameters<typeof stream.streamKaelChatTurn>) => stream.streamKaelChatTurn(args[0], args[1], args[2], args[3], mockFetch),
  } }
})
jest.mock('@/lib/sentry-runtime', () => ({ Sentry: { addBreadcrumb: jest.fn() } }))
jest.mock('@/lib/supabase', () => ({ supabase: null }))
jest.mock('@/lib/release-client-platform', () => ({ releaseClientPlatform: () => 'ios' }))
jest.mock('@/lib/media-upload', () => ({ cleanupKaelChatMediaRefs: jest.fn(async () => true) }))

import { resetConnectivityForTests } from '@/lib/connectivity'
import { CustomerKaelEmergencyAccess } from '../kael-chat/customer-kael-emergency-access'
import { getCustomerThemeTokens } from '../customer-theme'
import type { KaelChatResponse } from '@/lib/api-types'
import { streamKaelChatTurn } from '@/lib/kael-stream'
import { api } from '@/lib/api'
import { useCustomerKaelChatUiState } from '../kael-chat/use-customer-kael-chat-ui-state'
import { useCustomerKaelConversationState } from '../kael-chat/use-customer-kael-conversation-state'
import { useCustomerKaelMessageActions } from '../kael-chat/use-customer-kael-message-actions'
import { useCustomerKaelRequestGuard } from '../kael-chat/customer-kael-state-scope'

export const PILLAR = {
  id: 'P418-kael-emergency-mobile-delivery',
  invariant: 'trusted emergency guidance survives rejected requests into Customer Kael without creating a chat, duplicating turns, or changing business state, and offline guidance stays reachable',
  authority: ['governance/RULES.md #8 (no fake success)', 'governance/RULES.md #3 (validated output only)'],
  target: 'apps/mobile/components/customer/kael-chat/use-customer-kael-message-actions.ts',
  layer: 'integration',
  siblings: ['P341-kael-stream-accepts-governed-next-actions'],
  mutation: 'discard emergency from the API failure envelope: rejected-create guidance fails to reach the real conversation reducer',
} as const satisfies PillarManifest

const mockFetch = jest.fn()
const emergency = { version: 'v1', route: 'fire' }
const initialFetch = global.fetch
const initialDecoder = globalThis.TextDecoder
const initialReadable = globalThis.ReadableStream
beforeAll(() => {
  Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, writable: true, value: NodeTextDecoder })
  Object.defineProperty(globalThis, 'ReadableStream', { configurable: true, writable: true, value: NodeReadableStream })
})
afterAll(() => {
  global.fetch = initialFetch
  Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, writable: true, value: initialDecoder })
  Object.defineProperty(globalThis, 'ReadableStream', { configurable: true, writable: true, value: initialReadable })
})

function rejectedResponse(status: number, payload: unknown) {
  return { ok: false, status, body: null, headers: { get: () => null }, text: async () => JSON.stringify(payload) }
}

function useRequestHarness(mode: 'normal' | 'case' = 'normal') {
  const chatUi = useCustomerKaelChatUiState()
  const conversation = useCustomerKaelConversationState({ initialLoading: false, initialMode: mode, pendingDraft: null })
  const guard = useCustomerKaelRequestGuard('customer-emergency:normal')
  const serviceRef = useRef<ServiceType | null>('electrical')
  const actions = useCustomerKaelMessageActions({
    chatUi, conversation, deal: null, hasSharedJobIncident: false,
    jobIncidentThread: {} as Parameters<typeof useCustomerKaelMessageActions>[0]['jobIncidentThread'],
    kaelRequestGuard: guard, language: 'vi', mode,
    processController: { startBackendProcessLines: jest.fn(), stopProcessLines: jest.fn() } as unknown as Parameters<typeof useCustomerKaelMessageActions>[0]['processController'],
    requestOwnerKey: 'customer-emergency:normal', selectedService: 'electrical', selectedServiceRef: serviceRef,
  })
  return { chatUi, conversation, actions }
}

describe(PILLAR.id, () => {
  beforeEach(() => { mockFetch.mockReset(); global.fetch = mockFetch })
  afterEach(() => resetConnectivityForTests())
  afterAll(() => { global.fetch = initialFetch })

  it('preserves the rejected JSON response and the recognized emergency field', async () => {
    mockFetch.mockResolvedValue(rejectedResponse(422, { error: 'internal exception hidden by UI', code: 'INVALID_MEDIA_REF', emergency }))
    const response = await api.post('/kael/chat', { message: 'smoke' })
    withPillarContext(PILLAR, () => expect(response).toMatchObject({ success: false, status: 422, code: 'INVALID_MEDIA_REF', emergency }), 'safety metadata must accompany the original rejection')
  })

  it('delivers a rejected create into the actual request action and conversation reducer', async () => {
    mockFetch.mockResolvedValue(rejectedResponse(422, { error: 'untrusted internal text', code: 'INVALID_MEDIA_REF', emergency }))
    const { result } = renderHook(useRequestHarness)
    await act(async () => { await result.current.actions.sendMessage('Ổ cắm có khói') })
    withPillarContext(PILLAR, () => {
      expect(result.current.conversation).toMatchObject({ emergencyGuidance: emergency, chat: null, loading: false, turns: [] })
      expect(result.current.conversation.error).not.toContain('untrusted')
    }, 'failed create remains failed while the trusted guidance remains visible')
  })
})

const chatBefore = { session: { id: 'case-delivery-test', status: 'active', total_turns: 0 }, turns: [] } as unknown as KaelChatResponse
function streamResponse(frame: string) {
  let sent = false
  return { ok: true, status: 200, headers: { get: () => 'text/event-stream' }, body: { getReader: () => ({
    read: async () => sent ? { done: true } : (sent = true, { done: false, value: new Uint8Array(Buffer.from(frame)) }),
    cancel: jest.fn(async () => undefined), releaseLock: jest.fn(),
  }) } }
}

describe(PILLAR.id + ': actual error state and local access', () => {
  it('preserves a JSON failure received by the real stream transport', async () => {
    mockFetch.mockResolvedValue(rejectedResponse(400, { code: 'VALIDATION', error: 'private', emergency }))
    const result = await streamKaelChatTurn('case-delivery-test', { message: 'smoke', photo_urls: [] }, {}, undefined, mockFetch)
    expect(result).toEqual({ success: false, status: 400, code: 'VALIDATION', error: 'private', emergency })
  })
  beforeEach(() => { mockFetch.mockReset(); global.fetch = mockFetch })
  afterEach(() => resetConnectivityForTests())
  it.each([400, 409, 500])('renders trusted guidance after HTTP %s without changing the existing Case', async status => {
    mockFetch.mockResolvedValue(rejectedResponse(status, { code: 'DB_ERROR', error: 'private server exception', emergency }))
    const { result } = renderHook(() => useRequestHarness('case'))
    act(() => result.current.conversation.setChat(chatBefore))
    await act(async () => { await result.current.actions.sendMessage('Ổ cắm có khói') })
    expect(result.current.conversation.chat).toEqual(chatBefore)
    expect(result.current.conversation.turns).toEqual([])
    expect(result.current.conversation.emergencyGuidance).toEqual(emergency)
    expect(result.current.conversation.error).not.toContain('private')
    const ui = render(<CustomerKaelEmergencyAccess guidance={result.current.conversation.emergencyGuidance} language="vi" tokens={getCustomerThemeTokens('light')} />)
    expect(ui.getByTestId('kael-emergency-guidance')).toBeTruthy()
    expect(ui.getByText(kaelEmergencyGuidanceCopy('fire', 'vi'))).toBeTruthy()
  })
  it('keeps SSE errors as failures and repeated reports occupy one guidance slot', async () => {
    mockFetch.mockImplementation(async () => streamResponse('event: error\ndata: ' + JSON.stringify({ code: 'MEDIA_INTENT_INVALID', message: 'private exception', emergency }) + '\n\n'))
    const { result } = renderHook(() => useRequestHarness('case'))
    act(() => result.current.conversation.setChat(chatBefore))
    for (let i = 0; i < 2; i++) await act(async () => { await result.current.actions.sendMessage('Ổ cắm có khói') })
    expect(result.current.conversation.emergencyGuidance).toEqual(emergency)
    expect(result.current.conversation.chat).toEqual(chatBefore)
    expect(result.current.conversation.turns).toEqual([])
    expect(result.current.conversation.error).not.toContain('private')
    expect(result.current.conversation.streamingReply).toBeNull()
  })
  it.each([undefined, { version: 'v1', route: 'fire', text: 'untrusted' }, { version: 'v9', route: 'fire' }])('missing or hostile guidance never becomes a safety message: %j', async value => {
    mockFetch.mockResolvedValue(rejectedResponse(422, { code: 'VALIDATION', error: 'private', emergency: value }))
    const { result } = renderHook(useRequestHarness)
    await act(async () => { await result.current.actions.sendMessage('Ổ cắm có khói') })
    expect(result.current.conversation.emergencyGuidance).toBeNull()
    expect(result.current.conversation.chat).toBeNull()
    expect(result.current.conversation.turns).toEqual([])
  })
  it.each(['vi', 'en'] as const)('offline manual access uses static %s copy without any request', language => {
    mockFetch.mockRejectedValue(new TypeError('offline'))
    const ui = render(<CustomerKaelEmergencyAccess language={language} tokens={getCustomerThemeTokens('dark')} />)
    fireEvent.press(ui.getByTestId('kael-emergency-access'))
    expect(ui.getByText(kaelEmergencyGuidanceCopy('uncertain', language))).toBeTruthy()
    expect(ui.getByText(kaelEmergencyGuidanceCopy('fire', language))).toBeTruthy()
    expect(ui.getByText(kaelEmergencyGuidanceCopy('medical', language))).toBeTruthy()
    expect(ui.getByText(kaelEmergencyGuidanceCopy('police', language))).toBeTruthy()
    expect(mockFetch).not.toHaveBeenCalled()
    fireEvent.press(ui.getByTestId('kael-emergency-close'))
    expect(ui.queryByText(kaelEmergencyGuidanceCopy('fire', language))).toBeNull()
  })
  it('clears guidance when the conversation mode changes', () => {
    const { result } = renderHook(useRequestHarness)
    act(() => result.current.conversation.setEmergencyGuidance(emergency))
    act(() => result.current.conversation.switchMode('case'))
    expect(result.current.conversation.emergencyGuidance).toBeNull()
  })
  it('an interrupted request keeps the Case unchanged and never renders transport exception text', async () => {
    mockFetch.mockImplementation(async (_url: string, options: { method?: string }) => {
      if (options.method === 'GET') return rejectedResponse(422, { code: 'VALIDATION' })
      throw new TypeError('private transcript and address from transport')
    })
    const { result } = renderHook(() => useRequestHarness('case'))
    act(() => result.current.conversation.setChat(chatBefore))
    await act(async () => { await result.current.actions.sendMessage('Ổ cắm có khói') })
    expect(result.current.conversation.chat).toEqual(chatBefore)
    expect(result.current.conversation.loading).toBe(false)
    expect(result.current.conversation.emergencyGuidance).toBeNull()
    expect(result.current.conversation.error).not.toContain('private')
    expect(result.current.conversation.turns).toEqual([])
  })
  it('a connection timeout ends loading without inventing guidance or a successful turn', async () => {
    jest.useFakeTimers()
    try {
      mockFetch.mockImplementation((_url: string, options: { method?: string }) => options.method === 'GET'
        ? Promise.resolve(rejectedResponse(422, { code: 'VALIDATION' })) : new Promise(() => undefined))
      const { result } = renderHook(() => useRequestHarness('case'))
      act(() => result.current.conversation.setChat(chatBefore))
      await act(async () => {
        const sending = result.current.actions.sendMessage('Ổ cắm có khói')
        await jest.advanceTimersByTimeAsync(20_001)
        await sending
      })
      expect(result.current.conversation.chat).toEqual(chatBefore)
      expect(result.current.conversation.loading).toBe(false)
      expect(result.current.conversation.emergencyGuidance).toBeNull()
      expect(result.current.conversation.turns).toEqual([])
      expect(result.current.conversation.error).toBeTruthy()
    } finally { jest.useRealTimers() }
  })

})
