import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  buildWorkerKaelNextActions,
  workerKaelTurnNextActions,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-chat-next-actions'
import { normalizeWorkerAssistPayload } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/worker-assist-guard'
import { WORKER_NEXT_ACTION_KINDS } from '../../../../../supabase/functions/_shared/contracts/kael-next-actions'

export const PILLAR = {
  id: 'P371-worker-kael-next-actions',
  invariant:
    'a worker’s Kael reply offers only screens the worker already uses (scope change on a job that needs it, a site photo on a job, the opportunity inbox when looking for work) plus clean follow-up questions in the reply language; nothing accepts a job or changes a price for the worker',
  authority: [
    'governance/RULES.md #7 (worker acceptance and scope changes stay explicit worker actions)',
    'governance/RULES.md #5 and #9 (no mixed languages, no personal data in suggestions)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/kael-chat-next-actions.ts',
  layer: 'unit',
  siblings: ['P372-worker-kael-chips', 'P368-kael-next-actions-contract'],
  mutation:
    'drop the reply-language check — the English suggestion in a Vietnamese reply survives and the filter case turns red; offer open_scope_change without a job — the general-chat case turns red',
} as const satisfies PillarManifest

const answer = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 'worker_assist_answer.v1' as const,
  text: 'Bạn kiểm tra van khóa trước khi tháo ống.',
  safety_notes: [],
  redirect_scope_change: false,
  fallback_used: false,
  follow_up_suggestions: [],
  ...overrides,
})

describe(`${PILLAR.id}: worker chips only open the worker’s own screens`, () => {
  it('offers a scope change and a site photo on a job that needs a scope change', () => {
    const actions = buildWorkerKaelNextActions({ answer: answer({ redirect_scope_change: true }), jobId: 'job-1', normalChatSession: false, language: 'vi' })
    expect(actions.map((action) => action.kind), pillarWhy(PILLAR, 'job chat with a scope-change redirect')).toEqual(['open_scope_change', 'attach_photo'])
  })

  it('offers the opportunity inbox while looking for work and nothing job-bound in general chat', () => {
    expect(buildWorkerKaelNextActions({ answer: answer(), jobId: null, normalChatSession: false, language: 'vi' }).map((action) => action.kind))
      .toEqual(['open_opportunities'])
    const general = buildWorkerKaelNextActions({ answer: answer({ redirect_scope_change: true }), jobId: null, normalChatSession: true, language: 'vi' })
    expect(general, pillarWhy(PILLAR, 'general chat has no job to change or photograph')).toEqual([])
  })

  it('keeps only clean, short follow-ups in the reply language', () => {
    const actions = buildWorkerKaelNextActions({
      answer: answer({
        follow_up_suggestions: [
          'Có cần thay gioăng mới không?',
          'Do I need a new washer?',
          'Gọi khách số 0901234567 hỏi thêm?',
          'Một câu hỏi tiếp theo quá dài để làm thành một nút bấm gọn gàng trên màn hình điện thoại của thợ',
        ],
      }),
      jobId: 'job-1',
      normalChatSession: false,
      language: 'vi',
    })
    const suggestions = actions.filter((action) => action.kind === 'send_suggestion')
    expect(suggestions.map((action) => action.message), pillarWhy(PILLAR, 'English, a phone number and an over-long line are dropped')).toEqual(['Có cần thay gioăng mới không?'])
    for (const action of actions) expect(WORKER_NEXT_ACTION_KINDS).toContain(action.kind)
    expect(actions.length).toBeLessThanOrEqual(4)
  })

  it('carries follow-up suggestions through the provider normalizer and validates them on the way out', () => {
    const normalized = normalizeWorkerAssistPayload({
      public_reasoning_summary: ['Dựa trên câu hỏi về rò nước.'],
      text: 'Bạn khóa van trước.',
      follow_up_suggestions: ['Có cần thay gioăng mới không?', 42],
    }) as Record<string, unknown>
    expect(normalized.follow_up_suggestions).toEqual(['Có cần thay gioăng mới không?'])
    expect(workerKaelTurnNextActions({ next_actions: [{ id: 'x', kind: 'confirm_offer', label: 'Nhận việc' }] })).toEqual({})
    expect(workerKaelTurnNextActions({ next_actions: [{ id: 'attach_photo', kind: 'attach_photo', label: 'Gửi ảnh' }] }))
      .toEqual({ next_actions: [{ id: 'attach_photo', kind: 'attach_photo', label: 'Gửi ảnh' }] })
  })
})
