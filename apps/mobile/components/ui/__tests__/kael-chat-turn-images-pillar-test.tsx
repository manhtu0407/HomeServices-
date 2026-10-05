import { render, renderHook, screen } from '@testing-library/react-native'
import type { ReactElement } from 'react'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { CustomerThemeTokens } from '@/components/customer/customer-theme'
import { sendCustomerNormalTurn } from '@/components/customer/kael-chat/customer-kael-normal-turn-send'
import { useKaelChatTranscript } from '@/components/customer/kael-chat/use-kael-chat-transcript'
import { workerV5KaelOrbTurnsFromResponse } from '@/components/worker/chat/kael-orb-chat-model'
import type { WorkerKaelChatTurn } from '@/lib/api-types'
import { kaelChatTurnImages, rememberKaelChatLocalMedia } from '@/lib/kael-chat-local-media'
import { initialKaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

import { KaelChatTurnImages } from '../kael-chat-turn-images'

export const PILLAR = {
  id: 'P313-kael-chat-turn-images',
  invariant:
    'a photo sent to Kael leaves the composer with its message and stays visible in the session: in the pending bubble, in the saved turn from this device or from the server preview link, and as a labelled tile when it is no longer kept or cannot load; a send that fails hands the photo back to the composer',
  authority: [
    'governance/RULES.md #8 (no silent loss: a missing photo is labelled, a failed send keeps it)',
    'governance/design.md (chat thumbnails follow the composer thumbnail formula)',
  ],
  target: 'apps/mobile/components/ui/kael-chat-turn-images.tsx',
  layer: 'ui-visual',
  siblings: ['P312-kael-chat-media-preview-links', 'P254-customer-kael-uncertain-turn-media'],
  mutation:
    'drop the image list from the customer turn bubble, or stop handing the media drafts back when the upload fails — the saved-turn or failed-send case turns red',
} as const satisfies PillarManifest

const mockUpload = jest.fn()

jest.mock('@/lib/media-upload', () => ({
  cleanupKaelChatMediaRefs: jest.fn(async () => undefined),
  localizeMediaUploadFailure: () => 'upload failed',
  uploadKaelChatMediaDrafts: (...args: unknown[]) => mockUpload(...args),
}))

const OWNER = 'e2460000-0000-4000-8000-000000000002'
const ref = (name: string) => `supabase://kael-chat-media/${OWNER}/kael-chat/model_vision/${name}`
const tokens = { border: '#ddd', muted: '#666', primary: '#0a0', primaryText: '#fff', raised: '#fff', service: '#f5f5f5', text: '#111' } as CustomerThemeTokens
const receipt = initialKaelReasoningReceiptState

function transcriptInput(overrides: Partial<Parameters<typeof useKaelChatTranscript>[0]>) {
  return {
    agenticEstimateNode: null,
    agenticVisibleTurns: [],
    analysisEvidenceNode: null,
    caseAssistantTurns: [],
    caseIntakeResponseNode: null,
    caseThreadNode: null,
    emptyHeroVisible: false,
    hydratingCase: false,
    language: 'vi' as const,
    missingCaseWorkDeal: false,
    mode: 'normal' as const,
    normalAssistantTurns: [],
    normalReasoningReceipt: receipt,
    onToggleNormalReasoningReceipt: () => undefined,
    pendingDraftMessage: '',
    pendingNormalImageUris: [],
    pendingNormalMessage: null,
    processLinesNode: null,
    reduceMotion: true,
    showNormalGreeting: false,
    showPendingDraftBubble: false,
    streamingReplyNode: null,
    streamingReplyTurnId: null,
    tokens,
    workerCandidateNode: null,
    ...overrides,
  } satisfies Parameters<typeof useKaelChatTranscript>[0]
}

function renderRows(input: Parameters<typeof useKaelChatTranscript>[0]) {
  const { result } = renderHook(() => useKaelChatTranscript(input))
  return render(<>{result.current.transcriptRows.map(({ key, node }) => <Row key={key} node={node} />)}</>)
}

function Row({ node }: { node: unknown }) {
  return node as ReactElement
}

describe('P313 Kael chat turn images', () => {
  beforeEach(() => mockUpload.mockReset())

  it('resolves each photo from this device first, then the preview link, and keeps expired apart from unavailable', () => {
    rememberKaelChatLocalMedia([ref('local.jpg')], ['file:///local.jpg'])
    const images = kaelChatTurnImages(
      [ref('local.jpg'), ref('kept.jpg'), ref('old.jpg'), ref('unknown.jpg')],
      [
        { ref: ref('kept.jpg'), status: 'available', url: 'https://storage.example.test/kept.jpg' },
        { ref: ref('old.jpg'), status: 'expired', url: null },
      ],
    )
    withPillarContext(PILLAR, () => expect(images).toEqual([
      { key: ref('local.jpg'), status: 'available', uri: 'file:///local.jpg' },
      { key: ref('kept.jpg'), status: 'available', uri: 'https://storage.example.test/kept.jpg' },
      { key: ref('old.jpg'), status: 'expired', uri: null },
      { key: ref('unknown.jpg'), status: 'unavailable', uri: null },
    ]))
  })

  it('shows the photos of a saved customer turn above its text with a gap, and a labelled tile for one no longer kept', () => {
    renderRows(transcriptInput({
      normalAssistantTurns: [{
        id: 'turn-1',
        images: [
          { key: 'a', status: 'available', uri: 'https://storage.example.test/a.jpg' },
          { key: 'b', status: 'expired', uri: null },
        ],
        role: 'customer',
        text_content: 'Ảnh này là ảnh gì?',
      }],
    }))
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-v21-kael-turn-images-0')).toBeOnTheScreen()
      expect(screen.getByTestId('customer-v21-kael-turn-images-1-expired')).toHaveTextContent('Ảnh đã hết hạn lưu')
      expect(screen.getByText('Ảnh này là ảnh gì?')).toBeOnTheScreen()
      expect(screen.getByTestId('customer-v21-kael-turn-group')).toHaveStyle({ gap: 8 })
    })
  })

  it('keeps Kael\'s thinking card in its own row below the pending message, so the two never touch', () => {
    const { result } = renderHook(() => useKaelChatTranscript(transcriptInput({ pendingNormalMessage: 'Ảnh này là ảnh gì?' })))
    withPillarContext(PILLAR, () => expect(result.current.transcriptRows.map(({ key }) => key)).toEqual([
      'normal-pending-message',
      'normal-pending-reasoning',
    ]))
  })

  it('shows a photo-only message in the pending bubble while Kael answers', () => {
    renderRows(transcriptInput({ pendingNormalImageUris: ['file:///photo.jpg'], pendingNormalMessage: '' }))
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-v21-kael-reasoning-pending-message-images-0')).toBeOnTheScreen()
      expect(screen.queryByTestId('customer-v21-kael-reasoning-pending-message')).toBeNull()
    })
  })

  it('labels a photo that fails to load instead of leaving a blank gap', () => {
    render(<KaelChatTurnImages colors={{ border: '#ddd', muted: '#666', surface: '#f5f5f5' }} images={[{ key: 'x', status: 'unavailable', uri: null }]} language="en" testID="images" />)
    withPillarContext(PILLAR, () => expect(screen.getByTestId('images-0-unavailable')).toHaveTextContent('Photo could not load'))
  })

  it('moves the photos out of the composer at send and hands them back when the upload fails', async () => {
    mockUpload.mockResolvedValue({ success: false, code: 'UPLOAD_FAILED', error: 'upload failed' })
    const drafts = [{ type: 'image', uri: 'file:///photo.jpg' } as LocalMediaUploadDraft]
    const order: string[] = []
    const setMediaDrafts = jest.fn((value: LocalMediaUploadDraft[]) => { order.push(value.length ? `restore:${value.length}` : 'clear') })
    const setPendingNormalImageUris = jest.fn((uris: string[]) => { order.push(`pending:${uris.join(',')}`) })
    const noop = () => undefined
    await sendCustomerNormalTurn({
      abortSignal: new AbortController().signal,
      beginReasoningReceipt: noop,
      clearComposer: noop,
      commitComposer: noop,
      completeLegacyStreamingReply: noop,
      conversations: { sendConversationTurn: jest.fn(), sessionsError: null } as never,
      failReasoningReceipt: noop,
      getActiveReasoningReceiptId: () => null,
      getReceivedReasoningTerminal: () => true,
      getReceivedResponseTerminal: () => true,
      hasComposerMedia: true,
      isRequestCurrent: () => true,
      language: 'vi',
      mediaDrafts: drafts,
      message: 'Ảnh này là ảnh gì?',
      onReasoning: noop,
      onResponseCommitted: noop,
      onResponseDelta: noop,
      onResponseEvent: noop,
      onRetainStreamingReply: noop,
      resetReasoningReceipt: noop,
      restoreComposer: noop,
      setError: noop,
      setLoading: noop,
      setMediaDrafts,
      setPendingNormalImageUris,
      setPendingNormalMessage: noop,
      setUploadingMedia: noop,
      stopProcessLines: noop,
    })
    withPillarContext(PILLAR, () => {
      expect(order).toEqual(['pending:file:///photo.jpg', 'clear', 'restore:1'])
      expect(setMediaDrafts).toHaveBeenLastCalledWith(drafts)
    })
  })

  it('keeps a photo-only worker turn and its general-chat photos when history loads', () => {
    const turns = [{
      content_type: 'photo_attached',
      created_at: '2026-10-05T00:00:00.000Z',
      id: 'w1',
      media_previews: [{ ref: ref('w.jpg'), status: 'available', url: 'https://storage.example.test/w.jpg' }],
      media_refs: [ref('w.jpg'), 'supabase://job-media/job-1/kael_reference/site.jpg'],
      role: 'worker',
      safety_notes: [],
      session_id: 's1',
      text_content: null,
      turn_index: 1,
    }] as unknown as WorkerKaelChatTurn[]
    withPillarContext(PILLAR, () => expect(workerV5KaelOrbTurnsFromResponse(turns)).toEqual([{
      id: 'w1',
      images: [{ key: ref('w.jpg'), status: 'available', uri: 'https://storage.example.test/w.jpg' }],
      role: 'worker',
      text: '',
    }]))
  })
})
