import { describe, it, expect, vi } from 'vitest'
import {
  shouldPromote,
  promoteCandidate,
  MIN_EVIDENCE,
  CONFIDENCE_THRESHOLD,
  CONTRADICTION_MAX_RATIO,
  type CandidateRow,
} from '@/lib/learning/evidence-gate'
import type { PricePriorPayload, AnalysisRulePayload } from '@/lib/learning/types'

// =============================================================================
// Helpers — build minimally valid candidate rows for each branch.
// =============================================================================

function pricePayload(direction: PricePriorPayload['suggested']['direction'] = 'underestimate'): PricePriorPayload {
  return {
    candidate_type: 'price_prior_update',
    scope: {
      service_type: 'plumbing',
      problem_slug: 'pipe_leak',
      district_code: 'q1',
      complexity: 'medium',
    },
    observed: {
      sample_size: 6,
      baseline_used_min: 200_000,
      baseline_used_max: 400_000,
      median_final_price: 375_000,
      p25_final_price: 360_000,
      p75_final_price: 390_000,
      median_estimate_min: 250_000,
      median_estimate_max: 350_000,
    },
    suggested: {
      shift_min: 100_000,
      shift_max: 50_000,
      new_min: 300_000,
      new_max: 450_000,
      direction,
    },
    window: { from_ts: '2026-01-01T00:00:00Z', to_ts: '2026-02-01T00:00:00Z' },
  }
}

function analysisPayload(): AnalysisRulePayload {
  return {
    candidate_type: 'analysis_rule',
    scope: { service_type: 'plumbing', problem_slug: 'pipe_leak', district_code: 'q1' },
    observed: {
      sample_size: 6,
      scope_change_rate: 0.5,
      avg_rating: 4.2,
      common_tags: ['Đúng giờ', 'Sạch sẽ'],
    },
    suggested: {
      kind: 'raise_complexity_prior',
      from: 'small',
      to: 'medium',
      rationale: 'high scope_change_rate',
    },
  }
}

function priceCandidate(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: 'cand-1',
    candidate_type: 'price_prior_update',
    affected_service: 'plumbing',
    affected_problem: 'pipe_leak',
    affected_district: 'q1',
    suggested_payload: pricePayload(),
    confidence: 0.8,
    evidence_count: MIN_EVIDENCE,
    status: 'pending_evidence',
    ...overrides,
  }
}

function analysisCandidate(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: 'cand-2',
    candidate_type: 'analysis_rule',
    affected_service: 'plumbing',
    affected_problem: 'pipe_leak',
    affected_district: 'q1',
    suggested_payload: analysisPayload(),
    confidence: 0.75,
    evidence_count: MIN_EVIDENCE,
    status: 'pending_evidence',
    ...overrides,
  }
}

// =============================================================================
// Promote happy path
// =============================================================================

describe('shouldPromote — happy paths', () => {
  it('promotes a valid price_prior candidate with sufficient evidence and confidence', () => {
    const decision = shouldPromote(priceCandidate(), [])
    expect(decision.promote).toBe(true)
    if (decision.promote) expect(decision.reason).toBe('gate_passed')
  })

  it('promotes a valid analysis_rule candidate', () => {
    const decision = shouldPromote(analysisCandidate(), [])
    expect(decision.promote).toBe(true)
  })

  it.each(['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'] as const)(
    'accepts the supported %s service scope',
    (serviceType) => {
      const payload = pricePayload()
      payload.scope.service_type = serviceType
      const decision = shouldPromote(priceCandidate({
        affected_service: serviceType,
        suggested_payload: payload,
      }), [])

      expect(decision.promote).toBe(true)
    },
  )
})

// =============================================================================
// Evidence count boundaries
// =============================================================================

describe('shouldPromote — evidence count boundary', () => {
  it('rejects when evidence_count = MIN_EVIDENCE - 1', () => {
    const decision = shouldPromote(priceCandidate({ evidence_count: MIN_EVIDENCE - 1 }), [])
    expect(decision.promote).toBe(false)
    if (!decision.promote) expect(decision.reason).toBe('insufficient_evidence')
  })

  it('accepts when evidence_count = MIN_EVIDENCE', () => {
    const decision = shouldPromote(priceCandidate({ evidence_count: MIN_EVIDENCE }), [])
    expect(decision.promote).toBe(true)
  })

  it('rejects evidence_count = 0', () => {
    const decision = shouldPromote(priceCandidate({ evidence_count: 0 }), [])
    expect(decision.promote).toBe(false)
  })
})

// =============================================================================
// Confidence threshold boundary
// =============================================================================

describe('shouldPromote — confidence boundary', () => {
  it('rejects confidence slightly below threshold', () => {
    const decision = shouldPromote(
      priceCandidate({ confidence: CONFIDENCE_THRESHOLD - 0.01 }),
      [],
    )
    expect(decision.promote).toBe(false)
    if (!decision.promote) expect(decision.reason).toBe('low_confidence')
  })

  it('accepts confidence exactly at threshold', () => {
    const decision = shouldPromote(
      priceCandidate({ confidence: CONFIDENCE_THRESHOLD }),
      [],
    )
    expect(decision.promote).toBe(true)
  })

  it('rejects confidence = 0', () => {
    const decision = shouldPromote(priceCandidate({ confidence: 0 }), [])
    expect(decision.promote).toBe(false)
  })
})

// =============================================================================
// Contradiction-by-recent check (price_prior only)
// =============================================================================

describe('shouldPromote — contradiction detection', () => {
  it('rejects when contradiction ratio > CONTRADICTION_MAX_RATIO', () => {
    const candidate = priceCandidate()
    // 3 opposite-direction candidates out of 5 (60%) — exceeds 20% threshold
    const similar: CandidateRow[] = [
      { ...priceCandidate({ id: 's1', suggested_payload: pricePayload('overestimate') }) },
      { ...priceCandidate({ id: 's2', suggested_payload: pricePayload('overestimate') }) },
      { ...priceCandidate({ id: 's3', suggested_payload: pricePayload('overestimate') }) },
      { ...priceCandidate({ id: 's4', suggested_payload: pricePayload('underestimate') }) },
      { ...priceCandidate({ id: 's5', suggested_payload: pricePayload('underestimate') }) },
    ]
    const decision = shouldPromote(candidate, similar)
    expect(decision.promote).toBe(false)
    if (!decision.promote) expect(decision.reason).toBe('contradicted_by_recent')
  })

  it('accepts when contradiction ratio < CONTRADICTION_MAX_RATIO', () => {
    const candidate = priceCandidate()
    // 1 contradicting out of 10 (10%) — below 20%
    const similar: CandidateRow[] = [
      ...Array.from({ length: 9 }, (_, i) =>
        priceCandidate({ id: `same-${i}`, suggested_payload: pricePayload('underestimate') }),
      ),
      priceCandidate({ id: 'opp', suggested_payload: pricePayload('overestimate') }),
    ]
    const decision = shouldPromote(candidate, similar)
    expect(decision.promote).toBe(true)
  })

  it('ignores contradiction check when similarRecent is empty', () => {
    const decision = shouldPromote(priceCandidate(), [])
    expect(decision.promote).toBe(true)
  })

  it('noisy-direction candidates do not count as contradiction', () => {
    const candidate = priceCandidate()
    const similar: CandidateRow[] = Array.from({ length: 5 }, (_, i) =>
      priceCandidate({ id: `noisy-${i}`, suggested_payload: pricePayload('noisy') }),
    )
    const decision = shouldPromote(candidate, similar)
    expect(decision.promote).toBe(true)
  })
})

// =============================================================================
// Forbidden autonomy (defense-in-depth)
// =============================================================================

describe('shouldPromote — forbidden autonomy guards', () => {
  it('rejects price payload with non-positive new_min', () => {
    const bad = pricePayload()
    bad.suggested.new_min = -100
    bad.suggested.new_max = 500_000
    const decision = shouldPromote(priceCandidate({ suggested_payload: bad }), [])
    expect(decision.promote).toBe(false)
    if (!decision.promote) expect(decision.reason).toBe('forbidden_autonomy')
  })

  it('rejects price payload with new_max < new_min', () => {
    const bad = pricePayload()
    bad.suggested.new_min = 500_000
    bad.suggested.new_max = 300_000
    const decision = shouldPromote(priceCandidate({ suggested_payload: bad }), [])
    expect(decision.promote).toBe(false)
    if (!decision.promote) expect(decision.reason).toBe('forbidden_autonomy')
  })

  it('rejects price payload with unsupported service_type', () => {
    const bad = pricePayload()
    // Force-cast to bypass TS scope_change_pending — testing runtime safety.
    ;(bad.scope as { service_type: string }).service_type = 'painting'
    const decision = shouldPromote(priceCandidate({ suggested_payload: bad }), [])
    expect(decision.promote).toBe(false)
    if (!decision.promote) expect(decision.reason).toBe('invalid_payload')
  })

  it('rejects analysis payload with unknown suggestion kind', () => {
    const bad = analysisPayload()
    ;(bad.suggested as { kind: string }).kind = 'auto_book_worker'
    const decision = shouldPromote(analysisCandidate({ suggested_payload: bad }), [])
    expect(decision.promote).toBe(false)
    if (!decision.promote) expect(decision.reason).toBe('invalid_payload')
  })
})

// =============================================================================
// Invalid payload shape
// =============================================================================

describe('shouldPromote — invalid payload', () => {
  it('rejects when suggested_payload is missing candidate_type', () => {
    const bad = { scope: {}, observed: {}, suggested: {} } as unknown
    const decision = shouldPromote(priceCandidate({ suggested_payload: bad }), [])
    expect(decision.promote).toBe(false)
    if (!decision.promote) expect(decision.reason).toBe('invalid_payload')
  })

  it('rejects when suggested_payload is null', () => {
    const decision = shouldPromote(priceCandidate({ suggested_payload: null }), [])
    expect(decision.promote).toBe(false)
    if (!decision.promote) expect(decision.reason).toBe('invalid_payload')
  })

  it('rejects malformed nested objects without throwing', () => {
    const bad = {
      candidate_type: 'price_prior_update',
      scope: null,
      observed: {},
      suggested: {},
    }

    expect(() => shouldPromote(priceCandidate({ suggested_payload: bad }), [])).not.toThrow()
    expect(shouldPromote(priceCandidate({ suggested_payload: bad }), [])).toEqual({
      promote: false,
      reason: 'invalid_payload',
    })
  })

  it('rejects a row whose discriminator disagrees with its payload', () => {
    const decision = shouldPromote(priceCandidate({ candidate_type: 'analysis_rule' }), [])

    expect(decision).toEqual({ promote: false, reason: 'invalid_payload' })
  })
})

describe('promoteCandidate compatibility boundary', () => {
  it('queues explicit manual review instead of activating a rule', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ok: true, error_code: null, candidate_id: 'cand-1', status: 'manual_review' }],
      error: null,
    })

    const result = await promoteCandidate({ rpc } as never, priceCandidate())

    expect(rpc).toHaveBeenCalledWith('queue_learning_candidate_manual_review',
      expect.objectContaining({
        p_candidate_id: 'cand-1',
        p_release_id: expect.any(String),
        p_safe_metadata: {
        gate_reason: 'gate_passed',
        automatic_promotion: false,
        source_kind: 'reviewed_job_aggregate',
        consent_basis: 'aggregate_only',
        pii_redacted: true,
        raw_text_persisted: false,
        summary_origin: 'model_generated',
      },
      }),
    )
    expect(result).toEqual({
      promoted: false,
      reason: 'MANUAL_REVIEW_REQUIRED',
      queuedForReview: true,
    })
  })

  it('keeps the Supabase client receiver when invoking the manual-review RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
        data: [{ ok: true, error_code: null, candidate_id: 'cand-1', status: 'manual_review' }],
        error: null,
      })
    const client = { rpc }

    const result = await promoteCandidate(client as never, priceCandidate())

    expect(rpc.mock.contexts[0]).toBe(client)
    expect(result).toMatchObject({
      reason: 'MANUAL_REVIEW_REQUIRED',
      queuedForReview: true,
    })
  })

  it('fails closed when the manual-review RPC rejects provenance', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ok: false, error_code: 'PROVENANCE_CONFLICT' }],
      error: null,
    })

    const result = await promoteCandidate({ rpc } as never, priceCandidate())

    expect(result).toEqual({ promoted: false, reason: 'PROVENANCE_CONFLICT' })
  })
})

// =============================================================================
// Constants sanity (so tests fail loudly if someone changes thresholds)
// =============================================================================

describe('evidence gate constants', () => {
  it('MIN_EVIDENCE is 5 per STRUCTURES.md §10C', () => {
    expect(MIN_EVIDENCE).toBe(5)
  })

  it('CONFIDENCE_THRESHOLD is reasonable (>= 0.5, <= 0.8)', () => {
    expect(CONFIDENCE_THRESHOLD).toBeGreaterThanOrEqual(0.5)
    expect(CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(0.8)
  })

  it('CONTRADICTION_MAX_RATIO is reasonable (>= 0.1, <= 0.3)', () => {
    expect(CONTRADICTION_MAX_RATIO).toBeGreaterThanOrEqual(0.1)
    expect(CONTRADICTION_MAX_RATIO).toBeLessThanOrEqual(0.3)
  })
})
