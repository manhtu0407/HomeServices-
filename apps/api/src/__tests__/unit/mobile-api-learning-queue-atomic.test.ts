import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  processLearningQueue,
  type QueuedLearningRow,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/cron/process-learning-queue'
import { createLearningSkillCandidate } from '../../../../../supabase/functions/mobile-api/_shared/kael/skills/registry'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('processLearningQueue atomic ownership', () => {
  it('claims rows before force-realtime processing and binds the final write to that claim', async () => {
    enableBatchLearning()
    const client = makeSequenceClient([
      { data: [queuedRow()], error: null },
      {
        data: [{ completed_queue_id: queuedRow().id, replayed: false }],
        error: null,
      },
    ])

    await expect(processLearningQueue(client, {}, {
      forceRealtime: true,
      limit: 1,
      now: new Date('2026-07-15T00:00:00.000Z'),
    })).resolves.toMatchObject({ selected: 1, realtime_fallback: 1 })

    expect(client.calls[0]?.table).toBe('rpc:claim_kael_learning_queue_atomic')
    const claimArgs = client.calls[0]?.operations[0]?.[2] as Record<string, unknown> | undefined
    const claimId = claimArgs?.p_claim_id
    expect(claimId).toEqual(expect.any(String))
    const completion = client.calls.find((call) =>
      call.table === 'rpc:complete_kael_learning_queue_realtime_atomic'
    )
    expect(completion?.operations).toContainEqual([
      'rpc',
      'complete_kael_learning_queue_realtime_atomic',
      expect.objectContaining({
        p_claim_id: claimId,
        p_queue_ids: [queuedRow().id],
      }),
    ])
    expect(client.calls.some((call) => call.table === 'kael_learning_queue')).toBe(false)
  })

  it('rejects instead of reporting success when the claimed queue write fails', async () => {
    enableBatchLearning()
    const client = makeSequenceClient([
      { data: [queuedRow()], error: null },
      { data: null, error: { code: 'WRITE_FAILED' } },
    ])

    await expect(processLearningQueue(client, {}, {
      forceRealtime: true,
      limit: 1,
      now: new Date('2026-07-15T00:00:00.000Z'),
    })).rejects.toThrow('LEARNING_QUEUE_COMPLETION_FAILED:WRITE_FAILED')
  })

  it('rejects when a DeepSeek batch-item outcome cannot be persisted', async () => {
    enableBatchLearning({ KAEL_OPT_BATCH_API_ENABLED: 'true' })
    const client = makeSequenceClient([
      { data: [queuedRow()], error: null },
      { data: { id: '44444444-4444-4444-8444-444444444444' }, error: null },
      { data: null, error: null },
      { data: { allowed: true, blocked_scope: null, reservation_id: 1 }, error: null },
      { data: null, error: null },
      { data: null, error: { code: 'WRITE_FAILED' } },
    ])
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))

    await expect(processLearningQueue(client, {
      deepseekApiKey: 'deepseek-test',
    }, {
      limit: 1,
      now: new Date('2026-07-15T00:00:00.000Z'),
    })).rejects.toThrow('DEEPSEEK_BATCH_ITEM_WRITE_FAILED:WRITE_FAILED')
  })

  it('rejects when the atomic DeepSeek learning effect cannot be committed', async () => {
    enableBatchLearning({
      KAEL_OPT_BATCH_API_ENABLED: 'true',
      KAEL_LEARNING_READ_ENABLED: 'true',
      KAEL_LEARNING_WRITE_ENABLED: 'true',
      KAEL_LEARNING_KILL_SWITCH: 'false',
      KAEL_LEARNING_AB_PERCENTAGE: '100',
    })
    const row = manualReviewQueuedRow()
    const client = makeSequenceClient([
      { data: [row], error: null },
      { data: { id: '44444444-4444-4444-8444-444444444444' }, error: null },
      { data: null, error: null },
      { data: { allowed: true, blocked_scope: null, reservation_id: 1 }, error: null },
      { data: null, error: null },
      { data: null, error: { code: 'WRITE_FAILED' } },
    ])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ candidate: row.candidate_payload }) } }],
      usage: { prompt_tokens: 80, completion_tokens: 20 },
    }), { status: 200 })))

    await expect(processLearningQueue(client, {
      deepseekApiKey: 'deepseek-test',
    }, {
      limit: 1,
      now: new Date('2026-07-15T00:00:00.000Z'),
    })).rejects.toThrow('LEARNING_EFFECT_COMMIT_FAILED')

    expect(client.calls.some((call) =>
      call.table === 'rpc:commit_kael_learning_effect_atomic'
    )).toBe(true)
    expect(client.calls.filter((call) => call.table === 'kael_learning_queue')).toHaveLength(0)
    expect(client.calls.filter((call) => call.table === 'kael_ai_batches').at(-1)?.operations)
      .toContainEqual([
        'update',
        expect.objectContaining({
          status: 'failed',
          processing_count: 0,
          error_code: 'LEARNING_EFFECT_COMMIT_FAILED',
        }),
      ])
  })
})

function queuedRow(): QueuedLearningRow {
  const input = {
    actor_id: '11111111-1111-4111-8111-111111111111',
    actor_role: 'customer',
    job_id: '22222222-2222-4222-8222-222222222222',
    service_type: 'plumbing' as const,
    problem_slug: 'pipe_leak',
  }
  return {
    id: '33333333-3333-4333-8333-333333333333',
    event_type: 'post-A14',
    skill_id: 'LS1',
    job_id: input.job_id,
    actor_id: input.actor_id,
    actor_role: input.actor_role,
    queue_state: 'processing',
    input_payload: input,
    candidate_payload: createLearningSkillCandidate('LS1', input),
    attempts: 1,
    created_at: '2026-07-15T00:00:00.000Z',
  }
}

function manualReviewQueuedRow(): QueuedLearningRow {
  const input = {
    actor_id: '11111111-1111-4111-8111-111111111111',
    actor_role: 'customer',
    job_id: '22222222-2222-4222-8222-222222222222',
    service_type: 'plumbing' as const,
    problem_slug: 'pipe_leak',
    evidence_snapshot: {
      evidence_count: 5,
      confidence: 0.8,
      completed_transaction_count: 5,
      recent_contradiction_ratio: 0,
    },
  }
  return {
    ...queuedRow(),
    skill_id: 'LS5',
    input_payload: input,
    candidate_payload: createLearningSkillCandidate('LS5', input),
  }
}

function enableBatchLearning(overrides: Record<string, string> = {}) {
  const values = {
    KAEL_OPT_BATCH_LEARNING_ENABLED: 'true',
    ...overrides,
  }
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) => values[name as keyof typeof values],
    },
  })
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
