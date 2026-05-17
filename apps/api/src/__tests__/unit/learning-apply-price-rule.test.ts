import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock env BEFORE importing the module under test so the getter sees our stubs.
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

import { applyLearnedPriceRule } from '@/lib/learning/apply-price-rule'
import type { PricePriorPayload } from '@/lib/learning/types'

// =============================================================================
// Helpers
// =============================================================================

function makeRulePayload(overrides: Partial<PricePriorPayload['suggested']> = {}): PricePriorPayload {
  return {
    candidate_type: 'price_prior_update',
    scope: { service_type: 'plumbing', problem_slug: 'pipe_leak', district_code: 'q1', complexity: 'medium' },
    observed: {
      sample_size: 6, baseline_used_min: 200_000, baseline_used_max: 400_000,
      median_final_price: 375_000, p25_final_price: 360_000, p75_final_price: 390_000,
      median_estimate_min: 250_000, median_estimate_max: 350_000,
    },
    suggested: {
      shift_min: 100_000, shift_max: 50_000, new_min: 300_000, new_max: 450_000, direction: 'underestimate',
      ...overrides,
    },
    window: { from_ts: '2026-01-01T00:00:00Z', to_ts: '2026-02-01T00:00:00Z' },
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

// =============================================================================
// Tests
// =============================================================================

describe('applyLearnedPriceRule', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null when LEARNING_ENABLED=false (read-path gate off)', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'false')
    const supabase = makeSupabase([
      { id: 'r1', active_version: 1, rule_payload: makeRulePayload(), affected_district: 'q1' },
    ])
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'q1')
    expect(result).toBeNull()
    // Verify no DB query made (flag short-circuits early).
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns null when no active rule matches scope', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const supabase = makeSupabase([])
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'q1')
    expect(result).toBeNull()
  })

  it('returns null on DB error', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const supabase = makeSupabase(null, { code: 'PGRST500' })
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'q1')
    expect(result).toBeNull()
  })

  it('returns suggested range when exact-district rule found', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const payload = makeRulePayload({ new_min: 320_000, new_max: 480_000 })
    const supabase = makeSupabase([
      { id: 'rule-1', active_version: 2, rule_payload: payload, affected_district: 'q1' },
    ])
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'q1')
    expect(result).not.toBeNull()
    if (result) {
      expect(result.priceMin).toBe(320_000)
      expect(result.priceMax).toBe(480_000)
      expect(result.ruleId).toBe('rule-1')
      expect(result.ruleVersion).toBe(2)
    }
  })

  it('exact-district rule beats citywide rule when both present', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const exactPayload = makeRulePayload({ new_min: 320_000, new_max: 480_000 })
    const cityPayload = makeRulePayload({ new_min: 250_000, new_max: 350_000 })
    const supabase = makeSupabase([
      { id: 'rule-city', active_version: 1, rule_payload: cityPayload, affected_district: 'hcmc_all' },
      { id: 'rule-exact', active_version: 1, rule_payload: exactPayload, affected_district: 'q1' },
    ])
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'q1')
    expect(result?.ruleId).toBe('rule-exact')
    expect(result?.priceMin).toBe(320_000)
  })

  it('falls back to citywide rule when exact-district missing', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const cityPayload = makeRulePayload({ new_min: 250_000, new_max: 350_000 })
    const supabase = makeSupabase([
      { id: 'rule-city', active_version: 1, rule_payload: cityPayload, affected_district: 'hcmc_all' },
    ])
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'q1')
    expect(result?.ruleId).toBe('rule-city')
  })

  it('returns null when payload shape is invalid (defensive Rule #8)', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const supabase = makeSupabase([
      { id: 'rule-bad', active_version: 1, rule_payload: { wrong: 'shape' }, affected_district: 'q1' },
    ])
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'q1')
    expect(result).toBeNull()
  })

  it('returns null when new_min is non-positive', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const supabase = makeSupabase([
      { id: 'rule-bad', active_version: 1, rule_payload: makeRulePayload({ new_min: 0, new_max: 100 }), affected_district: 'q1' },
    ])
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'q1')
    expect(result).toBeNull()
  })

  it('returns null when new_max < new_min', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const supabase = makeSupabase([
      { id: 'rule-bad', active_version: 1, rule_payload: makeRulePayload({ new_min: 500_000, new_max: 300_000 }), affected_district: 'q1' },
    ])
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'q1')
    expect(result).toBeNull()
  })

  it('returns null when price values are non-integer', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const supabase = makeSupabase([
      { id: 'rule-bad', active_version: 1, rule_payload: makeRulePayload({ new_min: 300_000.5, new_max: 450_000 }), affected_district: 'q1' },
    ])
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'q1')
    expect(result).toBeNull()
  })

  it('queries only citywide districts when input district is hcmc_all', async () => {
    vi.stubEnv('LEARNING_ENABLED', 'true')
    const cityPayload = makeRulePayload({ new_min: 250_000, new_max: 350_000 })
    const supabase = makeSupabase([
      { id: 'rule-city', active_version: 1, rule_payload: cityPayload, affected_district: 'hcmc_all' },
    ])
    const result = await applyLearnedPriceRule(supabase, 'plumbing', 'pipe_leak', 'hcmc_all')
    expect(result?.ruleId).toBe('rule-city')
  })
})
