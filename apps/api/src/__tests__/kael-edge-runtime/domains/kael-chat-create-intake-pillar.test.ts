import { describe, expect, it } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P342-customer-kael-intake-create',
  invariant:
    'customer Kael intake creation persists the initial turn under the authenticated customer and refuses an unfinished duplicate create',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes stay behind the mobile-api Edge boundary)',
    'governance/structures/customer-workflow.md #A3 (kael.chat.create owns the Customer intake session)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/create.ts',
  layer: 'integration',
  siblings: ['P19-job-access-ownership', 'P46-stage1-customer-intake-mode'],
  mutation:
    'drop the authenticated customer binding on the session write or accept an unfinished idempotent create; the owner and pending assertions turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const CUSTOMER_ID = '34200000-0000-4000-8000-000000000001'
const SESSION_ID = '34200000-0000-4000-8000-000000000002'
const TURN_ID = '34200000-0000-4000-8000-000000000003'
const REQUEST_ID = '34200000-0000-4000-8000-000000000004'

function customerContext(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    success: true,
    user: { id: CUSTOMER_ID },
    role: 'customer',
    supabase: client,
  }
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    job_id: null,
    customer_id: CUSTOMER_ID,
    service_type: 'plumbing',
    status: 'active',
    case_phase: 'analysis',
    diagnosis_scope: null,
    scheduled_at: null,
    started_at: '2026-10-08T00:00:00.000Z',
    estimate_ready_at: null,
    total_turns: 1,
    total_cost_usd: 0,
    safe_metadata: { initial_turn_expected: true },
    created_at: '2026-10-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('customer Kael intake create', () => {
  it('creates an owner-bound intake session and persists the initial customer turn', async () => {
    const createdSession = session({ total_turns: 0 })
    const createdTurn = {
      id: TURN_ID,
      session_id: SESSION_ID,
      turn_index: 1,
      role: 'customer',
      content_type: 'text',
      text_content: 'Vòi nước nhà tôi bị rò rỉ',
      media_refs: [],
      safe_metadata: {},
      created_at: '2026-10-08T00:00:00.000Z',
    }
    const client = makeSequenceClient([], {
      check_kael_chat_rate: [{ data: [{ allowed: true }], error: null }],
    }, {
      kael_chat_sessions: [
        { data: null, error: null },
        { data: createdSession, error: null },
        { data: { id: SESSION_ID }, error: null },
        { data: session(), error: null },
      ],
      kael_customer_conversations: [{ data: { id: SESSION_ID }, error: null }],
      kael_chat_turns: [
        { data: { id: TURN_ID }, error: null },
        { data: [createdTurn], error: null },
      ],
    })

    const result = await createEdgeServices({}).createKaelChat(customerContext(client), {
      service_type: 'plumbing',
      message: 'Vòi nước nhà tôi bị rò rỉ',
      problem_chips: [],
      photo_urls: [],
      client_request_id: REQUEST_ID,
      defer_analysis: true,
    })

    expect(result.session.id, pillarWhy(PILLAR, 'the new intake returns the session created for this customer')).toBe(SESSION_ID)
    expect(result.session.customer_id).toBe(CUSTOMER_ID)
    expect(result.turns).toHaveLength(1)
    expect(result.turns[0]).toMatchObject({
      id: TURN_ID,
      session_id: SESSION_ID,
      role: 'customer',
      text_content: 'Vòi nước nhà tôi bị rò rỉ',
    })

    const sessionInsert = client.calls.find((call) =>
      call.table === 'kael_chat_sessions' &&
      call.operations.some((operation) => operation[0] === 'insert'),
    )
    expect(sessionInsert?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        customer_id: CUSTOMER_ID,
        client_request_id: REQUEST_ID,
        service_type: 'plumbing',
      }),
    ])
    const turnInsert = client.calls.find((call) =>
      call.table === 'kael_chat_turns' &&
      call.operations.some((operation) => operation[0] === 'insert'),
    )
    expect(turnInsert?.operations).toContainEqual([
      'insert',
      expect.objectContaining({ session_id: SESSION_ID, role: 'customer', turn_index: 1 }),
    ])
  })

  it('refuses a duplicate create while the owner session is still pending', async () => {
    const client = makeSequenceClient([], {}, {
      kael_chat_sessions: [{
        data: {
          id: SESSION_ID,
          job_id: null,
          status: 'active',
          estimate_ready_at: null,
          total_turns: 0,
          safe_metadata: { initial_turn_expected: true },
        },
        error: null,
      }],
    })

    await expect(createEdgeServices({}).createKaelChat(customerContext(client), {
      service_type: 'plumbing',
      message: 'Vòi nước nhà tôi bị rò rỉ',
      problem_chips: [],
      photo_urls: [],
      client_request_id: REQUEST_ID,
      defer_analysis: true,
    })).rejects.toMatchObject({ code: 'SESSION_PENDING', status: 409 })

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].operations).toContainEqual(['eq', 'customer_id', CUSTOMER_ID])
    expect(client.calls[0].operations).toContainEqual(['eq', 'client_request_id', REQUEST_ID])
  })
})
