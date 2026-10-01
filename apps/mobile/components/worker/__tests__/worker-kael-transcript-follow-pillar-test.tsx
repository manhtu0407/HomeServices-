import { fireEvent, render, screen } from '@testing-library/react-native'
import { View } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { color } from '@/design/theme'
import { WorkerV5KaelOrbBody } from '../chat/body-surfaces'
import { getWorkerKaelEmptyHeroCopy } from '../chat/empty-hero-copy'

export const PILLAR = {
  id: 'P207-worker-kael-transcript-follow',
  invariant: 'Worker Kael keeps only the mascot slogan in English, follows the selected app language elsewhere, and offers a latest-content control while the reader is away',
  authority: ['governance/protocols/frontend-test.md G3 and G4', 'governance/RULES.md #7 honest state'],
  target: 'apps/mobile/components/worker/chat/body-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P206-kael-chat-liquid-status', 'P104-kael-ephemeral-state-scope'],
  mutation: 'remove the reader-away response control or make it appear without new transcript content; the visibility transition assertion turns red',
} as const satisfies PillarManifest

const firstTurn = { id: 'worker-1', role: 'worker' as const, text: 'Xin chào Kael.' }
const nextTurn = { id: 'kael-1', role: 'kael' as const, text: 'Mình đã nhận được câu hỏi.' }

function bodyProps(liveTurns: Array<typeof firstTurn | typeof nextTurn>) {
  return {
    activeSessionId: 'session-1',
    composer: <View testID="worker-kael-composer" />,
    deal: null,
    fallbackJobIcon: 1,
    language: 'vi' as const,
    liveTurns,
    mode: 'normal' as const,
    onOpenOpportunity: jest.fn(),
    onToggleReasoningReceipt: jest.fn(),
    reduceMotion: false,
    reduceTransparency: false,
    serviceIcons: {},
  }
}

describe('Worker Kael transcript follow behavior', () => {
  it('keeps only the mascot slogan in English while the rest follows the Vietnamese app language', () => {
    const view = render(<WorkerV5KaelOrbBody {...bodyProps([])} />)

    const expectedCopy = getWorkerKaelEmptyHeroCopy('normal', 'en').text
    expect(screen.getByTestId('worker-v5-kael-empty-hero-copy')).toHaveTextContent(expectedCopy)

    view.rerender(<WorkerV5KaelOrbBody {...bodyProps([firstTurn, nextTurn])} />)
    expect(screen.getByText(firstTurn.text)).toBeOnTheScreen()
    expect(screen.getByText(nextTurn.text)).toBeOnTheScreen()
  })

  it('offers a latest control when a reply arrives off-bottom and hides it near the latest content', () => {
    const view = render(<WorkerV5KaelOrbBody {...bodyProps([firstTurn])} />)
    const transcript = screen.getByTestId('worker-v5-kael-orb-transcript')

    fireEvent.scroll(transcript, {
      nativeEvent: {
        contentOffset: { x: 0, y: 40 },
        contentSize: { height: 1_000, width: 320 },
        layoutMeasurement: { height: 600, width: 320 },
      },
    })

    view.rerender(<WorkerV5KaelOrbBody {...bodyProps([firstTurn, nextTurn])} />)

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-kael-orb-jump-to-latest')).toHaveTextContent('Phần mới')
      expect(screen.getByTestId('worker-v5-kael-orb-jump-to-latest')).toHaveStyle({ backgroundColor: color.brand.primaryDark })
    }, 'new replies must remain discoverable without pulling the reader away from older content')

    fireEvent.scroll(screen.getByTestId('worker-v5-kael-orb-transcript'), {
      nativeEvent: {
        contentOffset: { x: 0, y: 350 },
        contentSize: { height: 1_000, width: 320 },
        layoutMeasurement: { height: 600, width: 320 },
      },
    })

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('worker-v5-kael-orb-jump-to-latest')).toBeNull()
    }, 'the jump control must disappear when the reader returns near the bottom')
  })
})
