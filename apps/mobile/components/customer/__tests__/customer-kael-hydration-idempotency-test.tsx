import { useRef } from 'react'
import { act, render, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'

import {
  clearPendingKaelChatDraft,
  readPendingKaelChatDraft,
  type PendingKaelChatDraft,
} from '@/lib/pending-kael-chat-draft'
import type { ServiceType } from '@nestscout/shared'
import { createCustomerKaelRequestGuard } from '../kael-chat/customer-kael-state-scope'
import { useCustomerKaelConversationState } from '../kael-chat/use-customer-kael-conversation-state'
import { useCustomerKaelSessionHydration } from '../kael-chat/use-customer-kael-session-hydration'

const mockKaelChatCreate = jest.fn()
const mockKaelChatGet = jest.fn()
const mockCleanupKaelChatMediaRefs = jest.fn()
const mockUploadKaelChatMediaDrafts = jest.fn()
const mockCaseSessionReady = jest.fn()

jest.mock('@/lib/media-upload', () => ({
  cleanupKaelChatMediaRefs: (...args: unknown[]) => mockCleanupKaelChatMediaRefs(...args),
  uploadKaelChatMediaDrafts: (...args: unknown[]) => mockUploadKaelChatMediaDrafts(...args),
}))

jest.mock('@/lib/services', () => ({
  kaelChatService: {
    create: (...args: unknown[]) => mockKaelChatCreate(...args),
    get: (...args: unknown[]) => mockKaelChatGet(...args),
  },
}))

const requestGuard = createCustomerKaelRequestGuard('customer-a:normal')
const pendingDraft: PendingKaelChatDraft = {
  addressLabel: 'Building A, District 1',
  districtLabel: 'District 1',
  message: 'The outlet sparks when an appliance is connected.',
  photoDrafts: [{
    fileName: 'outlet.jpg',
    fileSizeBytes: 1_024,
    mimeType: 'image/jpeg',
    type: 'image',
    uri: 'file:///outlet.jpg',
  }],
  problemChips: ['sparking outlet'],
  profileId: 'electric_diagnose',
  scheduleMode: 'now',
  scheduledAt: '2026-07-15T05:00:00.000Z',
  serviceType: 'electrical',
}

function HydrationProbe({
  accessToken,
  draft = pendingDraft,
  onCaseSessionReady = mockCaseSessionReady,
}: {
  accessToken: string
  draft?: PendingKaelChatDraft
  onCaseSessionReady?: (caseSessionId: string) => Promise<unknown>
}) {
  const conversation = useCustomerKaelConversationState({
    initialLoading: false,
    initialMode: 'normal',
    pendingDraft: draft,
  })
  const selectedServiceRef = useRef<ServiceType | null>(null)
  useCustomerKaelSessionHydration({
    conversation,
    kaelRequestGuard: requestGuard,
    language: 'en',
    onCaseSessionReady,
    pendingDraftLocalizedMessage: draft.message,
    pendingDraftOwnerId: 'customer-a',
    routeJobId: null,
    routeMode: 'normal',
    routeSessionId: null,
    selectedServiceRef,
    sessionAccessToken: accessToken,
  })
  return (
    <>
      <Text testID="hydration-state">{conversation.error ?? 'pending'}</Text>
      <Text testID="hydration-chat-state">{conversation.chat?.session.id ?? 'none'}</Text>
    </>
  )
}

function successfulKaelCreate(mediaRefs: string[]) {
  return {
    data: {
      session: {
        id: 'session-a',
        service_type: 'electrical',
      },
      turns: [{ media_refs: mediaRefs }],
    },
    success: true,
  }
}

describe('customer Kael pending-draft hydration idempotency', () => {
  beforeEach(async () => {
    await clearPendingKaelChatDraft('customer-a')
    jest.clearAllMocks()
    requestGuard.setScope(`customer-a:normal:${Math.random()}`)
    mockUploadKaelChatMediaDrafts.mockResolvedValue({
      evidenceItems: [{ kind: 'photo', model_eligible: true, ref: 'supabase://kael-chat-media/customer-a/outlet.jpg' }],
      mediaRefs: ['supabase://kael-chat-media/customer-a/outlet.jpg'],
      success: true,
      urls: [],
    })
    mockCleanupKaelChatMediaRefs.mockResolvedValue(true)
    mockCaseSessionReady.mockResolvedValue({ session: { id: 'session-a' }, turns: [] })
    mockKaelChatCreate.mockResolvedValue({
      code: 'NETWORK_ERROR',
      error: 'ambiguous failure',
      status: 0,
      success: false,
    })
  })

  it('reuses the upload and request key when hydration retries after an ambiguous create failure', async () => {
    const screen = render(<HydrationProbe accessToken="token-a" />)
    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('hydration-state').props.children).not.toBe('pending'))
    const storedDraft = await readPendingKaelChatDraft('customer-a')
    expect(storedDraft?.clientRequestId).toBe(mockKaelChatCreate.mock.calls[0][0].client_request_id)
    expect(storedDraft?.clientRequestFingerprint).toEqual(expect.any(String))

    screen.rerender(<HydrationProbe accessToken="token-b" />)
    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledTimes(2))

    expect(mockUploadKaelChatMediaDrafts).toHaveBeenCalledTimes(1)
    expect(mockCleanupKaelChatMediaRefs).not.toHaveBeenCalled()
    expect(mockKaelChatCreate.mock.calls[1][0]).toEqual(mockKaelChatCreate.mock.calls[0][0])
  })

  it('recovers the persisted key after remount and revokes only the superseded upload', async () => {
    const firstScreen = render(<HydrationProbe accessToken="token-a" />)
    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(firstScreen.getByTestId('hydration-state').props.children).not.toBe('pending'))
    const firstKey = mockKaelChatCreate.mock.calls[0][0].client_request_id
    const storedDraft = await readPendingKaelChatDraft('customer-a')
    expect(storedDraft).not.toBeNull()
    firstScreen.unmount()

    mockUploadKaelChatMediaDrafts.mockResolvedValue({
      evidenceItems: [{ kind: 'photo', model_eligible: true, ref: 'supabase://kael-chat-media/customer-a/retry-outlet.jpg' }],
      mediaRefs: ['supabase://kael-chat-media/customer-a/retry-outlet.jpg'],
      success: true,
      urls: [],
    })
    mockKaelChatCreate.mockResolvedValue(successfulKaelCreate([
      'supabase://kael-chat-media/customer-a/outlet.jpg',
    ]))

    render(<HydrationProbe accessToken="token-b" draft={storedDraft!} />)
    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledTimes(2))

    expect(mockKaelChatCreate.mock.calls[1][0].client_request_id).toBe(firstKey)
    expect(mockCleanupKaelChatMediaRefs).toHaveBeenCalledTimes(1)
    expect(mockCleanupKaelChatMediaRefs).toHaveBeenCalledWith([
      'supabase://kael-chat-media/customer-a/retry-outlet.jpg',
    ])
  })

  it('activates the authoritative Case Work catalog session created from Basic Intake', async () => {
    mockKaelChatCreate.mockResolvedValue(successfulKaelCreate([
      'supabase://kael-chat-media/customer-a/outlet.jpg',
    ]))
    mockCaseSessionReady.mockResolvedValue({ session: { id: 'session-a' }, turns: [] })

    render(<HydrationProbe accessToken="token-a" />)

    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockCaseSessionReady).toHaveBeenCalledWith('session-a'))
  })

  it('reveals the created Agentic session without waiting for a catalog refresh round trip', async () => {
    mockKaelChatCreate.mockResolvedValue(successfulKaelCreate([
      'supabase://kael-chat-media/customer-a/outlet.jpg',
    ]))
    let resolveCatalog!: (value: unknown) => void
    mockCaseSessionReady.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCatalog = resolve
    }))

    const screen = render(<HydrationProbe accessToken="token-a" />)

    await waitFor(() => expect(mockCaseSessionReady).toHaveBeenCalledWith('session-a'))
    await waitFor(() => expect(screen.getByTestId('hydration-chat-state').props.children).toBe('session-a'))

    await act(async () => {
      resolveCatalog({ session: { id: 'session-a' }, turns: [] })
    })
  })

  it('keeps one pending create alive across an effect restart and hydrates the newest subscriber', async () => {
    let resolveCreate!: (value: ReturnType<typeof successfulKaelCreate>) => void
    mockKaelChatCreate.mockImplementation(() => new Promise((resolve) => {
      if (!resolveCreate) resolveCreate = resolve
    }))
    const firstReady = jest.fn().mockResolvedValue({ session: { id: 'session-a' }, turns: [] })
    const latestReady = jest.fn().mockResolvedValue({ session: { id: 'session-a' }, turns: [] })
    const screen = render(
      <HydrationProbe accessToken="token-a" onCaseSessionReady={firstReady} />,
    )
    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledTimes(1))

    await act(async () => {
      screen.rerender(
        <HydrationProbe accessToken="token-a" onCaseSessionReady={latestReady} />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockKaelChatCreate).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveCreate(successfulKaelCreate([
        'supabase://kael-chat-media/customer-a/outlet.jpg',
      ]))
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByTestId('hydration-chat-state').props.children).toBe('session-a'))
    expect(latestReady).toHaveBeenCalledWith('session-a')
    expect(firstReady).not.toHaveBeenCalled()
  })
})
