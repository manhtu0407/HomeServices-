import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  processLearningQueue,
  queueLearningForBatch,
  type QueuedLearningRow,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/cron/process-learning-queue'
import { processBatchResults } from '../../../../../supabase/functions/mobile-api/_shared/kael/cron/process-batch-results'
import { createLearningSkillCandidate } from '../../../../../supabase/functions/mobile-api/_shared/kael/skills/registry'
import type { LearningSkillInput } from '../../../../../supabase/functions/mobile-api/_shared/kael/skills/registry'

describe('Kael Q4 background optimization', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('queues P7 learning candidates into kael_learning_queue when batch learning is enabled', async () => {
    stubDenoEnv({
      KAEL_LEARNING_READ_ENABLED: 'true',
      KAEL_LEARNING_WRITE_ENABLED: 'true',
      KAEL_LEARNING_KILL_SWITCH: 'false',
      KAEL_LEARNING_AB_PERCENTAGE: '100',
    })
    const client = makeSequenceClient([{ data: null, error: null }])

    const summary = await queueLearningForBatch(client, 'post-A14', learningInput())

    expect(summary.queued).toBeGreaterThan(0)
    const insertCall = client.calls.find((call) => call.table === 'kael_learning_queue')
    expect(insertCall?.operations[0]?.[0]).toBe('insert')
    expect(JSON.stringify(insertCall?.operations[0]?.[1])).toContain('"queue_state":"pending"')
    expect(JSON.stringify(insertCall?.operations[0]?.[1])).toContain('"skill_id":"LS1"')
  })

  it('submits due learning queue rows to Anthropic Message Batches behind Q4 flags', async () => {
    stubDenoEnv({
      KAEL_OPT_BATCH_LEARNING_ENABLED: 'true',
      KAEL_OPT_BATCH_API_ENABLED: 'true',
    })
    const client = makeSequenceClient([
      { data: [queuedRow()], error: null },
      { data: { id: '33333333-3333-4333-8333-333333333333' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'msgbatch_123',
      processing_status: 'in_progress',
      request_counts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
      expires_at: '2026-05-27T00:00:00.000Z',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processLearningQueue(client, { anthropicApiKey: 'anthropic-test' }, { limit: 1 })

    expect(summary).toMatchObject({
      selected: 1,
      submitted: 1,
      provider_batch_id: 'msgbatch_123',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages/batches',
      expect.objectContaining({ method: 'POST' }),
    )
    const requestInit = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const requestBody = JSON.parse(String(requestInit.body))
    expect(requestBody.requests[0].custom_id).toMatch(/^lq_/)
    expect(requestBody.requests[0].params.max_tokens).toBe(800)
  })

  it('polls ended Anthropic batches and writes lifecycle rows from successful results', async () => {
    stubDenoEnv({ KAEL_OPT_BATCH_API_ENABLED: 'true' })
    const customId = 'lq_11111111111141118111111111111111'
    const client = makeSequenceClient([
      {
        data: [{
          id: '33333333-3333-4333-8333-333333333333',
          provider_batch_id: 'msgbatch_123',
          status: 'submitted',
          next_poll_at: '2026-05-26T00:00:00.000Z',
          created_at: '2026-05-26T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      {
        data: [{
          id: '44444444-4444-4444-8444-444444444444',
          batch_id: '33333333-3333-4333-8333-333333333333',
          queue_id: '11111111-1111-4111-8111-111111111111',
          custom_id: customId,
          skill_id: 'LS1',
        }],
        error: null,
      },
      { data: [queuedRow()], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/results')) {
        return new Response(`${JSON.stringify({
          custom_id: customId,
          result: { type: 'succeeded', message: { content: [{ text: '{"ok":true}' }] } },
        })}\n`, { status: 200 })
      }
      return new Response(JSON.stringify({
        id: 'msgbatch_123',
        processing_status: 'ended',
        request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 },
        ended_at: '2026-05-26T01:00:00.000Z',
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processBatchResults(client, { anthropicApiKey: 'anthropic-test' }, { limit: 1 })

    expect(summary).toEqual({ checked: 1, ended: 1, processed_items: 1, failed_items: 0 })
    expect(client.calls.some((call) => call.table === 'kael_rule_lifecycle_log')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('allows admin force polling before next_poll_at without changing the default hourly gate', async () => {
    stubDenoEnv({ KAEL_OPT_BATCH_API_ENABLED: 'true' })
    const customId = 'lq_11111111111141118111111111111111'
    const client = makeSequenceClient([
      {
        data: [{
          id: '33333333-3333-4333-8333-333333333333',
          provider_batch_id: 'msgbatch_force',
          status: 'submitted',
          next_poll_at: '2026-05-26T23:00:00.000Z',
          created_at: '2026-05-26T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      {
        data: [{
          id: '44444444-4444-4444-8444-444444444444',
          batch_id: '33333333-3333-4333-8333-333333333333',
          queue_id: '11111111-1111-4111-8111-111111111111',
          custom_id: customId,
          skill_id: 'LS1',
        }],
        error: null,
      },
      { data: [queuedRow()], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/results')) {
        return new Response(`${JSON.stringify({
          custom_id: customId,
          result: { type: 'succeeded', message: { content: [{ text: '{"ok":true}' }] } },
        })}\n`, { status: 200 })
      }
      return new Response(JSON.stringify({
        id: 'msgbatch_force',
        processing_status: 'ended',
        request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 },
        ended_at: '2026-05-26T01:00:00.000Z',
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processBatchResults(client, { anthropicApiKey: 'anthropic-test' }, {
      limit: 1,
      forcePoll: true,
      now: new Date('2026-05-26T00:05:00.000Z'),
    })

    const batchSelect = client.calls[0]
    expect(summary.processed_items).toBe(1)
    expect(batchSelect.operations.some((operation) => operation[0] === 'lte')).toBe(false)
  })
})

function learningInput(overrides: Partial<LearningSkillInput> = {}): LearningSkillInput {
  return {
    actor_id: '11111111-1111-4111-8111-111111111111',
    actor_role: 'customer',
    job_id: '22222222-2222-4222-8222-222222222222',
    customer_id: '11111111-1111-4111-8111-111111111111',
    worker_id: '55555555-5555-4555-8555-555555555555',
    service_type: 'plumbing',
    problem_slug: 'pipe_leak',
    district_code: 'q7',
    complexity: 'medium',
    baseline_min: 200000,
    baseline_max: 400000,
    final_price: 350000,
    rating: 5,
    review_tags: ['on_time'],
    reviewed_at: '2026-05-26T00:00:00.000Z',
    ...overrides,
  }
}

function queuedRow(): QueuedLearningRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    event_type: 'post-A14',
    skill_id: 'LS1',
    job_id: '22222222-2222-4222-8222-222222222222',
    actor_id: '11111111-1111-4111-8111-111111111111',
    actor_role: 'customer',
    queue_state: 'pending',
    input_payload: learningInput(),
    candidate_payload: createLearningSkillCandidate('LS1', learningInput()),
    attempts: 0,
    created_at: '2026-05-26T00:00:00.000Z',
  }
}

function stubDenoEnv(values: Record<string, string>) {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) => values[name],
    },
  })
}

type QueryFulfilled = { data: unknown; error: { code?: string; message?: string } | null }
type QueryResult = QueryFulfilled | { reject: unknown }
type QueryCall = { table: string; operations: unknown[][] }

function makeSequenceClient(results: QueryResult[]) {
  const calls: QueryCall[] = []
  return {
    calls,
    from(table: string) {
      const call: QueryCall = { table, operations: [] }
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
    then<TResult1 = QueryFulfilled, TResult2 = never>(
      onfulfilled?: ((value: QueryFulfilled) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      const next = results.shift() ?? { data: null, error: null }
      if ('reject' in next) {
        return Promise.reject(next.reject).then(onfulfilled, onrejected)
      }
      return Promise.resolve(next).then(onfulfilled, onrejected)
    },
  }
  return query
}
