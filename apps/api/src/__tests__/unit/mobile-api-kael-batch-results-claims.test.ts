import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  processBatchResults,
  processLearningCandidateResponse,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/learning/cron/process-batch-results'
import type {
  LearningQueueDbClient,
  QueuedLearningRow,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/learning/cron/process-learning-queue'
import {
  createLearningSkillCandidate,
  type LearningSkillInput,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/learning/skills/registry'

describe('Kael batch-result claim and persistence failures', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fails closed when the atomic claim RPC fails', async () => {
    stubBatchEnv()
    const client = makeSequenceClient([
      { data: null, error: { code: 'XX001' } },
    ])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processBatchResults(client, { anthropicApiKey: 'test-key' })

    expect(summary).toEqual({
      checked: 0,
      ended: 0,
      processed_items: 0,
      failed_items: 0,
      error_code: 'BATCH_CLAIM_FAILED',
    })
    expect(client.calls[0]).toMatchObject({
      table: 'rpc:claim_kael_ai_batch_results',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not finalize a batch when its item rows cannot be loaded', async () => {
    stubBatchEnv()
    const client = makeSequenceClient([
      { data: [claimedBatch()], error: null },
      { data: null, error: null },
      { data: null, error: { code: 'XX002' } },
      { data: null, error: null },
    ])
    vi.stubGlobal('fetch', endedBatchFetch([]))

    const summary = await processBatchResults(client, { anthropicApiKey: 'test-key' })

    expect(summary).toMatchObject({ error_code: 'BATCH_ITEM_LOAD_FAILED' })
    expect(client.calls.some((call) =>
      call.table === 'rpc:complete_kael_ai_batch_results_claim'
    )).toBe(false)
    expect(client.calls.some((call) =>
      call.table === 'rpc:release_kael_ai_batch_results_claims'
    )).toBe(true)
  })

  it('releases the claim when the remote batch status cannot be persisted', async () => {
    stubBatchEnv()
    const failureStartedAt = Date.now()
    const client = makeSequenceClient([
      { data: [claimedBatch()], error: null },
      { data: null, error: { code: 'XX008' } },
      { data: null, error: null },
    ])
    vi.stubGlobal('fetch', endedBatchFetch([]))

    const summary = await processBatchResults(client, { anthropicApiKey: 'test-key' })

    expect(summary).toMatchObject({ error_code: 'BATCH_STATUS_WRITE_FAILED' })
    expect(client.calls.some((call) =>
      call.table === 'rpc:record_kael_ai_batch_poll'
    )).toBe(true)
    expect(client.calls.some((call) => call.table === 'kael_ai_batches')).toBe(false)
    const releaseCall = client.calls.find((call) =>
      call.table === 'rpc:release_kael_ai_batch_results_claims'
    )
    expect(releaseCall).toBeDefined()
    const releaseArgs = releaseCall?.operations[0]?.[2] as Record<string, unknown> | undefined
    expect(Date.parse(String(releaseArgs?.p_retry_at))).toBeGreaterThanOrEqual(
      failureStartedAt + 5 * 60 * 1000,
    )
  })

  it('does not collapse a queue read failure into an empty successful batch', async () => {
    stubBatchEnv()
    const client = makeSequenceClient([
      { data: [claimedBatch()], error: null },
      { data: null, error: null },
      { data: [batchItem()], error: null },
      { data: null, error: { code: 'XX003' } },
      { data: null, error: null },
    ])
    vi.stubGlobal('fetch', endedBatchFetch([]))

    const summary = await processBatchResults(client, { anthropicApiKey: 'test-key' })

    expect(summary).toMatchObject({ error_code: 'LEARNING_QUEUE_LOAD_FAILED' })
    expect(client.calls.some((call) =>
      call.table === 'rpc:complete_kael_ai_batch_results_claim'
    )).toBe(false)
  })

  it('fails when a referenced queue row disappears instead of committing a false success', async () => {
    stubBatchEnv()
    const client = makeSequenceClient([
      { data: [claimedBatch()], error: null },
      { data: null, error: null },
      { data: [batchItem()], error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    vi.stubGlobal('fetch', endedBatchFetch([failedProviderResult()]))

    const summary = await processBatchResults(client, { anthropicApiKey: 'test-key' })

    expect(summary).toMatchObject({ error_code: 'LEARNING_QUEUE_ROW_MISSING' })
    expect(client.calls.some((call) =>
      call.table === 'rpc:commit_kael_ai_batch_item_result'
    )).toBe(false)
  })

  it('does not finalize when provider results omit a pending batch item', async () => {
    stubBatchEnv()
    const client = makeSequenceClient([
      { data: [claimedBatch()], error: null },
      { data: null, error: null },
      { data: [batchItem()], error: null },
      { data: [queuedRow()], error: null },
      { data: null, error: null },
    ])
    vi.stubGlobal('fetch', endedBatchFetch([]))

    const summary = await processBatchResults(client, { anthropicApiKey: 'test-key' })

    expect(summary).toMatchObject({ error_code: 'BATCH_RESULTS_INCOMPLETE' })
    expect(client.calls.some((call) =>
      call.table === 'rpc:complete_kael_ai_batch_results_claim'
    )).toBe(false)
  })

  it('rejects duplicate provider custom IDs before learning side effects run', async () => {
    stubBatchEnv()
    const duplicate = failedProviderResult()
    const client = makeSequenceClient([
      { data: [claimedBatch()], error: null },
      { data: null, error: null },
      { data: [batchItem()], error: null },
      { data: [queuedRow()], error: null },
      { data: null, error: null },
    ])
    vi.stubGlobal('fetch', endedBatchFetch([duplicate, duplicate]))

    const summary = await processBatchResults(client, { anthropicApiKey: 'test-key' })

    expect(summary).toMatchObject({ error_code: 'BATCH_RESULTS_MISMATCH' })
    expect(client.calls.some((call) =>
      call.table === 'rpc:commit_kael_ai_batch_item_result'
    )).toBe(false)
  })

  it('does not process an item after losing its batch claim', async () => {
    stubBatchEnv()
    const client = makeFailedResultClient([
      { data: null, error: { code: 'XX004' } },
      { data: null, error: null },
    ])
    vi.stubGlobal('fetch', endedBatchFetch([failedProviderResult()]))

    const summary = await processBatchResults(client, { anthropicApiKey: 'test-key' })

    expect(summary).toMatchObject({
      processed_items: 0,
      failed_items: 0,
      error_code: 'BATCH_CLAIM_RENEW_FAILED',
    })
    expect(client.calls.some((call) =>
      call.table === 'rpc:complete_kael_ai_batch_results_claim'
    )).toBe(false)
  })

  it('does not count or finalize an item whose atomic item-and-queue commit fails', async () => {
    stubBatchEnv()
    const client = makeFailedResultClient([
      { data: null, error: null },
      { data: null, error: { code: 'XX005' } },
      { data: null, error: null },
    ])
    vi.stubGlobal('fetch', endedBatchFetch([failedProviderResult()]))

    const summary = await processBatchResults(client, { anthropicApiKey: 'test-key' })

    expect(summary).toMatchObject({
      processed_items: 0,
      failed_items: 0,
      error_code: 'BATCH_ITEM_COMMIT_FAILED',
    })
    expect(client.calls.some((call) =>
      call.table === 'rpc:complete_kael_ai_batch_results_claim'
    )).toBe(false)
  })

  it('surfaces finalization failure instead of reporting the batch processed', async () => {
    stubBatchEnv()
    const client = makeFailedResultClient([
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: { code: 'P0001' } },
      { data: null, error: null },
    ])
    vi.stubGlobal('fetch', endedBatchFetch([failedProviderResult()]))

    const summary = await processBatchResults(client, { anthropicApiKey: 'test-key' })

    expect(summary).toMatchObject({
      processed_items: 0,
      failed_items: 1,
      error_code: 'BATCH_FINALIZE_FAILED',
    })
  })

  it('fails closed when LS1 evidence cannot be loaded', async () => {
    stubBatchEnv()
    const queue = queuedRow()
    const client = makeSequenceClient([
      { data: null, error: { code: 'XX007' } },
    ])

    const outcome = await processLearningCandidateResponse(
      client,
      queue,
      { content: [{ text: JSON.stringify({ candidate: queue.candidate_payload }) }] },
      new Date('2026-07-15T00:00:00.000Z'),
    )

    expect(outcome).toEqual({
      ok: false,
      queue_state: 'failed',
      error_code: 'LEARNING_EVIDENCE_LOAD_FAILED',
      effect: null,
    })
  })

  it('prepares manual-review effects without writing candidates or lifecycle rows', async () => {
    stubBatchEnv()
    const input = learningInput({ evidence_snapshot: {
      evidence_count: 5,
      confidence: 0.8,
      completed_transaction_count: 5,
      recent_contradiction_ratio: 0,
    } })
    const queue = queuedRow({
      skill_id: 'LS5',
      input_payload: input,
      candidate_payload: createLearningSkillCandidate('LS5', input),
    })
    const client = makeSequenceClient([])

    const outcome = await processLearningCandidateResponse(
      client,
      queue,
      { content: [{ text: JSON.stringify({ candidate: queue.candidate_payload }) }] },
      new Date('2026-07-15T00:00:00.000Z'),
    )

    expect(outcome).toMatchObject({
      ok: true,
      queue_state: 'manual_review',
      effect: {
        schema: 'kael_learning_effect.v1',
        mode: 'candidate',
        candidate: { status: 'manual_review' },
        lifecycle: {
          gate_state: 'manual_review',
          lifecycle_state: 'manual_review',
        },
      },
    })
    expect(client.calls).toEqual([])
  })
})

function makeFailedResultClient(tail: QueryResult[]) {
  return makeSequenceClient([
    { data: [claimedBatch()], error: null },
    { data: null, error: null },
    { data: [batchItem()], error: null },
    { data: [queuedRow()], error: null },
    ...tail,
  ])
}

function claimedBatch() {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    provider_batch_id: 'msgbatch_claimed',
    status: 'submitted',
    next_poll_at: '2026-07-15T00:00:00.000Z',
    created_at: '2026-07-15T00:00:00.000Z',
  }
}

function batchItem() {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    batch_id: claimedBatch().id,
    queue_id: queuedRow().id,
    custom_id: 'lq_11111111111141118111111111111111',
    skill_id: 'LS1',
    request_payload: {},
  }
}

function failedProviderResult() {
  return {
    custom_id: batchItem().custom_id,
    result: {
      type: 'errored',
      error: { type: 'invalid_request' },
    },
  }
}

function endedBatchFetch(results: unknown[]) {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/results')) {
      return new Response(results.map((result) => JSON.stringify(result)).join('\n'), { status: 200 })
    }
    return new Response(JSON.stringify({
      id: 'msgbatch_claimed',
      processing_status: 'ended',
      request_counts: { processing: 0, succeeded: 0, errored: results.length, canceled: 0, expired: 0 },
      ended_at: '2026-07-15T00:01:00.000Z',
    }), { status: 200 })
  })
}

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
    reviewed_at: '2026-07-15T00:00:00.000Z',
    ...overrides,
  }
}

function queuedRow(overrides: Partial<QueuedLearningRow> = {}): QueuedLearningRow {
  const input = isRecord(overrides.input_payload)
    ? overrides.input_payload as LearningSkillInput
    : learningInput()
  return {
    id: '11111111-1111-4111-8111-111111111111',
    event_type: 'post-A14',
    skill_id: 'LS1',
    job_id: '22222222-2222-4222-8222-222222222222',
    actor_id: '11111111-1111-4111-8111-111111111111',
    actor_role: 'customer',
    queue_state: 'batched',
    input_payload: input,
    candidate_payload: createLearningSkillCandidate('LS1', input),
    attempts: 1,
    created_at: '2026-07-15T00:00:00.000Z',
    ...overrides,
  }
}

function stubBatchEnv() {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) => ({
        KAEL_OPT_BATCH_API_ENABLED: 'true',
        KAEL_LEARNING_READ_ENABLED: 'true',
        KAEL_LEARNING_WRITE_ENABLED: 'true',
        KAEL_LEARNING_KILL_SWITCH: 'false',
        KAEL_LEARNING_AB_PERCENTAGE: '100',
      })[name],
    },
  })
}

type QueryError = { code?: string; message?: string }
type QueryResult = { data: unknown; error: QueryError | null }
type QueryCall = { table: string; operations: unknown[][] }

function makeSequenceClient(results: QueryResult[]) {
  const calls: QueryCall[] = []
  const client = {
    calls,
    from(table: string) {
      const call = { table, operations: [] } satisfies QueryCall
      calls.push(call)
      return makeQuery(call, results)
    },
    rpc(name: string, args?: Record<string, unknown>) {
      const call = { table: `rpc:${name}`, operations: [['rpc', name, args]] } satisfies QueryCall
      calls.push(call)
      return makeQuery(call, results)
    },
  }
  return client as typeof client & LearningQueueDbClient
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
    in(column: string, values: unknown[]) {
      call.operations.push(['in', column, values])
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
    order(column: string, options?: Record<string, unknown>) {
      call.operations.push(['order', column, options])
      return query
    },
    limit(count: number) {
      call.operations.push(['limit', count])
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
      const result = results.shift() ?? { data: null, error: null }
      return Promise.resolve(result).then(onfulfilled, onrejected)
    },
  }
  return query
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
