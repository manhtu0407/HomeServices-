import { fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { CustomerKaelConversationTurn } from '@/lib/api-types/customer'
import { bookingRouteForService, normalChatStartCaseActions } from '../kael-chat/normal-chat-quick-actions'
import { KaelChatComposer } from '../kael-chat/kael-chat-composer'

export const PILLAR = {
  id: 'P370-kael-chat-next-steps',
  invariant:
    'normal chat shows one-tap next steps above the composer: a start chip from the newest Kael reply opens booking with that service preselected, and suggestion chips send their text; an older reply’s start chip disappears once the customer writes again',
  authority: [
    'governance/RULES.md #7 (starting a service is the customer’s own booking flow, never automatic)',
    'governance/protocols/frontend-test.md G2 (state coverage)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/normal-chat-quick-actions.ts',
  layer: 'ui-visual',
  siblings: ['P373-kael-chat-service-intent', 'P369-kael-work-next-action-chips'],
  mutation:
    'drop the newest-turn check in normalChatStartCaseActions — the stale case turns red; map hvac to its production id in bookingRouteForService — the route case turns red',
} as const satisfies PillarManifest

jest.mock('@/components/ui/accessibility-motion', () => ({
  useGlassAccessibility: () => ({ reduceMotion: true, reduceTransparency: true }),
}))

function turn(overrides: Partial<CustomerKaelConversationTurn>): CustomerKaelConversationTurn {
  return {
    id: 'turn-2', conversation_id: 'conversation-1', turn_index: 2, role: 'kael',
    text_content: 'Máy lạnh chảy nước thường do ống thoát nước bị nghẹt.', created_at: '2026-10-12T03:00:00.000Z',
    ...overrides,
  }
}

const START = { id: 'start_case', kind: 'start_case' as const, label: 'Bắt đầu xử lý: Điều hòa', service_type: 'hvac' as const }

describe(`${PILLAR.id}`, () => {
  it('reads the start chip from the newest Kael reply only', () => {
    withPillarContext(PILLAR, () => {
      expect(normalChatStartCaseActions([turn({ next_actions: [START] })])).toEqual([START])
    }, 'fresh offer')
    withPillarContext(PILLAR, () => {
      expect(normalChatStartCaseActions([
        turn({ next_actions: [START] }),
        turn({ id: 'turn-3', role: 'customer', turn_index: 3, text_content: 'Cảm ơn', next_actions: [START] }),
      ])).toEqual([])
    }, 'the customer has written since the offer')
  })

  it('opens booking with the customer-facing service id', () => {
    withPillarContext(PILLAR, () => {
      expect(bookingRouteForService('hvac')).toBe('/(customer)/booking?service=hvac_basic_maintenance')
      expect(bookingRouteForService('cleaning')).toBe('/(customer)/booking?service=home_cleaning')
    }, 'booking reads the customer service id from the route')
  })

  it('renders quick actions above the composer and runs the chosen one', () => {
    const start = jest.fn()
    const suggest = jest.fn()
    render(
      <KaelChatComposer
        allowVideoSelection={false}
        canUseComposerMedia={false}
        composerBusy={false}
        composerMediaDraftCount={0}
        composerMediaDrafts={[]}
        composerPlaceholder="Nhập tin nhắn cho Kael..."
        draft=""
        hasVoiceTranscript={false}
        language="vi"
        onBlur={jest.fn()}
        onDraftChange={jest.fn()}
        onFocus={jest.fn()}
        onPickMedia={jest.fn()}
        onRemoveComposerMediaDraft={jest.fn()}
        onSendMessage={jest.fn()}
        onStopMessage={jest.fn()}
        quickActions={[
          { id: 'start_case', label: 'Bắt đầu xử lý: Điều hòa', primary: true, onPress: start },
          { id: 'suggestion-1', label: 'Làm sao biết ống thoát nước bị nghẹt?', onPress: suggest },
        ]}
        rootStyles={new Proxy({}, { get: () => ({}) }) as never}
        textInputNoOutlineStyle={{}}
        tokens={{ border: '#ddd', borderStrong: '#ccc', mode: 'light', muted: '#555', primary: '#087D72', raised: '#fff', text: '#111' } as never}
      />,
    )
    fireEvent.press(screen.getByTestId('customer-v21-kael-quick-action-start_case'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-quick-action-suggestion-1'))
    withPillarContext(PILLAR, () => {
      expect(start).toHaveBeenCalledTimes(1)
      expect(suggest).toHaveBeenCalledTimes(1)
    }, 'each chip runs only its own action')
  })
})
