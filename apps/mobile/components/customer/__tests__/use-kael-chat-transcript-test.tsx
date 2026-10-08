import { renderHook } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { View } from 'react-native'

import type { KaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'

import type { CustomerThemeTokens } from '../customer-theme'
import {
  useKaelChatTranscript,
  type AgenticTurnView,
  type ChatTurnView,
} from '../kael-chat/use-kael-chat-transcript'

const tokens = {} as CustomerThemeTokens
const normalReasoningReceipt = { expanded: false, status: 'idle' } as KaelReasoningReceiptState

function makeInput(overrides: Partial<Parameters<typeof useKaelChatTranscript>[0]> = {}) {
  return {
    agenticEstimateNode: null,
    agenticVisibleTurns: [],
    analysisEvidenceNode: null,
    caseAssistantTurns: [],
    caseIntakeResponseNode: <View testID="customer-kael-intake-confirmation-fixture" />,
    caseThreadNode: null,
    emptyHeroVisible: false,
    hydratingCase: false,
    language: 'vi' as const,
    missingCaseWorkDeal: false,
    mode: 'case' as const,
    normalAssistantTurns: [],
    normalReasoningReceipt,
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

function testID(node: unknown) {
  return (node as ReactElement<{ testID?: string }>).props.testID
}

describe('Customer Kael transcript ordering', () => {
  describe('streamed Work reply', () => {
    const summary = 'Dịch vụ: Sửa điện\n\nMô tả: Ổ điện nhà tôi bị hư, theo đó là cầu dao điện bị hư hỏng luôn'
    const priorTurns: AgenticTurnView[] = [
      { id: 'customer-summary', role: 'customer', text_content: summary },
      { id: 'kael-question', role: 'kael', text_content: 'Cầu dao hiện đang bật/tắt/đã nhảy?' },
      { id: 'customer-answer', role: 'customer', text_content: 'Bật xong thì nó tự động tắt.' },
    ]
    const streaming = <View testID="customer-v21-kael-streaming-response" />

    it('keeps the earlier Kael question visible while the new reply streams ahead of its stored turn', () => {
      const { result } = renderHook(() => useKaelChatTranscript(makeInput({
        agenticVisibleTurns: priorTurns,
        caseIntakeResponseNode: null,
        streamingReplyNode: streaming,
        streamingReplyTurnId: 'kael-reply-new',
      })))

      expect(result.current.transcriptRows.map(({ key }) => key)).toEqual([
        'pinned-intake-summary',
        'turn-kael-question',
        'turn-customer-answer',
        'turn-kael-reply-new',
      ])
    })

    it('shows the streamed reply in place of its stored turn, above later cards, once that turn arrives', () => {
      const { result } = renderHook(() => useKaelChatTranscript(makeInput({
        agenticVisibleTurns: [...priorTurns, { id: 'kael-reply-new', role: 'kael', text_content: 'Kael đã nhận.' }],
        analysisEvidenceNode: <View testID="customer-v21-agentic-evidence-gate" />,
        caseIntakeResponseNode: null,
        streamingReplyNode: streaming,
        streamingReplyTurnId: 'kael-reply-new',
      })))

      const keys = result.current.transcriptRows.map(({ key }) => key)
      expect(keys).toEqual([
        'pinned-intake-summary',
        'turn-kael-question',
        'turn-customer-answer',
        'turn-kael-reply-new',
        'analysis-evidence',
      ])
      expect(testID(result.current.transcriptRows[3]?.node)).toBe('customer-v21-kael-streaming-response')
    })
  })

  it('pins the persisted intake summary before the confirmation response', () => {
    const summary = [
      'Dịch vụ: Vệ sinh nhà',
      'Vấn đề: Tổng vệ sinh',
      'Khu vực: S503 tòa nhà đã ẩn, Phường Long Thạnh Mỹ.',
      'Thời gian: T4 19/08 · Bắt đầu lúc 09:00',
      'Mô tả: Tôi muốn đặt lịch dọn dẹp cho ngày mai',
    ].join('\n\n')
    const agenticTurns: AgenticTurnView[] = [
      { id: 'customer-summary', role: 'customer', text_content: summary },
      { id: 'kael-follow-up', role: 'kael', text_content: 'Kael đang đối chiếu thông tin.' },
    ]

    const { result } = renderHook(() => useKaelChatTranscript(makeInput({ agenticVisibleTurns: agenticTurns })))

    expect(result.current.transcriptRows.map(({ key }) => key)).toEqual([
      'pinned-intake-summary',
      'case-intake-response',
      'turn-kael-follow-up',
    ])
    expect(testID(result.current.transcriptRows[0]?.node)).toBe('customer-v21-pinned-intake-summary')
    expect(testID(result.current.transcriptRows[1]?.node)).toBe('customer-kael-intake-confirmation-fixture')
  })

  it('pins a local Pre-Step summary before the confirmation response', () => {
    const caseAssistantTurns: ChatTurnView[] = [
      { id: 'local-summary', role: 'customer', text_content: 'Dịch vụ: Sửa nước\n\nMô tả: Vòi rửa bị rò.' },
      { id: 'local-kael', role: 'kael', text_content: 'Kael đang kiểm tra.' },
    ]

    const { result } = renderHook(() => useKaelChatTranscript(makeInput({ caseAssistantTurns })))

    expect(result.current.transcriptRows.map(({ key }) => key)).toEqual([
      'pinned-intake-summary',
      'case-intake-response',
      'turn-local-kael',
    ])
    expect(testID(result.current.transcriptRows[0]?.node)).toBe('customer-v21-pinned-intake-summary')
  })
})
