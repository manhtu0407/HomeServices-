import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insertKaelJobMessage: vi.fn(async () => undefined),
  logApiCalls: vi.fn(async () => undefined),
  runJobIncidentAssistant: vi.fn(),
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/kael/index.ts', () => ({
  runJobIncidentAssistant: mocks.runJobIncidentAssistant,
  scrubSensitiveForLLM: (value: string) => value,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/services/audit.ts', () => ({
  logApiCalls: mocks.logApiCalls,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/services/chat.service.ts', () => ({
  insertKaelJobMessage: mocks.insertKaelJobMessage,
}))

import { recordJobIncidentChatMessage } from '../../../../../supabase/functions/mobile-api/_shared/services/job-incident.service'

const incident = {
  id: 'incident-1',
  job_id: 'job-1',
  status: 'scope_proposed',
  reported_description: 'Thay đoạn dây bị cháy.',
  reported_reason: 'Dây cũ không còn an toàn.',
  evidence_photo_urls: [],
  evidence_status: 'ready',
  last_summary: null,
  last_question: null,
  last_next_actor: null,
  created_at: '2026-07-12T00:00:00.000Z',
  updated_at: '2026-07-12T00:00:00.000Z',
}

function clientForScopeProposedChat(updates: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      let action: 'select' | 'insert' | 'update' = 'select'
      let statusValues: unknown[] = []
      const chain = {
        eq: () => chain,
        in: (column: string, values: unknown[]) => {
          if (table === 'kael_job_incidents' && column === 'status') statusValues = values
          return chain
        },
        insert: () => {
          action = 'insert'
          return chain
        },
        limit: () => chain,
        maybeSingle: () => chain,
        order: () => chain,
        select: () => {
          if (action !== 'update') action = 'select'
          return chain
        },
        single: () => chain,
        update: (value: Record<string, unknown>) => {
          action = 'update'
          updates.push(value)
          return chain
        },
        then<TResult1 = unknown>(onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null) {
          const result = table === 'kael_job_incidents' && action === 'select'
            ? { data: statusValues.includes('scope_proposed') ? incident : null, error: null }
            : table === 'kael_job_incidents' && action === 'update'
            ? { data: { ...incident, ...updates.at(-1) }, error: null }
            : table === 'kael_job_incident_events' && action === 'select'
            ? { data: [], error: null }
            : { data: null, error: null }
          return Promise.resolve(result).then(onfulfilled ?? undefined)
        },
      }
      return chain
    },
  }
}

describe('Kael job incident chat after proposal', () => {
  it('keeps the customer approval hard-stop while Kael clarifies a real job message', async () => {
    mocks.runJobIncidentAssistant.mockResolvedValue({
      summary: 'Kael ghi nhận câu hỏi của thợ.',
      next_actor: 'customer',
      question: 'Bạn có thể xác nhận phần việc phát sinh không?',
      evidence_status: 'needs_more',
      evidence_gaps: [],
      fallback_used: false,
      provider: null,
      model: null,
    })
    const updates: Array<Record<string, unknown>> = []

    await recordJobIncidentChatMessage(
      clientForScopeProposedChat(updates) as never,
      { id: 'job-1', description: 'Sửa điện', service_type: 'electrical' },
      { id: 'message-1', sender_role: 'worker', content: 'Khách cần làm rõ vị trí dây cháy.' },
      { user: { id: 'worker-1' } } as never,
      {},
    )

    expect(mocks.runJobIncidentAssistant).toHaveBeenCalledWith(expect.objectContaining({
      event: expect.objectContaining({ actor: 'worker' }),
    }))
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'scope_proposed' }),
    ]))
    expect(mocks.insertKaelJobMessage).toHaveBeenCalledWith(expect.anything(), 'job-1', expect.stringContaining('Kael Công việc:'))
  })
})
