import { describe, it, expect } from 'vitest'
import {
  avgRating,
  scopeChangeRate,
  commonTags,
  chooseSuggestion,
  caseConfidence,
  computeAnalysisPayload,
  type CaseObservation,
} from '@/lib/learning/case-review'

// =============================================================================
// avgRating
// =============================================================================

describe('avgRating', () => {
  it('returns 0 for empty input', () => {
    expect(avgRating([])).toBe(0)
  })

  it('computes mean of ratings', () => {
    const obs: CaseObservation[] = [
      { rating: 5, scopeChangeRequested: false, reviewTags: [] },
      { rating: 3, scopeChangeRequested: false, reviewTags: [] },
      { rating: 4, scopeChangeRequested: false, reviewTags: [] },
    ]
    expect(avgRating(obs)).toBe(4)
  })
})

// =============================================================================
// scopeChangeRate
// =============================================================================

describe('scopeChangeRate', () => {
  it('returns 0 for empty input', () => {
    expect(scopeChangeRate([])).toBe(0)
  })

  it('returns 0.5 when half observations had scope change', () => {
    const obs: CaseObservation[] = [
      { rating: 5, scopeChangeRequested: true, reviewTags: [] },
      { rating: 5, scopeChangeRequested: false, reviewTags: [] },
    ]
    expect(scopeChangeRate(obs)).toBe(0.5)
  })

  it('returns 1.0 when all had scope change', () => {
    const obs: CaseObservation[] = Array.from({ length: 5 }, () => ({
      rating: 5,
      scopeChangeRequested: true,
      reviewTags: [],
    }))
    expect(scopeChangeRate(obs)).toBe(1.0)
  })
})

// =============================================================================
// commonTags
// =============================================================================

describe('commonTags', () => {
  it('returns top 3 tags by frequency desc', () => {
    const obs: CaseObservation[] = [
      { rating: 5, scopeChangeRequested: false, reviewTags: ['Đúng giờ', 'Sạch sẽ'] },
      { rating: 5, scopeChangeRequested: false, reviewTags: ['Đúng giờ', 'Chuyên nghiệp'] },
      { rating: 5, scopeChangeRequested: false, reviewTags: ['Đúng giờ'] },
      { rating: 5, scopeChangeRequested: false, reviewTags: ['Sạch sẽ'] },
    ]
    const top = commonTags(obs, 3)
    expect(top[0]).toBe('Đúng giờ')
    expect(top.length).toBe(3)
  })

  it('breaks ties alphabetically', () => {
    const obs: CaseObservation[] = [
      { rating: 5, scopeChangeRequested: false, reviewTags: ['B', 'A', 'C'] },
    ]
    expect(commonTags(obs, 3)).toEqual(['A', 'B', 'C'])
  })

  it('returns empty for no observations', () => {
    expect(commonTags([], 3)).toEqual([])
  })
})

// =============================================================================
// chooseSuggestion
// =============================================================================

describe('chooseSuggestion', () => {
  function obsWithRate(rate: number, n: number = 10): CaseObservation[] {
    const scopeChangedCount = Math.round(rate * n)
    return Array.from({ length: n }, (_, i) => ({
      rating: 4,
      scopeChangeRequested: i < scopeChangedCount,
      reviewTags: [],
    }))
  }

  it('emits raise_complexity_prior small→medium when rate >= 0.4 and current=small', () => {
    const s = chooseSuggestion(obsWithRate(0.5), 'small')
    expect(s).not.toBeNull()
    if (s) {
      expect(s.kind).toBe('raise_complexity_prior')
      if (s.kind === 'raise_complexity_prior') {
        expect(s.from).toBe('small')
        expect(s.to).toBe('medium')
      }
    }
  })

  it('emits raise_complexity_prior medium→large when rate >= 0.4 and current=medium', () => {
    const s = chooseSuggestion(obsWithRate(0.6), 'medium')
    expect(s?.kind).toBe('raise_complexity_prior')
    if (s?.kind === 'raise_complexity_prior') {
      expect(s.to).toBe('large')
    }
  })

  it('emits null when current=large (already at ceiling)', () => {
    expect(chooseSuggestion(obsWithRate(0.8), 'large')).toBeNull()
  })

  it('emits null when rate < 0.4', () => {
    expect(chooseSuggestion(obsWithRate(0.3), 'small')).toBeNull()
  })

  it('boundary: rate exactly 0.4 fires', () => {
    // 4 of 10 = exactly 0.4
    expect(chooseSuggestion(obsWithRate(0.4), 'small')).not.toBeNull()
  })
})

// =============================================================================
// caseConfidence
// =============================================================================

describe('caseConfidence', () => {
  function obsWithRate(rate: number, n: number = 10): CaseObservation[] {
    const scopeChangedCount = Math.round(rate * n)
    return Array.from({ length: n }, (_, i) => ({
      rating: 4,
      scopeChangeRequested: i < scopeChangedCount,
      reviewTags: [],
    }))
  }

  it('returns 0 below scope-change threshold', () => {
    expect(caseConfidence(obsWithRate(0.3))).toBe(0)
  })

  it('returns ~0.5 at threshold (rate=0.4)', () => {
    expect(caseConfidence(obsWithRate(0.4))).toBeCloseTo(0.5, 2)
  })

  it('caps at 0.95 for very high rates', () => {
    expect(caseConfidence(obsWithRate(1.0))).toBeLessThanOrEqual(0.95)
  })

  it('returns 0 for empty input', () => {
    expect(caseConfidence([])).toBe(0)
  })
})

// =============================================================================
// computeAnalysisPayload
// =============================================================================

describe('computeAnalysisPayload', () => {
  it('composes full payload with valid suggestion', () => {
    const scope = {
      service_type: 'plumbing' as const,
      problem_slug: 'pipe_leak',
      district_code: 'q1',
    }
    const observations: CaseObservation[] = [
      { rating: 4, scopeChangeRequested: true, reviewTags: ['Đúng giờ'] },
      { rating: 5, scopeChangeRequested: true, reviewTags: ['Sạch sẽ'] },
      { rating: 4, scopeChangeRequested: false, reviewTags: ['Đúng giờ'] },
      { rating: 5, scopeChangeRequested: true, reviewTags: [] },
      { rating: 4, scopeChangeRequested: true, reviewTags: [] },
    ]
    const payload = computeAnalysisPayload(scope, observations, {
      kind: 'raise_complexity_prior',
      from: 'small',
      to: 'medium',
      rationale: 'test',
    })
    expect(payload.candidate_type).toBe('analysis_rule')
    expect(payload.observed.sample_size).toBe(5)
    expect(payload.observed.scope_change_rate).toBeCloseTo(0.8, 2)
    expect(payload.observed.avg_rating).toBeCloseTo(4.4, 2)
    expect(payload.suggested.kind).toBe('raise_complexity_prior')
  })

  it('payload contains no PII (Rule #9 audit)', () => {
    const scope = {
      service_type: 'plumbing' as const,
      problem_slug: 'pipe_leak',
      district_code: 'q1',
    }
    const observations: CaseObservation[] = [
      { rating: 5, scopeChangeRequested: true, reviewTags: ['Đúng giờ'] },
    ]
    const payload = computeAnalysisPayload(scope, observations, {
      kind: 'raise_complexity_prior',
      from: 'small',
      to: 'medium',
      rationale: 'test',
    })
    const json = JSON.stringify(payload)
    expect(json).not.toMatch(/phone|cccd|address|bank|chat|@.*\.com/i)
  })
})
