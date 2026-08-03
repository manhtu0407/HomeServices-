import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('chat-artifacts', () => {
  installEdgeRuntimeTestHooks()

  it('records structured missing-field artifact metadata when Kael needs district context', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          total_turns: 0,
          safe_metadata: {},
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: { id: 'kael-session-1', diagnosis_scope: null, total_turns: 1, total_cost_usd: 0 },
        error: null,
      },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'kael-session-1', total_turns: 1, total_cost_usd: 0, safe_metadata: {} }, error: null },
      { data: { id: 'turn-clarify' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          case_phase: 'analysis',
          diagnosis_scope: null,
          started_at: '2026-05-20T00:00:00.000Z',
          estimate_ready_at: null,
          total_turns: 2,
          total_cost_usd: 0,
          safe_metadata: {},
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'turn-customer',
            session_id: 'kael-session-1',
            turn_index: 1,
            role: 'customer',
            content_type: 'text',
            text_content: 'Ống nước rò dưới lavabo',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-clarify',
            session_id: 'kael-session-1',
            turn_index: 2,
            role: 'kael',
            content_type: 'clarification',
            text_content: 'Bạn cho Kael biết quận ở TP.HCM để ước tính đúng khu vực và tìm thợ phù hợp.',
            media_refs: [],
            safe_metadata: {
              artifact_proposal: {
                artifact_type: 'process_ticket',
                visibility: 'partial',
                confidence: 0.4,
                missing_fields: ['address_district'],
                may_transition: false,
                recommended_next_question: 'Bạn cho Kael biết quận ở TP.HCM để ước tính đúng khu vực và tìm thợ phù hợp.',
              },
            },
            created_at: '2026-05-20T00:00:02.000Z',
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).sendKaelChatTurn(ctx, 'kael-session-1', {
      message: 'Ống nước rò dưới lavabo',
      photo_urls: [],
    })

    expect(result.session.next_action).toBe('await_input')
    expect(client.calls.some((call) => call.table === 'service_problems')).toBe(false)
    const clarificationInsert = client.calls.find((call) =>
      call.table === 'kael_chat_turns' &&
      call.operations.some((op) => {
        const value = op[1] as { content_type?: string } | undefined
        return op[0] === 'insert' && value?.content_type === 'clarification'
      })
    )
    const insertedTurn = clarificationInsert?.operations.find((op) => op[0] === 'insert')?.[1] as { safe_metadata?: Record<string, unknown> } | undefined
    expect(insertedTurn?.safe_metadata?.artifact_proposal).toMatchObject({
      artifact_type: 'process_ticket',
      missing_fields: ['address_district'],
      may_transition: false,
    })
  })

  it('records structured artifact metadata when Kael needs more description before estimating', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).includes('deepseek.com')) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              service_type: 'plumbing',
              problem_slug: 'other_plumbing',
              confidence: 0.35,
              needs_clarification: true,
              missing_slots: ['fixture_pipe_or_drain_type'],
              profile_facts: {
                leak_or_blockage_severity: 'minor leak, no flooding',
                water_isolation_availability: 'local shutoff is available',
                access_and_concealed_pipework: 'exposed pipe below the sink',
                pipe_or_fixture_material: 'material not yet identified',
                water_damage_and_urgency: 'no water damage yet',
              },
              clarification_question_vi: 'Vị trí bị rò là ở vòi, ống cấp hay đường thoát nước?',
              scope_signal: 'in_scope',
              customer_sentiment: 'neutral',
            }),
          },
        }],
        usage: { prompt_tokens: 18, completion_tokens: 12 },
      }))
    }))
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          total_turns: 0,
          safe_metadata: { address_district: 'q7' },
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: { id: 'kael-session-1', diagnosis_scope: null, total_turns: 1, total_cost_usd: 0 },
        error: null,
      },
      {
        data: [{
          turn_index: 1,
          role: 'customer',
          content_type: 'text',
          text_content: 'Rò',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'kael-session-1', total_turns: 1, total_cost_usd: 0, safe_metadata: {} }, error: null },
      { data: { id: 'turn-clarify' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          case_phase: 'analysis',
          diagnosis_scope: null,
          started_at: '2026-05-20T00:00:00.000Z',
          estimate_ready_at: null,
          total_turns: 2,
          total_cost_usd: 0,
          safe_metadata: { address_district: 'q7' },
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'turn-customer',
            session_id: 'kael-session-1',
            turn_index: 1,
            role: 'customer',
            content_type: 'text',
            text_content: 'Rò',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-clarify',
            session_id: 'kael-session-1',
            turn_index: 2,
            role: 'kael',
            content_type: 'clarification',
            text_content: 'Bạn mô tả rõ hơn vấn đề đang gặp: vị trí, dấu hiệu và mức độ ảnh hưởng trong căn hộ.',
            media_refs: [],
            safe_metadata: {
              artifact_proposal: {
                artifact_type: 'process_ticket',
                visibility: 'partial',
                confidence: 0.4,
                missing_fields: ['description'],
                may_transition: false,
                recommended_next_question: 'Bạn mô tả rõ hơn vấn đề đang gặp: vị trí, dấu hiệu và mức độ ảnh hưởng trong căn hộ.',
              },
            },
            created_at: '2026-05-20T00:00:02.000Z',
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({ deepseekApiKey: 'deepseek-ok' }).sendKaelChatTurn(ctx, 'kael-session-1', {
      message: 'Rò',
      photo_urls: [],
    })

    expect(result.session.next_action).toBe('await_input')
    expect(client.calls.some((call) => call.table === 'service_problems')).toBe(false)
    const clarificationInsert = client.calls.find((call) =>
      call.table === 'kael_chat_turns' &&
      call.operations.some((op) => {
        const value = op[1] as { content_type?: string } | undefined
        return op[0] === 'insert' && value?.content_type === 'clarification'
      })
    )
    const insertedTurn = clarificationInsert?.operations.find((op) => op[0] === 'insert')?.[1] as { safe_metadata?: Record<string, unknown> } | undefined
    expect(insertedTurn?.safe_metadata?.artifact_proposal).toMatchObject({
      artifact_type: 'ai_notes',
      missing_fields: ['fixture_pipe_or_drain_type'],
      may_transition: false,
    })
  })
})
