import { act, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { KaelReasoningReceipt } from '../kael-reasoning-receipt'
import type { KaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'

export const PILLAR = {
  id: 'P206-kael-chat-liquid-status',
  invariant: 'Kael Chat status motion is tied to the real receipt state, plays once, and leaves public status and reply copy readable',
  authority: ['governance/protocols/frontend-test.md G3 and G4', 'governance/design/motion.md'],
  target: 'apps/mobile/components/ui/kael-reasoning-receipt.tsx',
  layer: 'ui-visual',
  siblings: ['P25-customer-kael-chat-mascot', 'P104-kael-ephemeral-state-scope'],
  mutation: 'remove the running-state matrix gate or show it after completion; the running and terminal assertions turn red',
} as const satisfies PillarManifest

const colors = {
  accent: '#008f82',
  border: '#c7e4df',
  mutedText: '#657d82',
  surface: '#f4fbfa',
  text: '#12272a',
}

function receipt(status: KaelReasoningReceiptState['status']): KaelReasoningReceiptState {
  return {
    elapsedMs: status === 'running' ? 0 : 2_300,
    expanded: true,
    failureMessage: null,
    fallbackUsed: false,
    receiptId: 'receipt-liquid-status',
    startedAt: '2026-09-27T00:00:00.000Z',
    status,
    steps: status === 'running' ? [] : [{
      detail: 'The answer is ready for the customer.',
      id: 'public-reply',
      label: 'Prepared the reply',
      sequence: 0,
      stage: 'compose',
      status: 'completed',
    }],
    summary: status === 'running' ? [] : ['The answer is ready for the customer.'],
  }
}

describe('Kael Chat truthful status presentation', () => {
  it('shows one bounded matrix only while the backend receipt is running', () => {
    jest.useFakeTimers()
    const view = render(
      <KaelReasoningReceipt
        colors={colors}
        language="en"
        onToggle={jest.fn()}
        state={receipt('running')}
        testID="kael-status-pillar"
      />,
    )

    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Thinking')).toBeOnTheScreen()
      expect(screen.getByTestId('kael-status-pillar-matrix-loader')).toBeOnTheScreen()
      expect(screen.getAllByTestId(/kael-status-pillar-matrix-loader-dot-/u)).toHaveLength(16)
    }, 'the matrix and thinking label must exist only for the running backend receipt')

    view.rerender(
      <KaelReasoningReceipt
        colors={colors}
        language="en"
        onToggle={jest.fn()}
        state={receipt('complete')}
        testID="kael-status-pillar"
      />,
    )
    act(() => jest.advanceTimersByTime(4_000))

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('kael-status-pillar-matrix-loader')).toBeNull()
      expect(screen.getByText('Finished thinking')).toBeOnTheScreen()
      expect(screen.getByText(/The answer is ready for the/u)).toBeOnTheScreen()
    }, 'completion must replace the running indicator with the already-authorized public reply state')
    jest.useRealTimers()
  })
})
