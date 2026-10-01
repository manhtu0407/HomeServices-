import { act, renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P249-worker-kael-release-client-guard',
  invariant: 'A Worker on a client that mobile-api refuses (web) gets the compatibility message before any Kael session create or send request leaves the device; released iOS/Android clients still create and send',
  authority: ['supabase/functions/mobile-api/_shared/http/request-runtime.ts enforceStage1ClientCompatibility', 'governance/RULES.md #8 (honest unavailable state, no silent failure)'],
  target: 'apps/mobile/components/worker/chat/use-kael-orb-chat.ts',
  layer: 'integration',
  siblings: ['P248-worker-presence-release-client-only', 'P250-kael-unreleased-client-copy'],
  mutation: 'remove the release-client guard from startNewSession or the send action; the web case calls create or streamTurn and turns red',
} as const satisfies PillarManifest


const mockWorkerKaelChatCreate = jest.fn()
const mockWorkerKaelChatArchive = jest.fn()
const mockWorkerKaelChatGet = jest.fn()
const mockWorkerKaelChatList = jest.fn()
const mockWorkerKaelChatPin = jest.fn()
const mockWorkerKaelChatRename = jest.fn()
const mockWorkerKaelChatSendTurn = jest.fn()
const mockWorkerKaelChatStreamTurn = jest.fn()
const mockReadSessionCatalog = jest.fn()
const mockWriteSessionCatalog = jest.fn()
const mockRequestMediaPermission = jest.fn()
const mockLaunchImageLibrary = jest.fn()
let mockWorkerId = 'worker-a'
let mockWorkerAuthProvider: string | undefined

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    session: {
      user: {
        app_metadata: mockWorkerAuthProvider ? { provider: mockWorkerAuthProvider } : {},
        id: mockWorkerId,
      },
    },
  }),
}))

jest.mock('@/lib/services', () => ({
  workerKaelChatService: {
    archive: (...args: unknown[]) => mockWorkerKaelChatArchive(...args),
    create: (...args: unknown[]) => mockWorkerKaelChatCreate(...args),
    get: (...args: unknown[]) => mockWorkerKaelChatGet(...args),
    list: (...args: unknown[]) => mockWorkerKaelChatList(...args),
    setPinned: (...args: unknown[]) => mockWorkerKaelChatPin(...args),
    rename: (...args: unknown[]) => mockWorkerKaelChatRename(...args),
    sendTurn: (...args: unknown[]) => mockWorkerKaelChatSendTurn(...args),
    streamTurn: (...args: unknown[]) => mockWorkerKaelChatStreamTurn(...args),
  },
}))

jest.mock('../chat/session-catalog-cache', () => ({
  readWorkerKaelSessionCatalog: (...args: unknown[]) => mockReadSessionCatalog(...args),
  writeWorkerKaelSessionCatalog: (...args: unknown[]) => mockWriteSessionCatalog(...args),
}))

jest.mock('@/lib/media-upload', () => ({
  uploadJobMediaDrafts: jest.fn(),
}))

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestMediaPermission(...args),
}))

import { useWorkerV5KaelOrbChat } from '../chat/use-kael-orb-chat'

function workerNormalChatSuccess(sessionId = 'session-general', turns: unknown[] = []) {
  return {
    data: {
      session: {
        closed_at: null,
        id: sessionId,
        job_id: null,
        mode: 'normal' as const,
        pinned_at: null,
        progress: null,
        started_at: '2026-07-23T00:00:00.000Z',
        status: 'active' as const,
        title: null,
        total_turns: turns.length > 0 ? 1 : 0,
        worker_id: mockWorkerId,
      },
      turns,
    },
    status: 200,
    success: true as const,
  }
}

const originalPlatform = Platform.OS
const COMPATIBILITY_COPY = 'Phiên bản NestScout hiện tại chưa tương thích với dịch vụ. Hãy cập nhật hoặc mở bản ứng dụng đã phát hành để tiếp tục.'

describe('Worker Kael on a client mobile-api refuses', () => {
  beforeEach(() => {
    mockWorkerId = 'worker-a'
    mockWorkerAuthProvider = undefined
    mockWorkerKaelChatCreate.mockReset().mockResolvedValue(workerNormalChatSuccess())
    mockWorkerKaelChatList.mockReset().mockReturnValue(new Promise(() => undefined))
    mockWorkerKaelChatStreamTurn.mockReset()
    mockWorkerKaelChatSendTurn.mockReset()
    mockReadSessionCatalog.mockReset().mockResolvedValue(null)
    mockWriteSessionCatalog.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
  })

  it('names the compatibility block instead of requesting a new session from web', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })
    const { result } = renderHook(() => useWorkerV5KaelOrbChat(null, 'vi', 'normal', true))
    let created = true
    await act(async () => {
      created = await result.current.startNewSession()
    })
    withPillarContext(PILLAR, () => {
      expect(created).toBe(false)
      expect(mockWorkerKaelChatCreate).not.toHaveBeenCalled()
      expect(result.current.sessionsError).toBe(COMPATIBILITY_COPY)
    }, 'web session create')
  })

  it('names the compatibility block instead of streaming a turn from web', async () => {
    const { result } = renderHook(() => useWorkerV5KaelOrbChat(null, 'vi', 'normal', true))
    await act(async () => {
      expect(await result.current.startNewSession()).toBe(true)
    })
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })
    let sent = true
    await act(async () => {
      sent = await result.current.send('Xin chào Kael')
    })
    withPillarContext(PILLAR, () => {
      expect(sent).toBe(false)
      expect(mockWorkerKaelChatStreamTurn).not.toHaveBeenCalled()
      expect(mockWorkerKaelChatSendTurn).not.toHaveBeenCalled()
      expect(result.current.error).toBe(COMPATIBILITY_COPY)
      expect(result.current.liveTurns).toEqual([])
    }, 'web send')
  })

  it('still creates and streams from a released iOS client', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' })
    mockWorkerKaelChatStreamTurn.mockResolvedValue({ code: 'CLIENT_UPDATE_REQUIRED', error: 'x', status: 426, success: false })
    const { result } = renderHook(() => useWorkerV5KaelOrbChat(null, 'vi', 'normal', true))
    await act(async () => {
      expect(await result.current.startNewSession()).toBe(true)
    })
    await act(async () => {
      await result.current.send('Xin chào Kael')
    })
    withPillarContext(PILLAR, () => {
      expect(mockWorkerKaelChatCreate).toHaveBeenCalledTimes(1)
      expect(mockWorkerKaelChatStreamTurn).toHaveBeenCalledTimes(1)
    }, 'ios is not blocked')
  })
})
