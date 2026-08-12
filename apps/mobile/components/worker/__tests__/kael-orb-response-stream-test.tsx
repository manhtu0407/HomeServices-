import { render, screen } from '@testing-library/react-native'
import { View } from 'react-native'

import { WorkerV5KaelOrbBody } from '../chat/body-surfaces'
import { initialKaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'
import type { KaelResponseStreamState } from '@/lib/kael-response-stream'

const streamingReply: KaelResponseStreamState = {
  blockOrder: ['reply-1:block:0'],
  blocks: {
    'reply-1:block:0': {
      id: 'reply-1:block:0',
      kind: 'paragraph',
      status: 'streaming',
      text: 'Khoa van nuoc truoc khi kiem tra diem ro.',
    },
  },
  elapsedMs: null,
  error: null,
  responseId: 'reply-1',
  status: 'streaming',
  transport: 'universal',
}

describe('WorkerV5KaelOrbBody response stream', () => {
  it.each(['normal', 'intake'] as const)(
    'renders the active safe response stream in %s mode',
    (mode) => {
      render(
        <WorkerV5KaelOrbBody
          composer={<View testID="kael-composer" />}
          deal={null}
          fallbackJobIcon={1}
          language="en"
          mode={mode}
          onOpenOpportunity={jest.fn()}
          onToggleReasoningReceipt={jest.fn()}
          reduceMotion
          reasoningReceipt={{
            ...initialKaelReasoningReceiptState,
            receiptId: 'receipt-1',
            startedAt: '2026-08-11T03:00:00.000Z',
            status: 'running',
          }}
          reduceTransparency={false}
          serviceIcons={{}}
          streamingReply={streamingReply}
        />,
      )

      expect(screen.getByTestId(`worker-v5-kael-orb-${mode}`)).toBeTruthy()
      expect(screen.getByTestId('worker-v5-kael-reasoning-receipt')).toBeTruthy()
      expect(screen.queryByTestId(`worker-v5-kael-empty-hero-${mode}`)).toBeNull()
      expect(screen.getByTestId('worker-v5-kael-bubble-kael')).toHaveTextContent(
        'Khoa van nuoc truoc khi kiem tra diem ro.',
      )
    },
  )
})
