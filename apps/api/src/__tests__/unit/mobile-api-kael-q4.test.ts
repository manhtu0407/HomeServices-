import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  processLearningQueue,
  queueLearningForBatch,
  type QueuedLearningRow,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/cron/process-learning-queue'
import {
  parseBatchLearningCandidate,
  processBatchResults,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/cron/process-batch-results'
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

  it('runs due post-job learning through DeepSeek V4 Pro with structured output', async () => {
    stubDenoEnv({
      KAEL_OPT_BATCH_LEARNING_ENABLED: 'true',
      KAEL_OPT_BATCH_API_ENABLED: 'true',
      KAEL_LEARNING_READ_ENABLED: 'true',
      KAEL_LEARNING_WRITE_ENABLED: 'true',
      KAEL_LEARNING_KILL_SWITCH: 'false',
      KAEL_LEARNING_AB_PERCENTAGE: '100',
    })
    const input = learningInput({ evidence_snapshot: gatePass() })
    const row = queuedRow({
      skill_id: 'LS5',
      input_payload: input,
      candidate_payload: createLearningSkillCandidate('LS5', input),
    })
    const client = makeSequenceClient([
      { data: [row], error: null },
      { data: { id: '33333333-3333-4333-8333-333333333333' }, error: null },
      { data: null, error: null },
      { data: { allowed: true, blocked_scope: null, reservation_id: 1 }, error: null },
      { data: null, error: null },
      { data: { id: '66666666-6666-4666-8666-666666666666' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ candidate: row.candidate_payload }) } }],
      usage: { prompt_tokens: 80, completion_tokens: 20 },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processLearningQueue(client, { deepseekApiKey: 'deepseek-test' }, { limit: 1 })

    expect(summary).toMatchObject({
      selected: 1,
      submitted: 1,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
    const requestInit = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const requestBody = JSON.parse(String(requestInit.body))
    expect(requestBody).toMatchObject({
      model: 'deepseek-v4-pro',
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
      response_format: { type: 'json_object' },
    })
    expect(client.calls.find((call) => call.table === 'kael_ai_batches')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({ provider: 'deepseek', purpose: 'post_job_learning' }),
    ])
  })

  it('falls back to the Sonnet 5 Anthropic batch when DeepSeek cannot run', async () => {
    stubDenoEnv({
      KAEL_OPT_BATCH_LEARNING_ENABLED: 'true',
      KAEL_OPT_BATCH_API_ENABLED: 'true',
    })
    const client = makeSequenceClient([
      { data: [queuedRow()], error: null },
      { data: { id: '33333333-3333-4333-8333-333333333331' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: '33333333-3333-4333-8333-333333333332' }, error: null },
      { data: { allowed: true, blocked_scope: null, reservation_id: 42 }, error: null },
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

    expect(summary).toMatchObject({ selected: 1, submitted: 1, provider_batch_id: 'msgbatch_123' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages/batches',
      expect.objectContaining({ method: 'POST' }),
    )
    const requestInit = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    const requestBody = JSON.parse(String(requestInit.body))
    expect(requestBody.requests[0].params.model).toBe('claude-sonnet-5')
    expect(requestBody.requests[0].params).not.toHaveProperty('temperature')
    expect(requestInit.signal).toBeInstanceOf(AbortSignal)
    expect(client.calls.some((call) => call.table === 'rpc:reserve_kael_ai_spend')).toBe(true)
    expect(JSON.stringify(client.calls)).toContain('"kael_spend_reservation_id":42')
  })

  it('does not bypass the spend cap through the Anthropic batch fallback', async () => {
    stubDenoEnv({
      KAEL_OPT_BATCH_LEARNING_ENABLED: 'true',
      KAEL_OPT_BATCH_API_ENABLED: 'true',
    })
    const client = makeSequenceClient([
      { data: [queuedRow()], error: null },
      { data: { id: '33333333-3333-4333-8333-333333333331' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: '33333333-3333-4333-8333-333333333332' }, error: null },
      { data: { allowed: false, blocked_scope: 'global_daily', reservation_id: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processLearningQueue(client, {
      anthropicApiKey: 'anthropic-test',
    }, { limit: 1 })

    expect(summary).toMatchObject({ selected: 1, submitted: 0, error_code: 'SPEND_CAP' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(client.calls.some((call) => call.table === 'rpc:reserve_kael_ai_spend')).toBe(true)
  })

  it('does not bypass the kill switch or durable circuit through a direct Anthropic batch route', async () => {
    stubDenoEnv({
      KAEL_OPT_BATCH_LEARNING_ENABLED: 'true',
      KAEL_OPT_BATCH_API_ENABLED: 'true',
      KAEL_AI_KILL_SWITCH: 'true',
    })
    const killSwitchFetch = vi.fn()
    vi.stubGlobal('fetch', killSwitchFetch)
    const killSwitchResult = await processLearningQueue(
      makeSequenceClient([{ data: [queuedRow()], error: null }]),
      { anthropicApiKey: 'anthropic-test' },
      { limit: 1, model: 'claude-sonnet-5' },
    )
    expect(killSwitchResult).toMatchObject({ error_code: 'AI_DISABLED', submitted: 0 })
    expect(killSwitchFetch).not.toHaveBeenCalled()

    stubDenoEnv({
      KAEL_OPT_BATCH_LEARNING_ENABLED: 'true',
      KAEL_OPT_BATCH_API_ENABLED: 'true',
    })
    const circuitFetch = vi.fn()
    vi.stubGlobal('fetch', circuitFetch)
    const circuitResult = await processLearningQueue(
      makeSequenceClient([{ data: [queuedRow()], error: null }]),
      {
        anthropicApiKey: 'anthropic-test',
        durableGuardsEnabled: true,
        durableGuardClient: {
          rpc: vi.fn(async (name: string) => ({
            data: name === 'is_circuit_open' ? true : null,
            error: null,
          })),
        },
      },
      { limit: 1, model: 'claude-sonnet-5' },
    )
    expect(circuitResult).toMatchObject({ error_code: 'OPEN_CIRCUIT', submitted: 0 })
    expect(circuitFetch).not.toHaveBeenCalled()
  })

  it('falls back on invalid DeepSeek structured output without persisting raw provider content', async () => {
    stubDenoEnv({
      KAEL_OPT_BATCH_LEARNING_ENABLED: 'true',
      KAEL_OPT_BATCH_API_ENABLED: 'true',
    })
    const client = makeSequenceClient([
      { data: [queuedRow()], error: null },
      { data: { id: '33333333-3333-4333-8333-333333333334' }, error: null },
      { data: null, error: null },
      { data: { allowed: true, blocked_scope: null, reservation_id: 1 }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: '33333333-3333-4333-8333-333333333335' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const rawProviderContent = JSON.stringify({ unexpected_raw: 'never store this' })
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: rawProviderContent } }],
          usage: { prompt_tokens: 80, completion_tokens: 20 },
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        id: 'msgbatch_schema_fallback',
        processing_status: 'in_progress',
        request_counts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processLearningQueue(client, {
      deepseekApiKey: 'deepseek-test',
      anthropicApiKey: 'anthropic-test',
    }, { limit: 1 })

    expect(summary).toMatchObject({ selected: 1, submitted: 1, provider_batch_id: 'msgbatch_schema_fallback' })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api.deepseek.com/chat/completions',
      'https://api.anthropic.com/v1/messages/batches',
    ])
    const storedCalls = JSON.stringify(client.calls)
    expect(storedCalls).toContain('SCHEMA_INVALID')
    expect(storedCalls).not.toContain('unexpected_raw')
  })

  it('does not bypass the global kill switch through the Anthropic batch fallback', async () => {
    stubDenoEnv({
      KAEL_OPT_BATCH_LEARNING_ENABLED: 'true',
      KAEL_OPT_BATCH_API_ENABLED: 'true',
      KAEL_AI_KILL_SWITCH: 'true',
    })
    const client = makeSequenceClient([
      { data: [queuedRow()], error: null },
      { data: { id: '33333333-3333-4333-8333-333333333336' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processLearningQueue(client, {
      deepseekApiKey: 'deepseek-test',
      anthropicApiKey: 'anthropic-test',
    }, { limit: 1 })

    expect(summary).toMatchObject({ selected: 1, submitted: 0, error_code: 'AI_DISABLED' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(client.calls.filter((call) => call.table === 'kael_ai_batches')).toHaveLength(2)
  })

  it('polls ended Anthropic batches and writes lifecycle rows from successful results', async () => {
    stubDenoEnv(batchProcessingEnv())
    const customId = 'lq_11111111111141118111111111111111'
    const queueRow = queuedRow()
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
      { data: [queueRow], error: null },
      { data: reviewedJobRows(4), error: null },
      { data: { id: '66666666-6666-4666-8666-666666666666' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/results')) {
        return new Response(`${JSON.stringify({
          custom_id: customId,
          result: { type: 'succeeded', message: batchMessage(queueRow.candidate_payload) },
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
    const lifecycle = client.calls.find((call) => call.table === 'kael_rule_lifecycle_log')
    expect(JSON.stringify(lifecycle)).toContain('"next_state":"pending_evidence"')
    expect(JSON.stringify(lifecycle)).toContain('insufficient_evidence')
    expect(JSON.stringify(lifecycle)).toContain('completed_reviewed_jobs')
    const candidateInsert = client.calls.find((call) => call.table === 'learning_candidates')
    expect(candidateInsert?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        suggested_payload: expect.objectContaining({
          candidate_type: 'price_prior_update',
          skill_id: 'LS1',
          target: 'price_prior',
          effects: [],
          prompt_version: expect.any(String),
        }),
      }),
    ])
    expect(client.calls.some((call) => call.table === 'rpc:promote_learning_candidate')).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('auto-promotes a valid LS1 batch result into an active learned price rule after the evidence gate passes', async () => {
    stubDenoEnv(batchProcessingEnv())
    const customId = 'lq_11111111111141118111111111111111'
    const queueRow = promotableQueuedRow()
    const client = makeSequenceClient([
      {
        data: [{
          id: '33333333-3333-4333-8333-333333333333',
          provider_batch_id: 'msgbatch_promote',
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
          queue_id: queueRow.id,
          custom_id: customId,
          skill_id: 'LS1',
        }],
        error: null,
      },
      { data: [queueRow], error: null },
      { data: reviewedJobRowsWithNoise(), error: null },
      {
        data: {
          ok: true,
          error_code: null,
          candidate_id: '66666666-6666-4666-8666-666666666666',
          rule_id: '77777777-7777-4777-8777-777777777777',
          rule_version: 1,
        },
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/results')) {
        return new Response(`${JSON.stringify({
          custom_id: customId,
          result: { type: 'succeeded', message: batchMessage(queueRow.candidate_payload) },
        })}\n`, { status: 200 })
      }
      return new Response(JSON.stringify({
        id: 'msgbatch_promote',
        processing_status: 'ended',
        request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 },
        ended_at: '2026-05-26T01:00:00.000Z',
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processBatchResults(client, { anthropicApiKey: 'anthropic-test' }, { limit: 1 })

    expect(summary).toEqual({ checked: 1, ended: 1, processed_items: 1, failed_items: 0 })
    const jobsQuery = client.calls.find((call) => call.table === 'jobs')
    expect(jobsQuery?.operations).toContainEqual(['eq', 'service_type', 'plumbing'])
    expect(jobsQuery?.operations).toContainEqual(['eq', 'kael_problem_identified', 'pipe_leak'])
    expect(jobsQuery?.operations).toContainEqual(['eq', 'address_district', 'q7'])
    expect(jobsQuery?.operations.some((operation) => operation[0] === 'gte' && operation[1] === 'reviewed_at')).toBe(true)
    const promotionRpc = client.calls.find((call) => call.table === 'rpc:promote_learning_candidate')
    expect(promotionRpc?.operations).toContainEqual([
      'rpc',
      'promote_learning_candidate',
      expect.objectContaining({
        p_skill_id: 'LS1',
        p_candidate_type: 'price_prior_update',
        p_target: 'price_prior',
        p_affected_service: 'plumbing',
        p_affected_problem: 'pipe_leak',
        p_affected_district: 'q7',
        p_evidence_count: 5,
        p_confidence: expect.any(Number),
        p_candidate_payload: expect.objectContaining({
          skill_id: 'LS1',
          target: 'price_prior',
          effects: [],
          prompt_version: expect.any(String),
        }),
        p_rule_payload: expect.objectContaining({
          candidate_type: 'price_prior_update',
          suggested: expect.objectContaining({
            new_min: expect.any(Number),
            new_max: expect.any(Number),
          }),
        }),
      }),
    ])
    expect(client.calls.some((call) => call.table === 'learning_rules')).toBe(false)
    expect(client.calls.some((call) => call.table === 'learning_rule_versions')).toBe(false)
    const lifecycle = client.calls.find((call) => call.table === 'kael_rule_lifecycle_log')
    expect(JSON.stringify(lifecycle)).toContain('"next_state":"pending_evidence"')
    expect(JSON.stringify(lifecycle)).toContain('"next_state":"evidence_gate_check"')
    expect(JSON.stringify(lifecycle)).toContain('"next_state":"auto_promoted"')
    expect(JSON.stringify(lifecycle)).toContain('"next_state":"active"')
    expect(JSON.stringify(lifecycle)).toContain('completed_reviewed_jobs')
    expect(JSON.stringify(lifecycle)).toContain('77777777-7777-4777-8777-777777777777')
  })

  it('does not trust provider-supplied LS1 evidence when reviewed-job aggregation is unavailable', async () => {
    stubDenoEnv(batchProcessingEnv())
    const customId = 'lq_11111111111141118111111111111111'
    const baseQueueRow = promotableQueuedRow()
    const queueRow = {
      ...baseQueueRow,
      candidate_payload: {
        ...baseQueueRow.candidate_payload,
        payload: {
          ...baseQueueRow.candidate_payload.payload,
          evidence_snapshot: gatePass(),
        },
      },
    }
    const client = makeSequenceClient([
      {
        data: [{
          id: '33333333-3333-4333-8333-333333333333',
          provider_batch_id: 'msgbatch_jobs_error',
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
          queue_id: queueRow.id,
          custom_id: customId,
          skill_id: 'LS1',
        }],
        error: null,
      },
      { data: [queueRow], error: null },
      { data: null, error: { code: 'DB_ERROR' } },
      { data: { id: '66666666-6666-4666-8666-666666666666' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/results')) {
        return new Response(`${JSON.stringify({
          custom_id: customId,
          result: { type: 'succeeded', message: batchMessage(queueRow.candidate_payload) },
        })}\n`, { status: 200 })
      }
      return new Response(JSON.stringify({
        id: 'msgbatch_jobs_error',
        processing_status: 'ended',
        request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 },
        ended_at: '2026-05-26T01:00:00.000Z',
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processBatchResults(client, { anthropicApiKey: 'anthropic-test' }, { limit: 1 })

    expect(summary).toEqual({ checked: 1, ended: 1, processed_items: 1, failed_items: 0 })
    expect(client.calls.some((call) => call.table === 'rpc:promote_learning_candidate')).toBe(false)
    const lifecycle = client.calls.find((call) => call.table === 'kael_rule_lifecycle_log')
    expect(JSON.stringify(lifecycle)).toContain('"next_state":"pending_evidence"')
    expect(JSON.stringify(lifecycle)).toContain('insufficient_evidence')
    expect(JSON.stringify(lifecycle)).toContain('completed_reviewed_jobs')
  })

  it('caches LS1 evidence aggregation by scope across multiple results in one batch', async () => {
    stubDenoEnv(batchProcessingEnv())
    const customIdA = 'lq_11111111111141118111111111111111'
    const customIdB = 'lq_22222222222242228222222222222222'
    const queueRowA = promotableQueuedRow()
    const queueRowB = promotableQueuedRow({
      id: '22222222-2222-4222-8222-222222222222',
      job_id: '33333333-3333-4333-8333-333333333333',
    })
    const client = makeSequenceClient([
      {
        data: [{
          id: '33333333-3333-4333-8333-333333333333',
          provider_batch_id: 'msgbatch_cache',
          status: 'submitted',
          next_poll_at: '2026-05-26T00:00:00.000Z',
          created_at: '2026-05-26T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      {
        data: [{
          id: '44444444-4444-4444-8444-444444444441',
          batch_id: '33333333-3333-4333-8333-333333333333',
          queue_id: queueRowA.id,
          custom_id: customIdA,
          skill_id: 'LS1',
        }, {
          id: '44444444-4444-4444-8444-444444444442',
          batch_id: '33333333-3333-4333-8333-333333333333',
          queue_id: queueRowB.id,
          custom_id: customIdB,
          skill_id: 'LS1',
        }],
        error: null,
      },
      { data: [queueRowA, queueRowB], error: null },
      { data: reviewedJobRowsWithNoise(), error: null },
      {
        data: {
          ok: true,
          error_code: null,
          candidate_id: '66666666-6666-4666-8666-666666666661',
          rule_id: '77777777-7777-4777-8777-777777777777',
          rule_version: 1,
        },
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      {
        data: {
          ok: true,
          error_code: null,
          candidate_id: '66666666-6666-4666-8666-666666666662',
          rule_id: '77777777-7777-4777-8777-777777777777',
          rule_version: 2,
        },
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/results')) {
        return new Response(`${JSON.stringify({
          custom_id: customIdA,
          result: { type: 'succeeded', message: batchMessage(queueRowA.candidate_payload) },
        })}\n${JSON.stringify({
          custom_id: customIdB,
          result: { type: 'succeeded', message: batchMessage(queueRowB.candidate_payload) },
        })}\n`, { status: 200 })
      }
      return new Response(JSON.stringify({
        id: 'msgbatch_cache',
        processing_status: 'ended',
        request_counts: { processing: 0, succeeded: 2, errored: 0, canceled: 0, expired: 0 },
        ended_at: '2026-05-26T01:00:00.000Z',
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processBatchResults(client, { anthropicApiKey: 'anthropic-test' }, { limit: 1 })

    expect(summary).toEqual({ checked: 1, ended: 1, processed_items: 2, failed_items: 0 })
    expect(client.calls.filter((call) => call.table === 'jobs')).toHaveLength(1)
    expect(client.calls.filter((call) => call.table === 'rpc:promote_learning_candidate')).toHaveLength(2)
  })

  it('rejects successful provider results that do not contain a valid learning candidate', async () => {
    stubDenoEnv(batchProcessingEnv())
    const customId = 'lq_11111111111141118111111111111111'
    const client = makeSequenceClient([
      {
        data: [{
          id: '33333333-3333-4333-8333-333333333333',
          provider_batch_id: 'msgbatch_invalid',
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
          request_payload: {
            params: { model: 'claude-sonnet-5' },
            kael_spend_reservation_id: 99,
          },
        }],
        error: null,
      },
      { data: [queuedRow()], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/results')) {
        return new Response(`${JSON.stringify({
          custom_id: customId,
          result: {
            type: 'succeeded',
            message: {
              content: [{ text: '{"ok":true}' }],
              usage: { input_tokens: 1000, output_tokens: 100 },
            },
          },
        })}\n`, { status: 200 })
      }
      return new Response(JSON.stringify({
        id: 'msgbatch_invalid',
        processing_status: 'ended',
        request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 },
        ended_at: '2026-05-26T01:00:00.000Z',
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const circuitRpc = vi.fn(async () => ({ data: null, error: null }))
    const summary = await processBatchResults(client, {
      anthropicApiKey: 'anthropic-test',
      durableGuardsEnabled: true,
      durableGuardClient: { rpc: circuitRpc },
    }, { limit: 1 })

    expect(summary).toEqual({ checked: 1, ended: 1, processed_items: 0, failed_items: 1 })
    expect(client.calls.some((call) => call.table === 'learning_rules')).toBe(false)
    expect(JSON.stringify(client.calls)).toContain('LEARNING_CANDIDATE_SCHEMA_INVALID')
    expect(client.calls).toContainEqual(expect.objectContaining({
      table: 'rpc:finalize_kael_ai_spend',
      operations: [[
        'rpc',
        'finalize_kael_ai_spend',
        expect.objectContaining({ p_reservation_id: 99, p_actual_usd: 0.0015 }),
      ]],
    }))
    expect(circuitRpc).toHaveBeenCalledWith('record_circuit_failure', expect.objectContaining({
      p_scope: 'purpose_provider',
      p_key: 'post_job_learning:anthropic',
      p_kind: 'schema',
    }))
  })

  it('keeps manual-review skill results out of active rules even when the evidence gate passes', async () => {
    stubDenoEnv(batchProcessingEnv())
    const customId = 'lq_11111111111141118111111111111111'
    const input = learningInput({ evidence_snapshot: gatePass() })
    const queueRow = queuedRow({
      skill_id: 'LS5',
      input_payload: input,
      candidate_payload: createLearningSkillCandidate('LS5', input),
    })
    const client = makeSequenceClient([
      {
        data: [{
          id: '33333333-3333-4333-8333-333333333333',
          provider_batch_id: 'msgbatch_manual',
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
          queue_id: queueRow.id,
          custom_id: customId,
          skill_id: 'LS5',
        }],
        error: null,
      },
      { data: [queueRow], error: null },
      { data: { id: '66666666-6666-4666-8666-666666666666' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/results')) {
        return new Response(`${JSON.stringify({
          custom_id: customId,
          result: { type: 'succeeded', message: batchMessage(queueRow.candidate_payload) },
        })}\n`, { status: 200 })
      }
      return new Response(JSON.stringify({
        id: 'msgbatch_manual',
        processing_status: 'ended',
        request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 },
        ended_at: '2026-05-26T01:00:00.000Z',
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processBatchResults(client, { anthropicApiKey: 'anthropic-test' }, { limit: 1 })

    expect(summary).toEqual({ checked: 1, ended: 1, processed_items: 1, failed_items: 0 })
    expect(client.calls.some((call) => call.table === 'jobs')).toBe(false)
    expect(client.calls.some((call) => call.table === 'learning_rules')).toBe(false)
    const queueUpdates = client.calls
      .filter((call) => call.table === 'kael_learning_queue')
      .flatMap((call) => call.operations.filter((operation) => operation[0] === 'update'))
    expect(queueUpdates).toContainEqual([
      'update',
      expect.objectContaining({ queue_state: 'manual_review' }),
    ])
  })

  it('does not write learning candidates or active rules when learning write flag is off', async () => {
    stubDenoEnv(batchProcessingEnv({ KAEL_LEARNING_WRITE_ENABLED: 'false' }))
    const customId = 'lq_11111111111141118111111111111111'
    const queueRow = promotableQueuedRow()
    const client = makeSequenceClient([
      {
        data: [{
          id: '33333333-3333-4333-8333-333333333333',
          provider_batch_id: 'msgbatch_write_off',
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
          queue_id: queueRow.id,
          custom_id: customId,
          skill_id: 'LS1',
        }],
        error: null,
      },
      { data: [queueRow], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/results')) {
        return new Response(`${JSON.stringify({
          custom_id: customId,
          result: { type: 'succeeded', message: batchMessage(queueRow.candidate_payload) },
        })}\n`, { status: 200 })
      }
      return new Response(JSON.stringify({
        id: 'msgbatch_write_off',
        processing_status: 'ended',
        request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 },
        ended_at: '2026-05-26T01:00:00.000Z',
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await processBatchResults(client, { anthropicApiKey: 'anthropic-test' }, { limit: 1 })

    expect(summary).toEqual({ checked: 1, ended: 1, processed_items: 0, failed_items: 1 })
    expect(client.calls.some((call) => call.table === 'rpc:promote_learning_candidate')).toBe(false)
    expect(client.calls.some((call) => call.table === 'learning_candidates')).toBe(false)
    expect(JSON.stringify(client.calls)).toContain('LEARNING_WRITE_DISABLED')
  })

  it('parses a candidate from a balanced JSON object inside provider text', () => {
    const candidate = queuedRow().candidate_payload
    const parsed = parseBatchLearningCandidate({
      content: [{ text: `prefix ${JSON.stringify({ candidate })} suffix` }],
    })

    expect(parsed).toMatchObject({ ok: true, candidate: expect.objectContaining({ skill_id: 'LS1' }) })
  })

  it('allows admin force polling before next_poll_at without changing the default hourly gate', async () => {
    stubDenoEnv(batchProcessingEnv())
    const customId = 'lq_11111111111141118111111111111111'
    const queueRow = queuedRow()
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
      { data: [queueRow], error: null },
      { data: reviewedJobRows(4), error: null },
      { data: { id: '66666666-6666-4666-8666-666666666666' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/results')) {
        return new Response(`${JSON.stringify({
          custom_id: customId,
          result: { type: 'succeeded', message: batchMessage(queueRow.candidate_payload) },
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

function queuedRow(overrides: Partial<QueuedLearningRow> = {}): QueuedLearningRow {
  const input = isLearningInput(overrides.input_payload)
    ? overrides.input_payload
    : learningInput()
  return {
    id: '11111111-1111-4111-8111-111111111111',
    event_type: 'post-A14',
    skill_id: 'LS1',
    job_id: '22222222-2222-4222-8222-222222222222',
    actor_id: '11111111-1111-4111-8111-111111111111',
    actor_role: 'customer',
    queue_state: 'pending',
    input_payload: input,
    candidate_payload: createLearningSkillCandidate('LS1', input),
    attempts: 0,
    created_at: '2026-05-26T00:00:00.000Z',
    ...overrides,
  }
}

function promotableQueuedRow(overrides: Partial<QueuedLearningRow> = {}): QueuedLearningRow {
  return queuedRow(overrides)
}

function reviewedJobRows(count: number) {
  const prices = [350000, 360000, 355000, 365000, 358000, 352000]
  return Array.from({ length: count }, (_, index) => ({
    id: `job-${index + 1}`,
    service_type: 'plumbing',
    address_district: 'q7',
    kael_problem_identified: 'pipe_leak',
    kael_price_min: 200000,
    kael_price_max: 300000,
    final_price: prices[index] ?? 350000,
    reviewed_at: `2026-05-${20 + index}T00:00:00.000Z`,
    status: 'reviewed',
    scope_change_customer_decision: null,
  }))
}

function reviewedJobRowsWithNoise() {
  return [
    ...reviewedJobRows(5),
    {
      ...reviewedJobRows(1)[0],
      id: 'scope-changed-job',
      final_price: 900000,
      scope_change_customer_decision: 'approved',
    },
    {
      ...reviewedJobRows(1)[0],
      id: 'outlier-job',
      final_price: 1200000,
    },
  ]
}

function batchMessage(candidate: QueuedLearningRow['candidate_payload']) {
  return { content: [{ text: JSON.stringify({ candidate }) }] }
}

function gatePass() {
  return {
    evidence_count: 5,
    confidence: 0.72,
    completed_transaction_count: 5,
    recent_contradiction_ratio: 0,
  }
}

function isLearningInput(value: unknown): value is LearningSkillInput {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function batchProcessingEnv(overrides: Record<string, string> = {}) {
  return {
    KAEL_OPT_BATCH_API_ENABLED: 'true',
    KAEL_LEARNING_READ_ENABLED: 'true',
    KAEL_LEARNING_WRITE_ENABLED: 'true',
    KAEL_LEARNING_KILL_SWITCH: 'false',
    KAEL_LEARNING_AB_PERCENTAGE: '100',
    ...overrides,
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
