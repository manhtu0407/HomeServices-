import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/domains'
import type { PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P191-worker-scope-change-request',
  invariant: 'Worker scope-change requests bind idempotency, durable effects, and provider work to one atomic request boundary',
  authority: ['governance/RULES.md #4', 'governance/RULES.md #7'],
  target: 'supabase/functions/mobile-api/_shared/domains/job/scope-change/request.ts',
  layer: 'integration',
  siblings: ['P12-workflow-transition-composition', 'P87-scope-change-http-authority'],
  mutation: 'run provider work before the idempotency claim or repeat provider work after a replay, allowing duplicate Worker requests to create divergent scope changes',
} as const satisfies PillarManifest

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('direct scope-change idempotency', () => {
  it('replays a completed response before provider work', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = makeSequenceClient([
      { data: jobRow('scope_change_pending'), error: null },
      {
        data: [{
          ok: true,
          error_code: null,
          claimed: false,
          replayed: true,
          response_payload: completedResponse(),
          side_effects_state: completedEffects(),
        }],
        error: null,
      },
    ])

    await expect(createEdgeServices({}).requestScopeChange(context(client), 'job-1', input()))
      .resolves.toEqual(completedResponse())

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'rpc:claim_scope_change_request_atomic',
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['REQUEST_IN_PROGRESS', 'REQUEST_IN_PROGRESS'],
    ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
  ])('rejects %s before provider work', async (rpcCode, apiCode) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = makeSequenceClient([
      { data: jobRow('repairing'), error: null },
      {
        data: [{
          ok: false,
          error_code: rpcCode,
          claimed: false,
          replayed: false,
        }],
        error: null,
      },
    ])

    await expect(createEdgeServices({}).requestScopeChange(context(client), 'job-1', input()))
      .rejects.toMatchObject({ code: apiCode, status: 409 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('replays missing database and learning effects without re-running the provider', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = makeSequenceClient([
      { data: jobRow('scope_change_pending'), error: null },
      {
        data: [{
          ok: true,
          replayed: true,
          response_payload: completedResponse(),
          side_effects_state: pendingEffects(),
        }],
        error: null,
      },
      { data: [{ ok: true, completed: true }], error: null },
      { data: [{ ok: true, completed: true }], error: null },
      { data: [{ ok: false, error_code: 'EFFECT_IN_PROGRESS', claimed: false }], error: null },
    ])

    await expect(createEdgeServices({}).requestScopeChange(context(client), 'job-1', input()))
      .resolves.toEqual(completedResponse())

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'rpc:claim_scope_change_request_atomic',
      'rpc:apply_scope_change_database_effect_atomic',
      'rpc:apply_scope_change_learning_effect_atomic',
      'rpc:claim_scope_change_push_effect_atomic',
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the push lease on duplicate drains and never repeats provider work', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const replay = {
      data: [{
        ok: true,
        replayed: true,
        response_payload: completedResponse(),
        side_effects_state: {
          ...completedEffects(),
          push: { effect_id: '33333333-3333-4333-8333-333333333333', state: 'in_flight' },
        },
      }],
      error: null,
    }
    const lease = {
      data: [{ ok: false, error_code: 'EFFECT_IN_PROGRESS', claimed: false }],
      error: null,
    }
    const client = makeSequenceClient([
      { data: jobRow('scope_change_pending'), error: null }, replay, lease,
      { data: jobRow('scope_change_pending'), error: null }, replay, lease,
    ])

    await createEdgeServices({}).requestScopeChange(context(client), 'job-1', input())
    await createEdgeServices({}).requestScopeChange(context(client), 'job-1', input())

    expect(client.calls.filter((call) =>
      call.table === 'rpc:claim_scope_change_push_effect_atomic'
    )).toHaveLength(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adds the stable effect id to the at-least-once Expo payload', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Deno', {
      env: {
        get: vi.fn((name: string) => ({
          KAEL_AUTONOMY_FULL_ENABLED: 'true',
          NESTSCOUT_ENVIRONMENT: 'production',
          HARNESS_RELEASE_ID: 'release-1',
        }[name])),
      },
    })
    const client = makeSequenceClient([
      { data: jobRow('scope_change_pending'), error: null },
      {
        data: [{
          ok: true,
          replayed: true,
          response_payload: completedResponse(),
          side_effects_state: {
            ...completedEffects(),
            push: { effect_id: '33333333-3333-4333-8333-333333333333', state: 'pending' },
          },
        }],
        error: null,
      },
      {
        data: [{
          ok: true,
          claimed: true,
          completed: false,
          effect_id: '33333333-3333-4333-8333-333333333333',
          customer_id: 'customer-1',
        }],
        error: null,
      },
      { data: { state: 'reserved', reservation_id: 'reservation-1' }, error: null },
      { data: { allowed: true, state: 'closed', retry_after_ms: 0, probe_token: null }, error: null },
      {
        data: [{
          id: 'token-1',
          user_id: 'customer-1',
          push_token: 'ExponentPushToken[customer-1]',
          updated_at: '2026-09-15T00:00:00.000Z',
        }],
        error: null,
      },
      { data: true, error: null },
      { data: true, error: null },
      { data: true, error: null },
    ])

    await createEdgeServices({}).requestScopeChange(context(client), 'job-1', input())

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(payload[0].data.scope_effect_id).toBe('33333333-3333-4333-8333-333333333333')
    expect(client.calls.at(-1)?.table).toBe('rpc:complete_scope_change_push_effect_atomic')
  })
})

function input() {
  return {
    client_request_id: '11111111-1111-4111-8111-111111111111',
    new_description: 'Replace the concealed cracked pipe section behind the wall.',
    reason: 'The original scope did not include the concealed damaged section.',
    photo_urls: [],
  }
}

function jobRow(status: string) {
  return {
    id: 'job-1',
    status,
    customer_id: 'customer-1',
    worker_id: 'worker-1',
    service_type: 'plumbing',
    description: 'Repair the visible pipe leak.',
    address_district: 'q7',
    kael_problem_identified: 'pipe_leak',
    kael_complexity: 'medium',
    kael_price_min: 200000,
    kael_price_max: 400000,
  }
}

function completedResponse() {
  return {
    scope_change_id: 'scope-1',
    job_id: 'job-1',
    status: 'waiting_customer_decision',
    created_at: '2026-07-15T00:00:00.000Z',
    kael_estimate: {
      price_min: 260000,
      price_max: 480000,
      confidence: 0.82,
      problem_summary: 'A concealed cracked pipe section requires replacement.',
      advisory: 'The customer must approve the changed scope.',
      complexity_assessment: 'medium',
      disclaimer: 'Kael estimate for explicit customer confirmation.',
      fallback_used: false,
    },
    anti_fraud: { score: 0.1, challenge_required: false },
    worker_challenge: { challenge_required: false },
    customer_card: { decision_required: true },
  }
}

function completedEffects() {
  return {
    database: { effect_id: '11111111-1111-4111-8111-111111111111', state: 'completed' },
    learning: { effect_id: '22222222-2222-4222-8222-222222222222', state: 'completed' },
    push: { effect_id: '33333333-3333-4333-8333-333333333333', state: 'completed' },
  }
}

function pendingEffects() {
  return {
    database: { effect_id: '11111111-1111-4111-8111-111111111111', state: 'pending' },
    learning: { effect_id: '22222222-2222-4222-8222-222222222222', state: 'pending' },
    push: { effect_id: '33333333-3333-4333-8333-333333333333', state: 'pending' },
  }
}

function context(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    success: true,
    user: { id: 'worker-1' },
    role: 'worker',
    supabase: client,
  }
}

type QueryResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

type QueryCall = {
  table: string;
  operations: Array<[string, ...unknown[]]>;
}

function makeSequenceClient(results: QueryResult[]) {
  const calls: QueryCall[] = []
  return {
    calls,
    from(table: string) {
      const call: QueryCall = { table, operations: [] }
      calls.push(call)
      return makeQuery(call, results)
    },
    rpc(name: string, args?: Record<string, unknown>) {
      const call: QueryCall = { table: `rpc:${name}`, operations: [['rpc', name, args]] }
      calls.push(call)
      return makeQuery(call, results)
    },
  }
}

function makeQuery(call: QueryCall, results: QueryResult[]) {
  const query = {
    select(columns?: string) {
      call.operations.push(['select', columns])
      return query
    },
    insert(value: unknown) {
      call.operations.push(['insert', value])
      return query
    },
    update(value: unknown) {
      call.operations.push(['update', value])
      return query
    },
    eq(column: string, value: unknown) {
      call.operations.push(['eq', column, value])
      return query
    },
    in(column: string, value: unknown[]) {
      call.operations.push(['in', column, value])
      return query
    },
    gte(column: string, value: unknown) {
      call.operations.push(['gte', column, value])
      return query
    },
    lte(column: string, value: unknown) {
      call.operations.push(['lte', column, value])
      return query
    },
    order(column: string, options?: unknown) {
      call.operations.push(['order', column, options])
      return query
    },
    limit(value: number) {
      call.operations.push(['limit', value])
      return query
    },
    single() {
      call.operations.push(['single'])
      return query
    },
    maybeSingle() {
      call.operations.push(['maybeSingle'])
      return query
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(results.shift() ?? { data: null, error: null })
        .then(onfulfilled, onrejected)
    },
  }
  return query
}
