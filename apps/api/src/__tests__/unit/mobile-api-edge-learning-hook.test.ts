import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONTRADICTION_MAX_RATIO,
  EDGE_CONFIDENCE_THRESHOLD,
  EDGE_MIN_EVIDENCE,
  runLearningHook,
  shouldPromoteLearningCandidate,
  type EdgeLearningCandidateRow,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/learning-hook'
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
    const opposite = pricePriorCandidate({ id: 'c2' })
    const payload = opposite.suggested_payload as { suggested: { direction: string } }
    payload.suggested.direction = 'overestimate'
    const similar = [opposite, pricePriorCandidate({ id: 'c3' })]
    const decision = shouldPromoteLearningCandidate(pricePriorCandidate(), similar)
    expect(decision).toEqual({ promote: false, reason: 'contradicted_by_recent' })
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
})

describe('Edge learning hook: constants parity with apps/api reference', () => {
  it('gate thresholds match the apps/api evidence gate', () => {
    expect(EDGE_MIN_EVIDENCE).toBe(MIN_EVIDENCE)
    expect(EDGE_CONFIDENCE_THRESHOLD).toBe(CONFIDENCE_THRESHOLD)
    expect(CONTRADICTION_MAX_RATIO).toBe(API_CONTRADICTION_MAX_RATIO)
  })
})

type QueryResult = { data: unknown; error: { code?: string } | null; count?: number | null }

function chainFor(result: QueryResult) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  for (const method of ['select', 'eq', 'neq', 'limit', 'update', 'maybeSingle']) {
    chain[method] = vi.fn(self)
  }
  chain.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

function hookClient(options: {
  job?: Record<string, unknown> | null
  review?: Record<string, unknown> | null
  scopeChangeCount?: number
  candidate?: Record<string, unknown> | null
  rpcResults?: Record<string, QueryResult>
}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const tableResults: Record<string, QueryResult> = {
    jobs: { data: options.job ?? null, error: null },
    reviews: { data: options.review ?? null, error: null },
    scope_change_requests: {
      data: null,
      error: null,
      count: options.scopeChangeCount ?? 0,
    },
    learning_candidates: { data: options.candidate ? [options.candidate] : [], error: null },
  }
  const client = {
    from: vi.fn((table: string) => chainFor(tableResults[table] ?? { data: null, error: null })),
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      const result = options.rpcResults?.[name] ?? { data: [], error: null }
      return chainFor(result)
    }),
  }
  return { client, rpcCalls }
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
