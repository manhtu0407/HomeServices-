import { describe, expect, it, vi } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P369-customer-kael-turn-http',
  invariant:
    'the public Customer Kael turn route validates the follow-up payload and dispatches it only for an authorized session actor',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes stay behind the mobile-api Edge boundary)',
    'governance/RULES.md #1 (validate input at the trust boundary)',
  ],
  target: 'supabase/functions/mobile-api/_shared/http/dispatch/kael.ts',
  layer: 'integration',
  siblings: [
    'P342-customer-kael-intake-create',
    'P45-kael-intake-observation-failure',
    'P44-kael-service-playbook-safety',
  ],
  mutation:
    'skip the route payload schema or allow a Worker through the Customer turn route; the invalid-body or actor-denial assertion turns red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const CUSTOMER_ID = '36900000-0000-4000-8000-000000000001'
const SESSION_ID = '36900000-0000-4000-8000-000000000002'

function customerAuth(client: ReturnType<typeof makeSequenceClient>) {
  return {
    success: true as const,
    user: { id: CUSTOMER_ID },
    role: 'customer' as const,
    supabase: client,
    privilegedSupabase: client,
    userSupabase: client,
  }
}

function workerAuth(client: ReturnType<typeof makeSequenceClient>) {
  return {
    ...customerAuth(client),
    role: 'worker' as const,
  }
}

describe('customer Kael turn HTTP boundary', () => {
  it('customer Kael turn HTTP route dispatches validated input to the session-bound service without provider calls', async () => {
    const client = makeSequenceClient([])
    const services = createEdgeServices({})
    const turnResult = { session: { id: SESSION_ID, status: 'active' } }
    const sendTurn = vi.spyOn(services, 'sendKaelChatTurn').mockResolvedValue(turnResult as never)
    const handler = createMobileApiHandler({
      authenticate: async () => customerAuth(client),
      services,
    })

    const response = await handler(new Request(`https://edge.test/mobile-api/kael/chat/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Tôi gửi thêm thông tin về chỗ rò nước.',
        problem_chips: ['plumbing'],
        photo_urls: [],
        language: 'vi',
      }),
    }))

    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    await expect(response.json()).resolves.toEqual(turnResult)
    expect(sendTurn).toHaveBeenCalledTimes(1)
    expect(sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: CUSTOMER_ID } }),
      SESSION_ID,
      expect.objectContaining({
        message: 'Tôi gửi thêm thông tin về chỗ rò nước.',
        problem_chips: ['plumbing'],
        photo_urls: [],
        language: 'vi',
      }),
    )
    expect(client.calls.filter((call) =>
      call.table === 'kael_chat_sessions' || call.table === 'kael_chat_turns',
    )).toHaveLength(0)
  })

  it('customer Kael turn HTTP route persists a district clarification through the service without provider calls', async () => {
    const success = { data: true, error: null }
    const client = makeSequenceClient([], {
      begin_harness_run: [success],
      begin_harness_authorized_request: [success],
      append_harness_event: Array.from({ length: 5 }, () => success),
      record_harness_privileged_operation: Array.from({ length: 5 }, () => success),
      finish_harness_authorized_request: [success],
      finish_harness_run: [success],
    }, {
      kael_chat_sessions: [
      {
        data: {
          id: SESSION_ID,
          job_id: null,
          customer_id: CUSTOMER_ID,
          service_type: 'plumbing',
          status: 'active',
          total_turns: 0,
          safe_metadata: {},
        },
        error: null,
      },
      { data: { id: SESSION_ID }, error: null },
      { data: { id: SESSION_ID, diagnosis_scope: null, total_turns: 1, total_cost_usd: 0 }, error: null },
      { data: { id: SESSION_ID }, error: null },
      { data: { id: SESSION_ID, total_turns: 1, total_cost_usd: 0, safe_metadata: {} }, error: null },
      { data: { id: SESSION_ID }, error: null },
      { data: { id: SESSION_ID }, error: null },
      { data: { id: SESSION_ID }, error: null },
      {
        data: {
          id: SESSION_ID,
          job_id: null,
          customer_id: CUSTOMER_ID,
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
      ],
      kael_chat_turns: [
        { data: { id: 'turn-customer' }, error: null },
        { data: [], error: null },
        {
          data: [{
            id: 'turn-customer',
            turn_index: 1,
            role: 'customer',
            text_content: 'Ống nước rò dưới lavabo',
          }],
          error: null,
        },
        {
          data: [{
            id: 'turn-customer',
            turn_index: 1,
            role: 'customer',
            content_type: 'text',
            text_content: 'Ống nước rò dưới lavabo',
            safe_metadata: {},
          }],
          error: null,
        },
        { data: { id: 'turn-clarify' }, error: null },
        {
        data: [
          {
            id: 'turn-customer',
            session_id: SESSION_ID,
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
            session_id: SESSION_ID,
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
      ],
    })
    const services = createEdgeServices({})
    const handler = createMobileApiHandler({
      authenticate: async () => customerAuth(client),
      services,
    })
    const fetchMock = vi.fn(async () => {
      throw new Error('Unexpected provider request before district clarification')
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await handler(new Request(`https://edge.test/mobile-api/kael/chat/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Ống nước rò dưới lavabo', photo_urls: [], language: 'vi' }),
    }))
    expect(response.status, pillarWhy(PILLAR, 'the authenticated intake route must return the persisted clarification')).toBe(200)
    const result = await response.json() as { session: { status: string; next_action: string }; turns: Array<Record<string, unknown>> }
    expect(result.session, pillarWhy(PILLAR, 'missing location keeps the Customer in intake')).toMatchObject({
      status: 'active',
      next_action: 'await_input',
    })
    expect(result.turns.at(-1), pillarWhy(PILLAR, 'the public route returns the stored district question')).toMatchObject({
      role: 'kael',
      content_type: 'clarification',
      text_content: 'Bạn cho Kael biết quận ở TP.HCM để ước tính đúng khu vực và tìm thợ phù hợp.',
    })
    const clarificationCall = client.calls.find((call) => call.table === 'kael_chat_turns' &&
      call.operations.some(([operation, value]) => operation === 'insert' &&
        (value as { content_type?: string } | undefined)?.content_type === 'clarification'))
    const clarification = clarificationCall?.operations.find(([operation]) => operation === 'insert')?.[1] as Record<string, unknown> | undefined
    expect(clarification, pillarWhy(PILLAR, 'the persisted clarification records its missing intake field')).toMatchObject({
      safe_metadata: {
        artifact_proposal: {
          artifact_type: 'process_ticket',
          missing_fields: ['address_district'],
          may_transition: false,
        },
      },
    })
    expect(client.calls.some((call) => call.table === 'service_problems'), pillarWhy(PILLAR, 'missing district is clarified before provider and problem lookup')).toBe(false)
    expect(fetchMock, pillarWhy(PILLAR, 'clarification is deterministic and must not call a provider')).not.toHaveBeenCalled()
  })

  it('customer Kael turn HTTP route rejects a Worker before invoking the service', async () => {
    const client = makeSequenceClient([])
    const services = createEdgeServices({})
    const sendTurn = vi.spyOn(services, 'sendKaelChatTurn')
    const handler = createMobileApiHandler({
      authenticate: async () => workerAuth(client),
      services,
    })

    const response = await handler(new Request(`https://edge.test/mobile-api/kael/chat/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Tôi gửi thêm thông tin.' }),
    }))

    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(sendTurn).not.toHaveBeenCalled()
    expect(client.calls.filter((call) =>
      call.table === 'kael_chat_sessions' || call.table === 'kael_chat_turns',
    )).toHaveLength(0)
  })

  it('customer Kael turn HTTP route rejects an invalid body before invoking the service', async () => {
    const client = makeSequenceClient([])
    const services = createEdgeServices({})
    const sendTurn = vi.spyOn(services, 'sendKaelChatTurn')
    const handler = createMobileApiHandler({
      authenticate: async () => customerAuth(client),
      services,
    })

    const response = await handler(new Request(`https://edge.test/mobile-api/kael/chat/${SESSION_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    }))

    expect(response.status, pillarWhy(PILLAR)).toBe(400)
    expect(sendTurn).not.toHaveBeenCalled()
    expect(client.calls.filter((call) =>
      call.table === 'kael_chat_sessions' || call.table === 'kael_chat_turns',
    )).toHaveLength(0)
  })
})
