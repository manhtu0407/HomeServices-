import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import * as edge from '../../../../../supabase/functions/_shared/contracts/kael-next-actions'
import * as shared from '../../../../../packages/shared/src/contracts/kael-next-actions'
import { kaelChatTurnSchema as edgeTurnSchema } from '../../../../../supabase/functions/_shared/contracts/kael-chat'
import { kaelChatTurnSchema as sharedTurnSchema } from '../../../../../packages/shared/src/contracts/kael-chat'

export const PILLAR = {
  id: 'P368-kael-next-actions-contract',
  invariant:
    'the next-action contract is the same on the Deno Edge and in the npm workspace: same intents, same kinds, same per-surface kind lists, and the same accept/reject decision for every probe, so the app never renders an action the server would not send',
  authority: [
    'CLAUDE.md Architecture invariant 3 (hand-maintained contract twins must not drift)',
    'governance/RULES.md #7 (the client only sends back actions the server offered)',
  ],
  target: 'supabase/functions/_shared/contracts/kael-next-actions.ts',
  layer: 'static-type',
  siblings: ['P364-kael-evidence-gap-options', 'P369-kael-work-next-action-chips'],
  mutation:
    'add a kind to only one twin — the list case turns red; relax label max to 80 in one twin — the probe case turns red',
} as const satisfies PillarManifest

const PROBES: unknown[] = [
  [],
  [{ id: 'a', kind: 'provide_detail', label: 'Bổ sung thông tin' }],
  [{ id: 'a', kind: 'request_worker_quote', label: 'Gửi thợ báo giá', message: 'Gửi giúp mình', turn_intent: 'request_worker_quote' }],
  [{ id: 'a', kind: 'start_case', label: 'Bắt đầu', service_type: 'hvac' }],
  [{ id: 'a', kind: 'start_case', label: 'Bắt đầu', service_type: 'gardening' }],
  [{ id: 'a', kind: 'confirm_offer', label: 'Xác nhận' }],
  [{ id: 'a', kind: 'provide_detail', label: 'x'.repeat(61) }],
  [{ id: 'a', kind: 'provide_detail', label: 'Bổ sung', extra: true }],
  Array.from({ length: 5 }, (_, index) => ({ id: `a${index}`, kind: 'attach_photo', label: 'Ảnh' })),
]

describe(`${PILLAR.id}: one next-action contract on both runtimes`, () => {
  it('declares the same intents and kinds on both sides', () => {
    expect([...edge.KAEL_TURN_INTENTS], pillarWhy(PILLAR, 'intent lists')).toEqual([...shared.KAEL_TURN_INTENTS])
    expect([...edge.KAEL_NEXT_ACTION_KINDS], pillarWhy(PILLAR, 'kind lists')).toEqual([...shared.KAEL_NEXT_ACTION_KINDS])
    expect([...edge.CUSTOMER_WORK_NEXT_ACTION_KINDS]).toEqual([...shared.CUSTOMER_WORK_NEXT_ACTION_KINDS])
    expect([...edge.CUSTOMER_CHAT_NEXT_ACTION_KINDS]).toEqual([...shared.CUSTOMER_CHAT_NEXT_ACTION_KINDS])
    expect([...edge.WORKER_NEXT_ACTION_KINDS]).toEqual([...shared.WORKER_NEXT_ACTION_KINDS])
  })

  it('accepts and rejects exactly the same next-action lists', () => {
    for (const probe of PROBES) {
      expect(
        edge.kaelNextActionsSchema.safeParse(probe).success,
        pillarWhy(PILLAR, `probe ${JSON.stringify(probe).slice(0, 80)}`),
      ).toBe(shared.kaelNextActionsSchema.safeParse(probe).success)
    }
    expect(edge.kaelNextActionsSchema.safeParse(PROBES[1]).success).toBe(true)
    expect(edge.kaelNextActionsSchema.safeParse(PROBES[5]).success, pillarWhy(PILLAR, 'no confirm kind exists')).toBe(false)
  })

  it('accepts the same turn intents from the app on both sides', () => {
    for (const turnIntent of ['price_question', 'scope_adjustment', 'request_reference_price', 'request_worker_quote', 'ask_question', 'proceed_or_confirm']) {
      const body = { message: 'Vì sao chưa có giá?', turn_intent: turnIntent }
      expect(edgeTurnSchema.safeParse(body).success, pillarWhy(PILLAR, turnIntent)).toBe(sharedTurnSchema.safeParse(body).success)
    }
    expect(edgeTurnSchema.safeParse({ message: 'Ok', turn_intent: 'proceed_or_confirm' }).success,
      pillarWhy(PILLAR, 'the app may never send a confirm intent as a chip')).toBe(false)
  })
})
