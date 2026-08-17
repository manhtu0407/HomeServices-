import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  KAEL_ROUTING_CONFIG,
  maxTokensForPurpose,
  type ProviderRoute,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/routing.config'
import {
  KAEL_PURPOSES,
  type KaelPurpose,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'

export const PILLAR = {
  id: 'P11-kael-routing-conformance',
  invariant:
    'every Kael purpose routes to a declared model within its latency, cost and token policy, and no call site may invent a model id',
  authority: [
    'governance/RULES.md #2 (provider/model pairs come from the model ladder, not a call site)',
    'governance/RULES.md #10 (no unbounded network call)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-providers/routing.config.ts',
  layer: 'static-type',
  siblings: ['P14-kael-chat-cost-cap', 'P16-ai-spend-envelope', 'P02-bounded-response-read'],
  mutation:
    'add a route with an undeclared model id such as gpt-4o, or raise a latencyBudgetMs above 20000 — the allowlist and the budget-ceiling cases turn red',
} as const satisfies PillarManifest

// Naming every purpose here makes tsc the assertion: adding a KaelPurpose without deciding what it
// costs is a compile error, not a silently-defaulted route.
const PURPOSE_IS_USER_VISIBLE = {
  intent_classification: true,
  vision_analysis: true,
  clarification: true,
  problem_synthesis: true,
  market_lookup: true,
  price_synthesis: true,
  advisory_generation: true,
  worker_brief: false,
  scope_change: true,
  job_incident: true,
  post_job_learning: false,
  educational_response: true,
  worker_assist: true,
} as const satisfies Record<KaelPurpose, boolean>

// The ladder's entire vocabulary. A model id outside this set has never been priced, and
// kael-usage/model-pricing.ts would fall back rather than bill it correctly.
const DECLARED_MODELS = new Set([
  'claude-sonnet-5',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-8',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'sonar',
  'sonar-pro',
])

// RULES #10 lists 20s as the longest default any provider is given. A budget above it would be a
// network call with no meaningful bound, since the budget is passed straight through as timeoutMs.
const LONGEST_DECLARED_TIMEOUT_MS = 20_000

const ENABLED = () => 'true'
const DISABLED = () => undefined

function routesOf(purpose: KaelPurpose): ProviderRoute[] {
  const entry = KAEL_ROUTING_CONFIG[purpose]
  return [
    entry.primary,
    entry.simpleNormalChatPrimary,
    entry.modelFallback,
    entry.fallback,
    entry.escalation,
  ].filter((route): route is ProviderRoute => route !== undefined)
}

describe('KAEL_ROUTING_CONFIG', () => {
  it('covers every declared purpose exactly once', () => {
    expect(
      Object.keys(KAEL_ROUTING_CONFIG).sort(),
      pillarWhy(PILLAR, 'a purpose with no routing entry would resolve to undefined at call time'),
    ).toEqual([...KAEL_PURPOSES].sort())
  })

  it.each(KAEL_PURPOSES)('routes %s only to models the ladder declares', (purpose) => {
    for (const route of routesOf(purpose)) {
      expect(
        DECLARED_MODELS.has(route.model),
        pillarWhy(PILLAR, `${purpose} routes to '${route.model}' on ${route.provider}`),
      ).toBe(true)
    }
  })

  it.each(KAEL_PURPOSES)('bounds the latency budget for %s', (purpose) => {
    const { latencyBudgetMs } = KAEL_ROUTING_CONFIG[purpose]
    expect(
      latencyBudgetMs,
      pillarWhy(PILLAR, 'the budget is passed through as timeoutMs, so zero would mean no bound'),
    ).toBeGreaterThan(0)
    expect(
      latencyBudgetMs,
      pillarWhy(PILLAR, `${purpose} would outlive the longest timeout any provider is given`),
    ).toBeLessThanOrEqual(LONGEST_DECLARED_TIMEOUT_MS)
  })

  it.each(KAEL_PURPOSES)('keeps the cost ceiling for %s under the daily cap', (purpose) => {
    const { costCeilingUsd, dailyProviderCapUsd } = KAEL_ROUTING_CONFIG[purpose]
    expect(
      costCeilingUsd,
      pillarWhy(PILLAR, 'a zero or negative ceiling cannot refuse anything'),
    ).toBeGreaterThan(0)
    expect(
      costCeilingUsd,
      pillarWhy(PILLAR, `one ${purpose} call must not be able to exhaust the whole day`),
    ).toBeLessThanOrEqual(dailyProviderCapUsd)
  })

  it.each(KAEL_PURPOSES)('caps output tokens for %s', (purpose) => {
    expect(
      KAEL_ROUTING_CONFIG[purpose].maxTokens,
      pillarWhy(PILLAR, 'an uncapped response is an unbounded bill'),
    ).toBeGreaterThan(0)
  })

  // An escalation that lands on the same model spends more and learns nothing, which is the
  // failure mode of copying a row and forgetting to change the target.
  it.each(KAEL_PURPOSES)('escalates %s to a different model than the primary', (purpose) => {
    const { primary, escalation } = KAEL_ROUTING_CONFIG[purpose]
    if (escalation === undefined) return
    expect(
      `${escalation.provider}:${escalation.model}`,
      pillarWhy(PILLAR, `${purpose} escalates without changing model`),
    ).not.toBe(`${primary.provider}:${primary.model}`)
  })

  it.each(KAEL_PURPOSES)('marks %s user-visible exactly as the ladder records', (purpose) => {
    expect(
      KAEL_ROUTING_CONFIG[purpose].userVisible,
      pillarWhy(PILLAR, 'visibility decides whether output must clear the user-facing guardrails'),
    ).toBe(PURPOSE_IS_USER_VISIBLE[purpose])
  })
})

describe('maxTokensForPurpose', () => {
  // The wiring between the ladder and a call site used to be asserted by grepping the source for
  // the string `timeoutMs: route.latencyBudgetMs`. This exercises the clamp instead.
  it.each(KAEL_PURPOSES)('clamps a caller asking for more than %s allows', (purpose) => {
    const ceiling = KAEL_ROUTING_CONFIG[purpose].maxTokens
    expect(
      maxTokensForPurpose(purpose, ceiling + 5_000, ENABLED),
      pillarWhy(PILLAR, `a call site must not raise ${purpose} above its declared cap`),
    ).toBe(ceiling)
  })

  it('leaves a caller asking for less than the ceiling alone', () => {
    const ceiling = KAEL_ROUTING_CONFIG.worker_brief.maxTokens
    expect(
      maxTokensForPurpose('worker_brief', ceiling - 1, ENABLED),
      pillarWhy(PILLAR, 'the ladder is a ceiling, not a quota to spend'),
    ).toBe(ceiling - 1)
  })

  it('returns the requested budget untouched while the cap flag is off', () => {
    const ceiling = KAEL_ROUTING_CONFIG.worker_brief.maxTokens
    expect(
      maxTokensForPurpose('worker_brief', ceiling + 5_000, DISABLED),
      pillarWhy(PILLAR, 'the clamp is opt-in, so a disabled flag must not silently enforce it'),
    ).toBe(ceiling + 5_000)
  })
})
