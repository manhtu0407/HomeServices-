import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONTRADICTION_MAX_RATIO,
  CONTRADICTION_MIN_SAMPLE,
  CONTRADICTION_WINDOW_DAYS,
  EDGE_CONFIDENCE_THRESHOLD,
  EDGE_MIN_EVIDENCE,
  runLearningHook,
  shouldPromoteLearningCandidate,
  touchesMoneyOrScope,
  type EdgeLearningCandidateRow,
  type LearningHookDbClient,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/learning/learning-hook'
import {
  CONFIDENCE_THRESHOLD,
  CONTRADICTION_MAX_RATIO as API_CONTRADICTION_MAX_RATIO,
  MIN_EVIDENCE,
} from '@/lib/learning/evidence-gate'

function stubDenoEnv(env: Record<string, string>) {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] } })
}

const LEARNING_ON = {
  KAEL_LEARNING_READ_ENABLED: 'true',
  KAEL_LEARNING_WRITE_ENABLED: 'true',
  KAEL_LEARNING_KILL_SWITCH: 'false',
  KAEL_LEARNING_AB_PERCENTAGE: '100',
}

function pricePriorCandidate(
  overrides: Partial<EdgeLearningCandidateRow> = {},
): EdgeLearningCandidateRow {
  return {
    id: 'c1',
    candidate_type: 'price_prior_update',
    affected_service: 'electrical',
    affected_problem: 'outlet_dead',
    affected_district: 'q1',
    suggested_payload: {
      candidate_type: 'price_prior_update',
      scope: {
        service_type: 'electrical',
        problem_slug: 'outlet_dead',
        district_code: 'q1',
        complexity: 'small',
      },
      observed: {
        sample_size: 6,
        baseline_used_min: 200_000,
        baseline_used_max: 400_000,
        median_final_price: 350_000,
        p25_final_price: 320_000,
        p75_final_price: 380_000,
        median_estimate_min: 200_000,
        median_estimate_max: 400_000,
      },
      suggested: {
        shift_min: 50_000,
        shift_max: 50_000,
        new_min: 250_000,
        new_max: 450_000,
        direction: 'underestimate',
      },
      window: { from_ts: '2026-05-01T00:00:00Z', to_ts: '2026-07-01T00:00:00Z' },
    },
    confidence: 0.8,
    evidence_count: 6,
    status: 'created',
    ...overrides,
  }
}

function oppositePrior(id: string): EdgeLearningCandidateRow {
  const row = pricePriorCandidate({ id })
  const payload = row.suggested_payload as { suggested: { direction: string } }
  payload.suggested.direction = 'overestimate'
  return row
}

function analysisRuleCandidate(id: string): EdgeLearningCandidateRow {
  return pricePriorCandidate({
    id,
    candidate_type: 'analysis_rule',
    suggested_payload: {
      candidate_type: 'analysis_rule',
      scope: { service_type: 'electrical', problem_slug: 'outlet_dead', district_code: 'q1' },
      observed: { sample_size: 6, scope_change_rate: 0.5, avg_rating: 4, common_tags: [] },
      suggested: {
        kind: 'raise_complexity_prior',
        from: 'small',
        to: 'medium',
        rationale: 'scope_change_rate=0.50 (n=6)',
      },
    },
  })
}

describe('Edge learning hook: evidence gate', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects when evidence_count below minimum', () => {
    const decision = shouldPromoteLearningCandidate(
      pricePriorCandidate({ evidence_count: EDGE_MIN_EVIDENCE - 1 }),
      [],
    )
    expect(decision).toEqual({ promote: false, reason: 'insufficient_evidence' })
  })

  it('rejects when confidence below threshold', () => {
    const decision = shouldPromoteLearningCandidate(
      pricePriorCandidate({ confidence: EDGE_CONFIDENCE_THRESHOLD - 0.01 }),
      [],
    )
    expect(decision).toEqual({ promote: false, reason: 'low_confidence' })
  })

  it('promotes a clean candidate at exactly the thresholds', () => {
    const decision = shouldPromoteLearningCandidate(
      pricePriorCandidate({
        evidence_count: EDGE_MIN_EVIDENCE,
        confidence: EDGE_CONFIDENCE_THRESHOLD,
      }),
      [],
    )
    expect(decision).toEqual({ promote: true, reason: 'gate_passed' })
  })

  it('pins payload candidate_type to the row (cross-skill escalation blocked)', () => {
    const row = pricePriorCandidate()
    row.candidate_type = 'analysis_rule'
    const decision = shouldPromoteLearningCandidate(row, [])
    expect(decision).toEqual({ promote: false, reason: 'invalid_payload' })
  })

  it('pins payload scope to the row columns', () => {
    const row = pricePriorCandidate({ affected_district: 'q7' })
    const decision = shouldPromoteLearningCandidate(row, [])
    expect(decision).toEqual({ promote: false, reason: 'invalid_payload' })
  })

  it('rejects when recent similar candidates contradict direction', () => {
    const similar = [
      oppositePrior('c2'),
      pricePriorCandidate({ id: 'c3' }),
      pricePriorCandidate({ id: 'c4' }),
      pricePriorCandidate({ id: 'c5' }),
    ]
    const decision = shouldPromoteLearningCandidate(pricePriorCandidate(), similar)
    expect(decision).toEqual({ promote: false, reason: 'contradicted_by_recent' })
  })

  it('does not read a contradiction ratio from fewer than the minimum sample', () => {
    const similar = [oppositePrior('c2'), pricePriorCandidate({ id: 'c3' })]
    expect(similar).toHaveLength(CONTRADICTION_MIN_SAMPLE - 1)
    const decision = shouldPromoteLearningCandidate(pricePriorCandidate(), similar)
    expect(decision).toEqual({ promote: true, reason: 'gate_passed' })
  })

  it('ignores directionless analysis rules when sizing the contradiction sample', () => {
    // Three rows, but only one carries a direction — too thin to judge, and the
    // analysis rules must not pad the denominator into looking sufficient.
    const similar = [oppositePrior('c2'), analysisRuleCandidate('c3'), analysisRuleCandidate('c4')]
    const decision = shouldPromoteLearningCandidate(pricePriorCandidate(), similar)
    expect(decision).toEqual({ promote: true, reason: 'gate_passed' })
  })

  it('refuses unknown suggestion kinds as forbidden autonomy', () => {
    const row = pricePriorCandidate({
      candidate_type: 'analysis_rule',
      suggested_payload: {
        candidate_type: 'analysis_rule',
        scope: { service_type: 'electrical', problem_slug: 'outlet_dead', district_code: 'q1' },
        observed: { sample_size: 6, scope_change_rate: 0.5, avg_rating: 4, common_tags: [] },
        suggested: { kind: 'auto_charge_payment', rationale: 'x' },
      },
    })
    const decision = shouldPromoteLearningCandidate(row, [])
    expect(decision).toEqual({ promote: false, reason: 'invalid_payload' })
  })

  it('treats a non-positive price floor as money-touching', () => {
    const payload = pricePriorCandidate().suggested_payload as {
      suggested: { new_min: number }
    }
    payload.suggested.new_min = 0
    expect(touchesMoneyOrScope(payload)).toBe(true)
  })

  it('treats an inverted price band as money-touching', () => {
    const payload = pricePriorCandidate().suggested_payload as {
      suggested: { new_min: number; new_max: number }
    }
    payload.suggested.new_min = 500_000
    payload.suggested.new_max = 400_000
    expect(touchesMoneyOrScope(payload)).toBe(true)
  })

  it('lets a well-formed price prior through the money/scope guard', () => {
    expect(touchesMoneyOrScope(pricePriorCandidate().suggested_payload)).toBe(false)
  })
})

describe('Edge learning hook: constants parity with apps/api reference', () => {
  it('gate thresholds match the apps/api evidence gate', () => {
    expect(EDGE_MIN_EVIDENCE).toBe(MIN_EVIDENCE)
    expect(EDGE_CONFIDENCE_THRESHOLD).toBe(CONFIDENCE_THRESHOLD)
    expect(CONTRADICTION_MAX_RATIO).toBe(API_CONTRADICTION_MAX_RATIO)
  })
})

type QueryResult = { data: unknown; error: { code?: string } | null; count?: number | null }

function chainFor(
  result: QueryResult,
  record?: (method: string, args: unknown[]) => void,
): ReturnType<LearningHookDbClient['from']> {
  const chain: Record<string, unknown> = {}
  for (
    const method of [
      'select',
      'eq',
      'neq',
      'gte',
      'order',
      'limit',
      'update',
      'insert',
      'maybeSingle',
    ]
  ) {
    chain[method] = vi.fn((...args: unknown[]) => {
      record?.(method, args)
      return chain
    })
  }
  chain.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve)
  return chain as ReturnType<LearningHookDbClient['from']>
}

function hookClient(options: {
  job?: Record<string, unknown> | null
  review?: Record<string, unknown> | null
  scopeChangeCount?: number
  candidate?: Record<string, unknown> | null
  similar?: Array<Record<string, unknown>>
  rpcResults?: Record<string, QueryResult>
}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const candidateRead: QueryResult = {
    data: options.candidate ? [options.candidate] : [],
    error: null,
  }
  // Each table serves its queue in order and then repeats the last entry, so the
  // candidate read and the similar-candidate read can return different rows.
  const tableQueues: Record<string, QueryResult[]> = {
    jobs: [{ data: options.job ?? null, error: null }],
    reviews: [{ data: options.review ?? null, error: null }],
    scope_change_requests: [{
      data: null,
      error: null,
      count: options.scopeChangeCount ?? 0,
    }],
    learning_candidates: options.similar
      ? [candidateRead, { data: options.similar, error: null }]
      : [candidateRead],
  }
  const updateCalls: Array<{ table: string; value: Record<string, unknown> }> = []
  const queryCalls: Array<{ table: string; method: string; args: unknown[] }> = []
  const client = {
    from: vi.fn((table: string) => {
      const queue = tableQueues[table]
      const result = queue && queue.length > 1
        ? queue.shift() as QueryResult
        : queue?.[0] ?? { data: null, error: null }
      return chainFor(result, (method, args) => {
        queryCalls.push({ table, method, args })
        if (method === 'update' && typeof args[0] === 'object' && args[0] !== null) {
          updateCalls.push({ table, value: args[0] as Record<string, unknown> })
        }
      })
    }),
    rpc: vi.fn((name: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ name, args })
      const result = options.rpcResults?.[name] ?? { data: [], error: null }
      return chainFor(result)
    }),
  }
  // The chain mock is structural, not nominal: it answers every builder method the hook
  // reaches for but cannot satisfy QueryBuilder's declared shape. Assert the contract
  // here so adding a builder method does not scatter type errors across every call site.
  return {
    client: client as unknown as LearningHookDbClient,
    rpcCalls,
    updateCalls,
    queryCalls,
  }
}

const REVIEWED_JOB = {
  id: 'j1',
  service_type: 'electrical',
  address_district: 'Quận 1',
  kael_complexity: 'small',
  kael_price_min: 200_000,
  kael_price_max: 400_000,
  kael_problem_identified: 'outlet_dead',
  final_price: 350_000,
  reviewed_at: '2026-07-19T00:00:00Z',
  status: 'reviewed',
  service_problem_id: null,
}

describe('Edge learning hook: runLearningHook', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('skips when the job is not reviewed', async () => {
    stubDenoEnv(LEARNING_ON)
    const { client, rpcCalls } = hookClient({
      job: { ...REVIEWED_JOB, status: 'completed_by_worker' },
    })
    const summary = await runLearningHook(client, 'j1')
    expect(summary.ok).toBe(false)
    expect(summary.skippedReason).toBe('insufficient_job_context')
    expect(rpcCalls).toHaveLength(0)
  })

  it('skips when learning write flags are off', async () => {
    stubDenoEnv({ ...LEARNING_ON, KAEL_LEARNING_WRITE_ENABLED: 'false' })
    const { client, rpcCalls } = hookClient({ job: REVIEWED_JOB })
    const summary = await runLearningHook(client, 'j1')
    expect(summary.skippedReason).toBe('learning_disabled')
    expect(rpcCalls).toHaveLength(0)
  })

  it('records observations but never promotes while autopromote flag is off', async () => {
    stubDenoEnv(LEARNING_ON)
    const { client, rpcCalls } = hookClient({
      job: REVIEWED_JOB,
      review: { rating: 5, tags: ['Đúng giờ'] },
      rpcResults: {
        record_learning_observation_atomic: {
          data: [{
            ok: true,
            error_code: null,
            candidate_id: 'c1',
            is_new: false,
            confidence: 0.8,
            evidence_count: 6,
            status: 'created',
            idempotent: false,
          }],
          error: null,
        },
      },
    })
    const summary = await runLearningHook(client, 'j1')
    expect(summary.ok).toBe(true)
    const observationCalls = rpcCalls.filter(
      (call) => call.name === 'record_learning_observation_atomic',
    )
    expect(observationCalls).toHaveLength(2)
    expect(observationCalls.map((call) => call.args.p_candidate_type).sort()).toEqual([
      'analysis_rule',
      'price_prior_update',
    ])
    expect(rpcCalls.some((call) => call.name === 'auto_promote_learning_candidate_atomic')).toBe(
      false,
    )
  })

  it('promotes through the atomic RPC when the gate passes and autopromote is on', async () => {
    stubDenoEnv({ ...LEARNING_ON, KAEL_LEARNING_AUTOPROMOTE_ENABLED: 'true' })
    const { client, rpcCalls } = hookClient({
      job: REVIEWED_JOB,
      review: { rating: 5, tags: [] },
      candidate: pricePriorCandidate(),
      rpcResults: {
        record_learning_observation_atomic: {
          data: [{
            ok: true,
            error_code: null,
            candidate_id: 'c1',
            is_new: false,
            confidence: 0.8,
            evidence_count: 6,
            status: 'created',
            idempotent: false,
          }],
          error: null,
        },
        auto_promote_learning_candidate_atomic: {
          data: [{ ok: true, error_code: null, candidate_id: 'c1', rule_id: 'r1', rule_version: 1, status: 'auto_promoted' }],
          error: null,
        },
      },
    })
    const summary = await runLearningHook(client, 'j1')
    expect(summary.ok).toBe(true)
    expect(summary.marketPromoted).toEqual({ ruleId: 'r1', ruleVersion: 1 })
    expect(
      rpcCalls.filter((call) => call.name === 'auto_promote_learning_candidate_atomic'),
    ).not.toHaveLength(0)
  })

  it('accepts any truthy spelling of the autopromote flag', async () => {
    stubDenoEnv({ ...LEARNING_ON, KAEL_LEARNING_AUTOPROMOTE_ENABLED: '1' })
    const { client } = hookClient({
      job: REVIEWED_JOB,
      review: { rating: 5, tags: [] },
      candidate: pricePriorCandidate(),
      rpcResults: {
        record_learning_observation_atomic: {
          data: [{
            ok: true,
            error_code: null,
            candidate_id: 'c1',
            is_new: false,
            confidence: 0.8,
            evidence_count: 6,
            status: 'created',
            idempotent: false,
          }],
          error: null,
        },
        auto_promote_learning_candidate_atomic: {
          data: [{ ok: true, error_code: null, candidate_id: 'c1', rule_id: 'r1', rule_version: 1, status: 'auto_promoted' }],
          error: null,
        },
      },
    })
    const summary = await runLearningHook(client, 'j1')
    expect(summary.marketPromoted).toEqual({ ruleId: 'r1', ruleVersion: 1 })
  })

  it('passes the admin reference band to the observation RPC', async () => {
    stubDenoEnv(LEARNING_ON)
    const { client, rpcCalls } = hookClient({
      job: { ...REVIEWED_JOB, kael_reference_price_min: 180_000, kael_reference_price_max: 300_000 },
      review: { rating: 5, tags: [] },
      rpcResults: {
        record_learning_observation_atomic: {
          data: [{
            ok: true,
            error_code: null,
            candidate_id: 'c1',
            is_new: false,
            confidence: 0.8,
            evidence_count: 6,
            status: 'created',
            idempotent: false,
          }],
          error: null,
        },
      },
    })
    await runLearningHook(client, 'j1')
    const observation = rpcCalls.find(
      (call) => call.name === 'record_learning_observation_atomic',
    )
    expect(observation?.args.p_reference_min).toBe(180_000)
    expect(observation?.args.p_reference_max).toBe(300_000)
    // The estimate is still pinned separately — both numbers reach the RPC.
    expect(observation?.args.p_baseline_min).toBe(200_000)
  })

  it('still records when the job predates the reference columns', async () => {
    stubDenoEnv(LEARNING_ON)
    const { client, rpcCalls } = hookClient({
      job: REVIEWED_JOB,
      review: { rating: 5, tags: [] },
      rpcResults: {
        record_learning_observation_atomic: {
          data: [{
            ok: true,
            error_code: null,
            candidate_id: 'c1',
            is_new: false,
            confidence: 0.8,
            evidence_count: 6,
            status: 'created',
            idempotent: false,
          }],
          error: null,
        },
      },
    })
    const summary = await runLearningHook(client, 'j1')
    expect(summary.ok).toBe(true)
    const observation = rpcCalls.find(
      (call) => call.name === 'record_learning_observation_atomic',
    )
    expect(observation?.args.p_reference_min).toBeNull()
  })

  it('bounds the similar-candidate lookup to the contradiction window', async () => {
    stubDenoEnv({ ...LEARNING_ON, KAEL_LEARNING_AUTOPROMOTE_ENABLED: 'true' })
    const now = new Date('2026-07-20T00:00:00Z')
    const { client, queryCalls } = hookClient({
      job: REVIEWED_JOB,
      review: { rating: 5, tags: [] },
      candidate: pricePriorCandidate(),
      similar: [],
      rpcResults: {
        record_learning_observation_atomic: {
          data: [{
            ok: true,
            error_code: null,
            candidate_id: 'c1',
            is_new: false,
            confidence: 0.8,
            evidence_count: 6,
            status: 'created',
            idempotent: false,
          }],
          error: null,
        },
        auto_promote_learning_candidate_atomic: {
          data: [{ ok: true, error_code: null, candidate_id: 'c1', rule_id: 'r1', rule_version: 1, status: 'auto_promoted' }],
          error: null,
        },
      },
    })
    await runLearningHook(client, 'j1', now)
    const gte = queryCalls.find(
      (call) => call.table === 'learning_candidates' && call.method === 'gte',
    )
    expect(gte).toBeDefined()
    expect(gte?.args[0]).toBe('updated_at')
    const cutoff = new Date(String(gte?.args[1]))
    const expected = now.getTime() - CONTRADICTION_WINDOW_DAYS * 24 * 60 * 60 * 1000
    expect(cutoff.getTime()).toBe(expected)
  })

  it('shadow mode logs the decision instead of promoting', async () => {
    stubDenoEnv({
      ...LEARNING_ON,
      KAEL_LEARNING_AUTOPROMOTE_ENABLED: 'true',
      KAEL_LEARNING_SHADOW_MODE: 'true',
    })
    const { client, rpcCalls, queryCalls } = hookClient({
      job: REVIEWED_JOB,
      review: { rating: 5, tags: [] },
      candidate: pricePriorCandidate(),
      rpcResults: {
        record_learning_observation_atomic: {
          data: [{
            ok: true,
            error_code: null,
            candidate_id: 'c1',
            is_new: false,
            confidence: 0.8,
            evidence_count: 6,
            status: 'created',
            idempotent: false,
          }],
          error: null,
        },
      },
    })
    const summary = await runLearningHook(client, 'j1')

    expect(summary.marketPromoted).toBeUndefined()
    expect(rpcCalls.some((call) => call.name === 'auto_promote_learning_candidate_atomic'))
      .toBe(false)
    const logged = queryCalls.find(
      (call) => call.table === 'kael_rule_lifecycle_log' && call.method === 'insert',
    )
    const row = logged?.args[0] as Record<string, unknown>
    expect(row.next_state).toBe('evidence_gate_check')
    expect(String(row.transition_reason).length).toBeLessThanOrEqual(200)
    expect((row.safe_metadata as Record<string, unknown>).would_promote).toBe(true)
    expect((row.safe_metadata as Record<string, unknown>).proposed_min).toBe(250_000)
  })

  it('routes a structurally invalid candidate to manual review, not pending evidence', async () => {
    stubDenoEnv({ ...LEARNING_ON, KAEL_LEARNING_AUTOPROMOTE_ENABLED: 'true' })
    const { client, updateCalls } = hookClient({
      job: REVIEWED_JOB,
      review: { rating: 5, tags: [] },
      candidate: pricePriorCandidate({ affected_district: 'q7' }),
      rpcResults: {
        record_learning_observation_atomic: {
          data: [{
            ok: true,
            error_code: null,
            candidate_id: 'c1',
            is_new: false,
            confidence: 0.8,
            evidence_count: 6,
            status: 'created',
            idempotent: false,
          }],
          error: null,
        },
      },
    })
    await runLearningHook(client, 'j1')
    const patches = updateCalls.filter((call) => call.table === 'learning_candidates')
    expect(patches).not.toHaveLength(0)
    expect(patches[0]?.value.status).toBe('manual_review')
    expect(patches[0]?.value.audit_reason).toContain('invalid_payload')
  })

  it('keeps a recoverable low-confidence candidate in pending evidence', async () => {
    stubDenoEnv({ ...LEARNING_ON, KAEL_LEARNING_AUTOPROMOTE_ENABLED: 'true' })
    const { client, updateCalls } = hookClient({
      job: REVIEWED_JOB,
      review: { rating: 5, tags: [] },
      candidate: pricePriorCandidate({ confidence: EDGE_CONFIDENCE_THRESHOLD - 0.1 }),
      rpcResults: {
        record_learning_observation_atomic: {
          data: [{
            ok: true,
            error_code: null,
            candidate_id: 'c1',
            is_new: false,
            confidence: 0.5,
            evidence_count: 6,
            status: 'created',
            idempotent: false,
          }],
          error: null,
        },
      },
    })
    await runLearningHook(client, 'j1')
    const patches = updateCalls.filter((call) => call.table === 'learning_candidates')
    expect(patches[0]?.value.status).toBe('pending_evidence')
  })

  it('price observation is skipped when a scope change exists (case review still runs)', async () => {
    stubDenoEnv(LEARNING_ON)
    const { client, rpcCalls } = hookClient({
      job: REVIEWED_JOB,
      review: { rating: 4, tags: [] },
      scopeChangeCount: 1,
      rpcResults: {
        record_learning_observation_atomic: {
          data: [{
            ok: true,
            error_code: null,
            candidate_id: 'c2',
            is_new: true,
            confidence: 0,
            evidence_count: 1,
            status: 'created',
            idempotent: false,
          }],
          error: null,
        },
      },
    })
    await runLearningHook(client, 'j1')
    const observationCalls = rpcCalls.filter(
      (call) => call.name === 'record_learning_observation_atomic',
    )
    expect(observationCalls.map((call) => call.args.p_candidate_type)).toEqual(['analysis_rule'])
  })
})
