import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

import { sendCustomerNormalTurn } from '../kael-chat/customer-kael-normal-turn-send'

export const PILLAR = {
  id: 'P254-customer-kael-uncertain-turn-media',
  invariant: 'A normal-chat photo is revoked only when the turn is known not to have committed; a lost response, a cancellation, or an unexpected throw after the send started keeps the upload, because the server may already store its ref',
  authority: ['governance/RULES.md #8 (no silent loss of committed evidence)', 'AGENTS.md durable evidence handling'],
  target: 'apps/mobile/components/customer/kael-chat/customer-kael-normal-turn-send.ts',
  layer: 'unit',
  siblings: ['P204-customer-kael-request-abort', 'P247-kael-chat-media-retention-read'],
  mutation: 'revoke uploaded refs on every null turn result again; the uncertain-outcome and thrown-send cases turn red',
} as const satisfies PillarManifest

const mockCleanup = jest.fn(async () => undefined)
const mockUpload = jest.fn(async () => ({ success: true as const, mediaRefs: ['supabase://kael-chat-media/c/kael-chat/model_vision/photo.jpg'] }))

jest.mock('@/lib/media-upload', () => ({
  cleanupKaelChatMediaRefs: (...args: unknown[]) => mockCleanup(...(args as [])),
  localizeMediaUploadFailure: () => 'upload failed',
  uploadKaelChatMediaDrafts: (...args: unknown[]) => mockUpload(...(args as [])),
}))

type SendTurn = (message: string, options: { onOutcomeUncertain?: () => void }) => Promise<unknown>

function run(sendConversationTurn: SendTurn, abort = false) {
  const controller = new AbortController()
  if (abort) controller.abort()
  const setError = jest.fn()
  const noop = () => undefined
  const promise = sendCustomerNormalTurn({
    abortSignal: controller.signal,
    beginReasoningReceipt: noop,
    clearComposer: noop,
    commitComposer: noop,
    completeLegacyStreamingReply: noop,
    conversations: { sendConversationTurn, sessionsError: null } as never,
    failReasoningReceipt: noop,
    getActiveReasoningReceiptId: () => null,
    getReceivedReasoningTerminal: () => true,
    getReceivedResponseTerminal: () => true,
    hasComposerMedia: true,
    isRequestCurrent: () => true,
    language: 'vi',
    mediaDrafts: [{ type: 'image', uri: 'file:///photo.jpg' } as LocalMediaUploadDraft],
    message: 'Phân tích ảnh này',
    onReasoning: noop,
    onResponseCommitted: noop,
    onResponseDelta: noop,
    onResponseEvent: noop,
    onRetainStreamingReply: noop,
    resetReasoningReceipt: noop,
    restoreComposer: noop,
    setError,
    setLoading: noop,
    setMediaDrafts: noop,
    setPendingNormalImageUris: noop,
    setPendingNormalMessage: noop,
    setUploadingMedia: noop,
    stopProcessLines: noop,
  })
  return { promise, setError }
}

beforeEach(() => {
  mockCleanup.mockClear()
  mockUpload.mockClear()
})

it('keeps the upload when the turn outcome is uncertain', async () => {
  const { promise } = run(async (_message, options) => {
    options.onOutcomeUncertain?.()
    return null
  })
  await promise
  withPillarContext(PILLAR, () => {
    expect(mockCleanup).not.toHaveBeenCalled()
  }, 'response and recovery both lost')
})

it('keeps the upload when the send throws after it started', async () => {
  const { promise } = run(async () => {
    throw new Error('connection reset')
  })
  await promise
  withPillarContext(PILLAR, () => {
    expect(mockCleanup).not.toHaveBeenCalled()
  }, 'thrown send')
})

it('revokes the upload when the server definitely refused the turn', async () => {
  const { promise } = run(async () => null)
  await promise
  withPillarContext(PILLAR, () => {
    expect(mockCleanup).toHaveBeenCalledWith(['supabase://kael-chat-media/c/kael-chat/model_vision/photo.jpg'])
  }, 'definite non-commit')
})
