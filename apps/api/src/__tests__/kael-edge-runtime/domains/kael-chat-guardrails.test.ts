import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('chat-guardrails', () => {
  installEdgeRuntimeTestHooks()

  it('hard-stops Kael chat before provider calls when the session exceeds the AI budget cap', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          total_turns: 2,
          safe_metadata: {
            address_district: 'q7',
            problem_chips: ['leak'],
            photo_urls: [],
          },
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: { id: 'kael-session-1', diagnosis_scope: null, total_turns: 1, total_cost_usd: 1 },
        error: null,
      },
      { data: { id: 'kael-session-1', total_turns: 3, total_cost_usd: 1 }, error: null },
      { data: { id: 'turn-budget' }, error: null },
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
          total_turns: 4,
          total_cost_usd: 1,
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
            turn_index: 3,
            role: 'customer',
            content_type: 'text',
            text_content: 'Pipe is still leaking in the kitchen cabinet',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-budget',
            session_id: 'kael-session-1',
            turn_index: 4,
            role: 'kael',
            content_type: 'error',
            text_content: 'Budget cap reached',
            media_refs: [],
            safe_metadata: { budget_exceeded: true },
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
      message: 'Pipe is still leaking in the kitchen cabinet',
      photo_urls: [],
    })

    expect(result.session.next_action).toBe('budget_exceeded')
    expect(client.calls.some((call) => call.table === 'service_problems')).toBe(false)
    expect(client.calls.some((call) => call.table === 'price_baselines')).toBe(false)
    const budgetTurnUpdate = client.calls
      .flatMap((call) => call.operations)
      .find((op) => {
        const updateValue = op[1] as { total_turns?: number } | undefined
        return op[0] === 'update' && updateValue?.total_turns === 4
      })
    expect(budgetTurnUpdate?.[1]).not.toHaveProperty('estimate_ready_at')
  })

  it('hard-stops Kael chat and queues admin review for demanding customer pressure', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'estimate_ready',
          total_turns: 3,
          safe_metadata: {
            address_district: 'q7',
            problem_chips: ['leak'],
            photo_urls: [],
            demanding_customer_qa_count: 4,
          },
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'interaction-1' }, error: null },
      { data: { id: 'queue-1' }, error: null },
      { data: { id: 'kael-session-1', total_turns: 4, total_cost_usd: 0.001, safe_metadata: {} }, error: null },
      { data: { id: 'turn-hard' }, error: null },
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
          estimate_ready_at: '2026-05-20T00:00:10.000Z',
          total_turns: 5,
          total_cost_usd: 0.001,
          safe_metadata: { demanding_customer_hard_escalation: true },
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'turn-customer',
            session_id: 'kael-session-1',
            turn_index: 4,
            role: 'customer',
            content_type: 'text',
            text_content: 'Hoàn tiền ngay không tôi sẽ khiếu nại và đăng bài tố Kael.',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-hard',
            session_id: 'kael-session-1',
            turn_index: 5,
            role: 'kael',
            content_type: 'clarification',
            text_content: 'Kael đã ghi nhận đầy đủ. Để giải quyết tốt nhất, admin sẽ liên hệ bạn trong vòng 30 phút.',
            media_refs: [],
            safe_metadata: {
              demanding_customer: {
                escalation_level: 'hard',
                stop_ai_loop: true,
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
      message: 'Hoàn tiền ngay không tôi sẽ khiếu nại và đăng bài tố Kael.',
      photo_urls: [],
    })

    expect(result.session.next_action).toBe('await_input')
    expect(result.turns.at(-1)).toMatchObject({
      role: 'kael',
      content_type: 'clarification',
      text_content: expect.stringContaining('admin sẽ liên hệ'),
    })
    expect(client.calls.some((call) => call.table === 'service_problems')).toBe(false)
    expect(client.calls.some((call) => call.table === 'price_baselines')).toBe(false)
    expect(client.calls.find((call) => call.table === 'kael_interaction_log')).toBeTruthy()
    const queueCall = client.calls.find((call) => call.table === 'kael_admin_queue')
    expect(queueCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: null,
        actor_id: 'customer-1',
        priority: 'high',
        escalation_level: 'hard',
      }),
    ])
    const hardStopUpdate = client.calls
      .flatMap((call) => call.operations)
      .find((op) => {
        const updateValue = op[1] as { safe_metadata?: Record<string, unknown> } | undefined
        return op[0] === 'update' &&
          updateValue?.safe_metadata?.demanding_customer_hard_escalation === true
      })?.[1] as { safe_metadata?: Record<string, unknown> } | undefined
    expect(hardStopUpdate?.safe_metadata).toMatchObject({
      demanding_customer_hard_escalation: true,
      demanding_customer_stop_ai_loop: true,
    })
  })

  it('logs provider purposes for Kael chat estimate calls', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const target = String(input)
      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                service_type: 'electrical',
                problem_slug: 'outlet_or_switch_broken',
                confidence: 0.9,
                needs_clarification: false,
                profile_facts: {
                  affected_area_and_power_state: 'one outlet, circuit switched off',
                  device_or_circuit_type: 'wall outlet',
                  symptom_and_duration: 'burnt face and smell since today',
                  access_and_concealed_wiring: 'outlet face is accessible',
                  parts_or_new_device_requirement: 'inspection before replacement',
                  urgency_and_repeat_fault: 'urgent first occurrence',
                },
                safety_signals: [],
              }),
            },
          }],
          usage: { prompt_tokens: 20, completion_tokens: 12 },
        }))
      }
      if (target.includes('anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              problem_identified: 'Ổ cắm cháy đen và có mùi khét',
              severity_indicators: ['mùi khét'],
              complexity_hint: 'medium',
            }),
          }],
          usage: { input_tokens: 35, output_tokens: 18 },
        }))
      }
      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 180000,
                market_range_max: 420000,
                confidence: 0.78,
                sources_summary: 'HCMC apartment repair references',
              }),
            },
          }],
          usage: { prompt_tokens: 25, completion_tokens: 15 },
        }))
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const initialDiagnosisScope = buildInitialDiagnosisScopeArtifact({
      customerGoal: 'Ổ cắm bị cháy đen và có mùi khét',
      serviceType: 'electrical',
    })
    const diagnosisScopeAfterEvidenceReview = {
      ...initialDiagnosisScope,
      facts: {
        ...initialDiagnosisScope.facts,
        evidence_gate_decision: 'skipped',
      },
    }

    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          service_type: 'electrical',
          status: 'active',
          total_turns: 1,
          safe_metadata: {
            address_district: 'q7',
            problem_chips: ['outlet_or_switch_broken'],
            photo_urls: [],
          },
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          diagnosis_scope: diagnosisScopeAfterEvidenceReview,
          total_turns: 2,
          total_cost_usd: 0,
        },
        error: null,
      },
      {
        data: [{
          turn_index: 2,
          role: 'customer',
          content_type: 'text',
          text_content: 'Ổ cắm bị cháy đen và có mùi khét',
        }],
        error: null,
      },
      { data: [{ id: 'problem-1' }], error: null },
      { data: [{ complexity: 'medium', price_min: 120000, price_max: 320000, district_code: 'hcmc_all' }], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'kael-session-1', total_turns: 2, total_cost_usd: 0 }, error: null },
      { data: { id: 'turn-estimate' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'electrical',
          status: 'estimate_ready',
          case_phase: 'offer_review',
          diagnosis_scope: null,
          started_at: '2026-05-20T00:00:00.000Z',
          estimate_ready_at: '2026-05-20T00:00:10.000Z',
          total_turns: 3,
          total_cost_usd: 0.001,
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
            turn_index: 2,
            role: 'customer',
            content_type: 'text',
            text_content: 'Ổ cắm bị cháy đen và có mùi khét',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-estimate',
            session_id: 'kael-session-1',
            turn_index: 3,
            role: 'kael',
            content_type: 'estimate',
            text_content: 'Kael estimate',
            media_refs: [],
            safe_metadata: {
              estimate: {
                service_type: 'electrical',
                problem_category: 'outlet_or_switch_broken',
                problem_summary: 'Ổ cắm cháy đen và có mùi khét',
                complexity: 'medium',
                price_min: 156000,
                price_max: 380000,
                confidence: 0.64,
                advisory: null,
                disclaimer: 'disclaimer',
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

    await expect(createEdgeServices({
      deepseekApiKey: 'deepseek-ok',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    }).sendKaelChatTurn(ctx, 'kael-session-1', {
      message: 'Ổ cắm bị cháy đen và có mùi khét',
      photo_urls: [],
    })).resolves.toMatchObject({
      session: { next_action: 'estimate_ready' },
    })

    const apiLogCall = client.calls.find((call) => call.table === 'api_logs')
    const insertOp = apiLogCall?.operations.find((op) => op[0] === 'insert')
    const rows = insertOp?.[1] as Array<Record<string, unknown>>
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        job_id: null,
        purpose: 'intent_classification',
        provider: 'deepseek',
        success: true,
        safe_metadata: { surface: 'kael_chat', session_id: 'kael-session-1' },
      }),
      expect.objectContaining({
        job_id: null,
        purpose: 'market_lookup',
        provider: 'perplexity',
        success: true,
      }),
    ]))
    expect(rows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        purpose: 'vision_analysis',
        provider: 'anthropic',
      }),
    ]))
    expect(rows.some((row) => row.purpose == null)).toBe(false)
    const metricCall = client.calls.find((call) => call.table === 'kael_optimization_metrics')
    const metricRows = metricCall?.operations.find((op) => op[0] === 'insert')?.[1] as Array<Record<string, unknown>>
    expect(metricRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        purpose: 'market_lookup',
        provider: 'perplexity',
        enabled_options: [],
        quality_pass: true,
      }),
    ]))
    const kaelEstimateTurn = client.calls
      .filter((call) => call.table === 'kael_chat_turns')
      .map((call) => call.operations.find((op) => op[0] === 'insert')?.[1] as Record<string, unknown>)
      .find((row) => row?.content_type === 'estimate')
    expect(kaelEstimateTurn?.safe_metadata).toMatchObject({
      artifact_proposal: {
        artifact_type: 'estimate',
        visibility: 'customer_review',
        may_transition: false,
      },
      estimate_card_v3: {
        artifact_proposal: {
          may_transition: false,
        },
      },
    })
  })
})
