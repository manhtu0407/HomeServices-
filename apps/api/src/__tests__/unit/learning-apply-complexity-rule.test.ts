import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test',
    supabaseServiceRoleKey: 'test',
    get learningEnabled() {
      return process.env.LEARNING_ENABLED === 'true'
    },
    get learningAutopromoteEnabled() {
      return process.env.LEARNING_AUTOPROMOTE_ENABLED === 'true'
    },
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: <T,>(p: PromiseLike<T>) => p,
  DbTimeoutError: class extends Error {},
}))

import { applyLearnedComplexityRule } from '@/lib/learning/apply-complexity-rule'
import type { AnalysisRulePayload, AnalysisRuleSuggestion } from '@/lib/learning/types'

function makeAnalysisPayload(suggestion: AnalysisRuleSuggestion): AnalysisRulePayload {
  return {
    candidate_type: 'analysis_rule',
    scope: { service_type: 'plumbing', problem_slug: 'pipe_leak', district_code: 'q1' },
    observed: {
      sample_size: 6,
      scope_change_rate: 0.6,
      avg_rating: 4.2,
      common_tags: ['Đúng giờ'],
    },
    suggested: suggestion,
  }
}

function makeSupabase(rows: Array<{ id: string; active_version: number; rule_payload: unknown; affected_district: string }> | null, error: { code: string } | null = null) {
  return {
    from: vi.fn(() => {
      const chain: any = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.in = vi.fn(() => chain)
      chain.then = (cb: (v: { data: typeof rows; error: typeof error }) => unknown) =>
        Promise.resolve({ data: rows, error }).then(cb)
      return chain
    }),
  } as any
}

describe('applyLearnedComplexityRule', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null when LEARNING_ENABLED=false', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'false')
    const supabase = makeSupabase([])
    const result = await applyLearnedComplexityRule(supabase, 'plumbing', 'pipe_leak', 'q1', 'small')
    expect(result).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('raises complexity small→medium when matching rule active', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const payload = makeAnalysisPayload({
      kind: 'raise_complexity_prior',
      from: 'small',
      to: 'medium',
      rationale: 'test',
    })
    const supabase = makeSupabase([
      { id: 'rule-1', active_version: 1, rule_payload: payload, affected_district: 'q1' },
    ])
    const result = await applyLearnedComplexityRule(supabase, 'plumbing', 'pipe_leak', 'q1', 'small')
    expect(result?.newComplexity).toBe('medium')
    expect(result?.fromComplexity).toBe('small')
    expect(result?.ruleId).toBe('rule-1')
  })

  it('raises medium→large', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const payload = makeAnalysisPayload({
      kind: 'raise_complexity_prior',
      from: 'medium',
      to: 'large',
      rationale: 'test',
    })
    const supabase = makeSupabase([
      { id: 'rule-1', active_version: 1, rule_payload: payload, affected_district: 'q1' },
    ])
    const result = await applyLearnedComplexityRule(supabase, 'plumbing', 'pipe_leak', 'q1', 'medium')
    expect(result?.newComplexity).toBe('large')
  })

  it('does NOT raise when current complexity is already higher than rule.from', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    // Rule says raise small→medium, but current is large — should not lower.
    const payload = makeAnalysisPayload({
      kind: 'raise_complexity_prior',
      from: 'small',
      to: 'medium',
      rationale: 'test',
    })
    const supabase = makeSupabase([
      { id: 'rule-1', active_version: 1, rule_payload: payload, affected_district: 'q1' },
    ])
    const result = await applyLearnedComplexityRule(supabase, 'plumbing', 'pipe_leak', 'q1', 'large')
    expect(result).toBeNull()
  })

  it('returns null when suggestion kind is not raise_complexity_prior', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const payload = makeAnalysisPayload({
      kind: 'add_clarification',
      question_template_id: 'tpl-1',
      rationale: 'test',
    })
    const supabase = makeSupabase([
      { id: 'rule-1', active_version: 1, rule_payload: payload, affected_district: 'q1' },
    ])
    const result = await applyLearnedComplexityRule(supabase, 'plumbing', 'pipe_leak', 'q1', 'small')
    expect(result).toBeNull()
  })

  it('returns null on invalid payload shape', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const supabase = makeSupabase([
      { id: 'rule-bad', active_version: 1, rule_payload: { wrong: 'shape' }, affected_district: 'q1' },
    ])
    const result = await applyLearnedComplexityRule(supabase, 'plumbing', 'pipe_leak', 'q1', 'small')
    expect(result).toBeNull()
  })

  it('returns null on DB error', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const supabase = makeSupabase(null, { code: 'PGRST500' })
    const result = await applyLearnedComplexityRule(supabase, 'plumbing', 'pipe_leak', 'q1', 'small')
    expect(result).toBeNull()
  })

  it('prefers exact-district over citywide rule', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const exact = makeAnalysisPayload({
      kind: 'raise_complexity_prior', from: 'small', to: 'large', rationale: 'exact',
    })
    const city = makeAnalysisPayload({
      kind: 'raise_complexity_prior', from: 'small', to: 'medium', rationale: 'city',
    })
    const supabase = makeSupabase([
      { id: 'rule-city', active_version: 1, rule_payload: city, affected_district: 'hcmc_all' },
      { id: 'rule-exact', active_version: 1, rule_payload: exact, affected_district: 'q1' },
    ])
    const result = await applyLearnedComplexityRule(supabase, 'plumbing', 'pipe_leak', 'q1', 'small')
    expect(result?.ruleId).toBe('rule-exact')
    expect(result?.newComplexity).toBe('large')
  })
})
