import { fireEvent, render, screen } from '@testing-library/react-native'
import { View } from 'react-native'
import type { KaelNextAction } from '@nestscout/shared'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { WorkerV5KaelOrbBody } from '../chat/body-surfaces'
import { workerKaelNextActionHandler } from '../chat/kael-orb-next-actions'
import { workerV5KaelOrbTurnsFromResponse } from '../chat/kael-orb-chat-model'

export const PILLAR = {
  id: 'P372-worker-kael-chips',
  invariant:
    'the worker thread shows Kael’s next steps only under the newest Kael reply, and each chip only sends its question, opens the photo picker, the scope-change form or the opportunity inbox',
  authority: [
    'governance/RULES.md #7 (accepting a job and changing scope stay explicit worker actions)',
    'governance/protocols/frontend-test.md G2 (state coverage)',
  ],
  target: 'apps/mobile/components/worker/chat/kael-orb-next-actions.ts',
  layer: 'ui-visual',
  siblings: ['P371-worker-kael-next-actions'],
  mutation:
    'route open_scope_change to the opportunity inbox — the handler case turns red; render chips under any Kael turn — the newest-turn case turns red',
} as const satisfies PillarManifest

const ACTIONS: KaelNextAction[] = [
  { id: 'open_scope_change', kind: 'open_scope_change', label: 'Đề xuất thay đổi phạm vi' },
  { id: 'attach_photo', kind: 'attach_photo', label: 'Gửi ảnh hiện trường' },
  { id: 'follow_up_1', kind: 'send_suggestion', label: 'Có cần thay gioăng mới không?', message: 'Có cần thay gioăng mới không?' },
  { id: 'open_opportunities', kind: 'open_opportunities', label: 'Mở hộp cơ hội' },
]

function body(liveTurns: Parameters<typeof WorkerV5KaelOrbBody>[0]['liveTurns'], onNextAction = jest.fn()) {
  render(
    <WorkerV5KaelOrbBody
      composer={<View testID="kael-composer" />}
      deal={null}
      fallbackJobIcon={1}
      language="vi"
      liveTurns={liveTurns}
      mode="intake"
      onNextAction={onNextAction}
      onOpenOpportunity={jest.fn()}
      reduceMotion
      reduceTransparency={false}
      serviceIcons={{}}
    />,
  )
  return onNextAction
}

describe(`${PILLAR.id}`, () => {
  it('maps each chip to the worker’s own screen or question', () => {
    const send = jest.fn()
    const pickMedia = jest.fn()
    const navigateToScreen = jest.fn()
    const run = workerKaelNextActionHandler({ send, pickMedia, navigateToScreen })
    ACTIONS.forEach(run)
    withPillarContext(PILLAR, () => {
      expect(navigateToScreen.mock.calls).toEqual([['2.8-scope-change'], ['2.1-opportunity-inbox']])
      expect(pickMedia).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenCalledWith('Có cần thay gioăng mới không?')
    }, 'four chips, four distinct effects')
  })

  it('keeps the next steps of a Kael reply when mapping the response', () => {
    const turns = workerV5KaelOrbTurnsFromResponse([{
      id: 'turn-2', session_id: 's', turn_index: 2, role: 'kael', content_type: 'guidance',
      text_content: 'Bạn khóa van trước khi tháo ống.', media_refs: [], safety_notes: [],
      next_actions: ACTIONS, created_at: '2026-10-12T03:00:00.000Z',
    }])
    expect(turns[0]?.nextActions).toEqual(ACTIONS)
  })

  it('shows chips only under the newest Kael reply and reports the chosen one', () => {
    const onNextAction = body([{ id: 'turn-2', role: 'kael', text: 'Bạn khóa van trước.', nextActions: ACTIONS.slice(0, 2) }])
    fireEvent.press(screen.getByTestId('worker-v5-kael-next-action-open_scope_change'))
    expect(onNextAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'open_scope_change' }))
  })

  it('hides earlier chips once the worker has written again', () => {
    body([
      { id: 'turn-2', role: 'kael', text: 'Bạn khóa van trước.', nextActions: ACTIONS.slice(0, 2) },
      { id: 'turn-3', role: 'worker', text: 'Đã khóa van.' },
    ])
    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('worker-v5-kael-next-actions')).toBeNull()
    }, 'stale suggestions under an answered reply')
  })
})
