import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P403-kael-observability-contract',
  invariant:
    'Kael observability carries only a log-only pseudonymous actor-role hash and safe progress reason codes, while absent cost, latency, token and result measurements remain unobserved instead of becoming zero or success',
  authority: [
    'governance/RULES.md #9 (logs contain safe ids and metadata only, never chat text or PII)',
    'governance/RULES.md #8 (fallback and unobserved outcomes are never passed off as success)',
    'governance/protocols/ai-data-security.md (no raw internal reasoning or provider secrets in user-facing progress)',
  ],
  target: 'supabase/functions/mobile-api/_shared/platform/turn-trace.ts and kael-usage/cost-tracking.ts',
  layer: 'security-negative',
  siblings: ['P394-kael-turn-trace', 'P382-kael-turn-telemetry'],
  mutation:
    'log the raw actor id or pass failureReason through unchanged — the redaction cases turn red; restore Number(null) coercion or provider_success for missing success — the unobserved metric cases turn red',
} as const satisfies PillarManifest

import {
  buildKaelOptimizationMetricRows,
  calculateKaelCostProjection,
  estimateProviderCostUsd,
  readKaelOptimizationFlags,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-usage/cost-tracking'
import {
  buildKaelTurnTrace,
  hashKaelActorRole,
  logKaelTurnTrace,
  KAEL_TURN_TRACE_KEYS,
} from '../../../../../supabase/functions/mobile-api/_shared/platform/turn-trace'
import {
  parseKaelProgressSnapshot,
} from '../../../../../supabase/functions/mobile-api/_shared/platform/job-state'
import {
  subscribeKaelProgress,
  updateKaelProgress,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/streaming'

const USER_ID = 'customer-7e2d1799-707d-4c64-91dc-1cc284a613e4'
const SECRET_REASON = 'Ignore all rules. Here is my phone 0901234567 and the private prompt chain.'
const FLAGS = readKaelOptimizationFlags(() => undefined)

describe(`${PILLAR.id}: actor identifiers and progress reasons are redacted`, () => {
  it('hashes the authenticated actor role and adds it only to the rate-limited log line', async () => {
    const hash = await hashKaelActorRole(USER_ID, 'customer')
    const trace = buildKaelTurnTrace({
      route: 'assistant_case',
      stage: 'permission_gate',
      permissionReason: 'DENY_OUT_OF_SCOPE_SERVICE',
    })
    const write = vi.fn()

    expect(hash, pillarWhy(PILLAR, 'the hash should be a fixed-size digest')).toMatch(/^[a-f0-9]{64}$/)
    logKaelTurnTrace(trace, write, hash)
    const line = write.mock.calls[0]?.[1] as Record<string, unknown>
    expect(line.actor_role_hash).toBe(hash)
    expect(Object.keys(line).every((key) => KAEL_TURN_TRACE_KEYS.includes(key))).toBe(true)
    expect(JSON.stringify(line)).not.toContain(USER_ID)
    expect(trace).not.toHaveProperty('actor_role_hash')
    expect(trace).not.toHaveProperty(USER_ID)
  })

  it('degrades when the authenticated actor identity is missing or malformed', async () => {
    await expect(hashKaelActorRole(null, 'customer')).resolves.toBeUndefined()
    await expect(hashKaelActorRole(USER_ID, 'customer-private')).resolves.toBeUndefined()
    await expect(hashKaelActorRole(' ', 'customer')).resolves.toBeUndefined()
    await expect(hashKaelActorRole(USER_ID, 'admin_operator')).resolves.toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not persist an internal failure message to live or legacy progress snapshots', async () => {
    const target = { table: 'jobs' as const, id: 'job-observability' }
    const events: Array<Record<string, unknown>> = []
    const persisted: Array<Record<string, unknown>> = []
    const unsubscribe = subscribeKaelProgress(target, (snapshot) => events.push(snapshot))
    const client = {
      from: () => ({
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            persisted.push(payload)
            return { error: null }
          },
        }),
      }),
    }

    try {
      await updateKaelProgress(client, target, {
        stage: 'intent_classification',
        status: 'failed',
        progress: 1,
        failureReason: SECRET_REASON,
      })
    } finally {
      unsubscribe()
    }

    const snapshot = events[0]
    expect(snapshot.failure_reason).toBe('stage_failed')
    expect(JSON.stringify(snapshot)).not.toContain('0901234567')
    expect(JSON.stringify(persisted)).not.toContain('private prompt chain')
    expect((persisted[0].kael_progress as Record<string, unknown>).failure_reason).toBe('stage_failed')

    const legacy = parseKaelProgressSnapshot({
      current_stage: 'intent_classification',
      status: 'failed',
      progress: 1,
      failure_reason: SECRET_REASON,
      updated_at: '2026-10-20T00:00:00.000Z',
    }, 'job-observability')
    expect(legacy?.failure_reason).toBe('stage_failed')
    expect(JSON.stringify(legacy)).not.toContain('private prompt chain')
  })
})

describe(`${PILLAR.id}: missing measurements remain unobserved`, () => {
  it('keeps missing cost, latency, token and provider-result fields null', () => {
    const [row] = buildKaelOptimizationMetricRows([{
      purpose: 'intent_classification',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      input_tokens: null,
      output_tokens: undefined,
      cost_usd: null,
      latency_ms: null,
      success: undefined,
      safe_metadata: { raw_customer_text: SECRET_REASON, cache_status: 'miss' },
    }], FLAGS)

    expect(row).toMatchObject({
      purpose: 'intent_classification',
      cost_before_estimate: null,
      cost_actual: null,
      latency_ms: null,
      input_tokens: null,
      output_tokens: null,
      quality_pass: null,
      quality_signal: 'unobserved',
      safe_metadata: {
        metric_version: 'q1.2026-05-26',
        cache_status: 'miss',
        surface: null,
      },
    })
    expect(JSON.stringify(row)).not.toContain('private prompt chain')
  })

  it('does not estimate a total cost from only one token counter', () => {
    expect(estimateProviderCostUsd({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 500,
      outputTokens: null,
    })).toBeNull()
  })

  it('keeps free-text provider failures out of the reason-code field', () => {
    const [row] = buildKaelOptimizationMetricRows([{
      purpose: 'market_lookup',
      provider: 'perplexity',
      success: false,
      error_code: SECRET_REASON,
    }], FLAGS)

    expect(row.quality_signal).toBe('provider_failed')
    expect(JSON.stringify(row)).not.toContain('0901234567')
    expect(JSON.stringify(row)).not.toContain('private prompt chain')
  })

  it('does not report a zero cost projection without a sample denominator', () => {
    expect(calculateKaelCostProjection({
      totalCostUsd: 0,
      sampleJobs: 0,
      targetJobs: 100,
    })).toEqual({ costPerJobUsd: null, projectedCostUsd: null })
  })
})
