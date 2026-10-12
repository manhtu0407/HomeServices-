import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import type { KaelChatTurn } from '@nestscout/shared'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { KaelNextActionChips } from '../kael-chat/kael-next-action-chips'
import { latestKaelNextActions, latestKaelReferencePrice } from '../kael-chat/kael-next-actions-display-model'
import { ReferencePriceNote } from '../kael-chat/reference-price-note'
import { useCustomerKaelNextActions } from '../kael-chat/use-customer-kael-next-actions'

export const PILLAR = {
  id: 'P369-kael-work-next-action-chips',
  invariant:
    'the Work thread shows the server’s next steps only under the newest Kael turn, skips kinds it cannot act on, sends a chosen step back with its intent as a visible turn, only fills the composer for a detail, and shows a market reference without any booking control',
  authority: [
    'governance/RULES.md #7 (the client never crosses a confirmation gate; it sends back what the server offered)',
    'governance/RULES.md #4 (a price shown to the customer carries the disclaimer)',
    'governance/protocols/frontend-test.md G2 (state coverage)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/use-customer-kael-next-actions.ts',
  layer: 'ui-visual',
  siblings: ['P364-kael-evidence-gap-options', 'P368-kael-next-actions-contract'],
  mutation:
    'drop the role check in latestKaelNextActions — stale chips under a customer turn render and the newest-turn case turns red; send provide_detail as a turn — the composer case turns red; drop turn_intent from sendTurn — the intent case turns red',
} as const satisfies PillarManifest

const mockSendTurn = jest.fn()

jest.mock('@/lib/services', () => ({
  kaelChatService: { sendTurn: (...args: unknown[]) => mockSendTurn(...args) },
}))

const tokens = {
  borderStrong: '#ccc', muted: '#555', primary: '#087D72', raised: '#fff', text: '#111',
} as never

function turn(overrides: Partial<KaelChatTurn>): KaelChatTurn {
  return {
    id: 'turn-1', session_id: 'session-1', turn_index: 1, role: 'kael', content_type: 'analysis',
    text_content: 'Kael chưa thể đưa ra giá có căn cứ.', media_refs: [], estimate: null,
    created_at: '2026-10-12T02:10:00.000Z', ...overrides,
  }
}

const GAP_ACTIONS: KaelChatTurn['next_actions'] = [
  { id: 'request_worker_quote', kind: 'request_worker_quote', label: 'Gửi thợ báo giá từ ảnh', message: 'Gửi yêu cầu để thợ phù hợp xem ảnh và báo giá giúp mình.', turn_intent: 'request_worker_quote' },
  { id: 'provide_item_dimensions_weight_and_quantity', kind: 'provide_detail', label: 'Kích thước & nặng', message: 'Kệ gỗ 30x20cm, nặng khoảng 1kg.', slot: 'item_dimensions_weight_and_quantity' },
  { id: 'review_offer', kind: 'review_offer', label: 'Xem lại đề xuất' },
]

function hookInput() {
  const conversation = {
    chat: { session: { id: 'session-1', service_type: 'handyman' } },
    loading: false,
    setChat: jest.fn(),
    setError: jest.fn(),
    setLoading: jest.fn(),
    setTurns: jest.fn(),
  }
  return {
    chatUi: { setDraft: jest.fn() },
    conversation,
    evidenceActions: { pickComposerMedia: jest.fn(async () => undefined) },
    kaelRequestGuard: { begin: () => 'token', isCurrent: () => true },
    language: 'vi' as const,
  }
}

describe(`${PILLAR.id}`, () => {
  beforeEach(() => mockSendTurn.mockReset())

  it('reads next steps from the newest Kael turn only and skips kinds it cannot act on', () => {
    const offered = latestKaelNextActions([turn({ next_actions: GAP_ACTIONS })])
    withPillarContext(PILLAR, () => {
      expect(offered?.actions.map((action) => action.kind)).toEqual(['request_worker_quote', 'provide_detail'])
    }, 'review_offer has no handler on this screen')
    const answered = latestKaelNextActions([
      turn({ next_actions: GAP_ACTIONS }),
      turn({ id: 'turn-2', role: 'customer', turn_index: 2, content_type: 'text', text_content: 'Ok', next_actions: GAP_ACTIONS }),
    ])
    withPillarContext(PILLAR, () => expect(answered).toBeNull(), 'chips under an answered turn are stale')
    expect(latestKaelNextActions([turn({ next_actions: [{ id: 'x', kind: 'confirm_offer', label: 'Xác nhận' }] as never })])).toBeNull()
  })

  it('renders each chip and reports the chosen one', () => {
    const onPress = jest.fn()
    const actions = latestKaelNextActions([turn({ next_actions: GAP_ACTIONS })])!.actions
    render(<KaelNextActionChips actions={actions} busy={false} language="vi" onPress={onPress} sendingActionId={null} tokens={tokens} />)
    fireEvent.press(screen.getByTestId('customer-v21-kael-next-action-request_worker_quote'))
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ kind: 'request_worker_quote' }))
    expect(screen.getByText('Kích thước & nặng')).toBeTruthy()
  })

  it('sends a step as a visible turn with its intent, and only fills the composer for a detail', async () => {
    mockSendTurn.mockResolvedValue({ success: true, data: { session: { id: 'session-1' }, turns: [] } })
    const input = hookInput()
    const { result } = renderHook(() => useCustomerKaelNextActions(input as never))
    await act(async () => {
      await result.current.runNextAction(GAP_ACTIONS![1]!)
    })
    withPillarContext(PILLAR, () => {
      expect(input.chatUi.setDraft).toHaveBeenCalledWith('Kệ gỗ 30x20cm, nặng khoảng 1kg.')
      expect(mockSendTurn).not.toHaveBeenCalled()
    }, 'a detail is the customer’s own message to send')
    await act(async () => {
      await result.current.runNextAction(GAP_ACTIONS![0]!)
    })
    withPillarContext(PILLAR, () => {
      expect(mockSendTurn).toHaveBeenCalledWith('session-1', {
        language: 'vi',
        message: 'Gửi yêu cầu để thợ phù hợp xem ảnh và báo giá giúp mình.',
        photo_urls: [],
        turn_intent: 'request_worker_quote',
      })
      expect(input.conversation.setTurns).toHaveBeenCalled()
    }, 'the server re-checks the intent it receives')
  })

  it('shows a market reference with the disclaimer and no booking control', () => {
    const reference = latestKaelReferencePrice([turn({
      reference_price: { price_min: 150_000, price_max: 300_000, unit: 'per_item', source_count: 2, sources: [{ domain: 'thosuachua.vn', url: 'https://thosuachua.vn/bang-gia' }] },
    })])
    expect(reference).not.toBeNull()
    render(<ReferencePriceNote language="vi" reference={reference!} tokens={tokens} />)
    expect(screen.getByText(/150\.000–300\.000 đ\/món/)).toBeTruthy()
    expect(screen.getByText(/Đây không phải báo giá/)).toBeTruthy()
    expect(screen.getByText(/Đây là ước tính do Kael tính theo dữ liệu hiện có/)).toBeTruthy()
    withPillarContext(PILLAR, () => {
      expect(screen.queryAllByRole('button')).toHaveLength(0)
    }, 'a reference cannot be booked or confirmed')
    withPillarContext(PILLAR, () => expect(latestKaelReferencePrice([
      turn({ reference_price: { price_min: 1, price_max: 2, unit: 'per_item', source_count: 2, sources: [] } }),
      turn({ id: 'turn-2', turn_index: 2, estimate: { price_min: 1 } as never }),
    ])).toBeNull(), 'a validated estimate replaces the reference')
  })
})
