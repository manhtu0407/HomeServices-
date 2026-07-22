import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  KAEL_AGENTIC_GOLDEN_SCENARIOS,
  KAEL_CIRCUIT_BREAKER,
  buildKaelTraceEvent,
  circuitAwareProviderCandidatesForPurpose,
  evaluateKaelAgenticGoldenScenario,
  evaluateKaelPathControl,
  kaelSafeTraceEventSchema,
} from '../../../../../supabase/functions/mobile-api/_shared/kael'

const repoRoot = resolve(__dirname, '../../../../../')
const goldenFixturePath = resolve(repoRoot, 'apps/api/fixtures/kael-eval/golden-cases.json')

const baseTraceInput = {
  workflow_phase: 'in_progress',
  actor_role: 'worker',
  action: 'worker.ask_kael',
  policy_id: 'kael.path.worker_assist_own_job.v1',
  purpose: 'worker_assist',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  latency_ms: 200,
  cost_usd: 0.0004,
  validation: { status: 'pass' },
  fallback: { used: false },
  confidence: 0.82,
} as const

describe('Kael Phase 4 agentic harness guardrails', () => {
  afterEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
  })

  it('validates safe-only trace events with the required Phase 4 fields', () => {
    const trace = buildKaelTraceEvent({
      ...baseTraceInput,
      safe_metadata: {
        scenario_id: 'P9',
        route_count: 2,
      },
    })

    expect(kaelSafeTraceEventSchema.parse(trace)).toMatchObject({
      trace_id: expect.stringMatching(/^kael-trace:/),
      trace_schema_version: 'kael_trace.v1',
      workflow_phase: 'in_progress',
      actor_role: 'worker',
      action: 'worker.ask_kael',
      policy_id: 'kael.path.worker_assist_own_job.v1',
      purpose: 'worker_assist',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      latency_ms: 200,
      cost_usd: 0.0004,
      prompt_version: 'worker-assist.2026-06-04.v1',
      schema_version: 'worker_assist_answer.v1',
      validation: { status: 'pass' },
      fallback: { used: false },
      confidence: 0.82,
    })
  })

  it('rejects trace metadata that tries to store raw text, PII, or secrets', () => {
    expect(() =>
      buildKaelTraceEvent({
        ...baseTraceInput,
        safe_metadata: { raw_text: 'khach goi 0901234567' },
      }),
    ).toThrow(/TRACE_UNSAFE_KEY/)

    expect(() =>
      buildKaelTraceEvent({
        ...baseTraceInput,
        safe_metadata: { provider_code: 'sk-secret-value-12345678901234567890' },
      }),
    ).toThrow(/TRACE_UNSAFE_VALUE/)
  })

  it('allows only mapped mobile action to phase to actor to route to purpose paths', () => {
    expect(evaluateKaelPathControl({
      mobileAction: 'worker.ask_kael',
      workflowPhase: 'in_progress',
      actorRole: 'worker',
      edgeRoute: 'POST /workers/me/kael/chat/:id',
      kaelPurpose: 'worker_assist',
    })).toMatchObject({
      allowed: true,
      reason_code: 'PATH_CONTROL_ALLOWED',
    })

    expect(evaluateKaelPathControl({
      mobileAction: 'worker.ask_kael',
      workflowPhase: 'intake',
      actorRole: 'worker',
      edgeRoute: 'POST /workers/me/kael/chat/:id',
      kaelPurpose: 'worker_assist',
    })).toMatchObject({ allowed: false, reason_code: 'PATH_CONTROL_PHASE_MISMATCH' })

    expect(evaluateKaelPathControl({
      mobileAction: 'worker.ask_kael',
      workflowPhase: 'in_progress',
      actorRole: 'customer',
      edgeRoute: 'POST /workers/me/kael/chat/:id',
      kaelPurpose: 'worker_assist',
    })).toMatchObject({ allowed: false, reason_code: 'PATH_CONTROL_ACTOR_MISMATCH' })

    expect(evaluateKaelPathControl({
      mobileAction: 'worker.ask_kael',
      workflowPhase: 'in_progress',
      actorRole: 'worker',
      edgeRoute: 'POST /kael/chat',
      kaelPurpose: 'worker_assist',
    })).toMatchObject({ allowed: false, reason_code: 'PATH_CONTROL_ROUTE_MISMATCH' })

    expect(evaluateKaelPathControl({
      mobileAction: 'worker.ask_kael',
      workflowPhase: 'in_progress',
      actorRole: 'worker',
      edgeRoute: 'POST /workers/me/kael/chat/:id',
      kaelPurpose: 'price_synthesis',
    })).toMatchObject({ allowed: false, reason_code: 'PATH_CONTROL_PURPOSE_MISMATCH' })
  })

  it('reuses A5 fixtures and pins P9-P13 scenario harness assertions', () => {
    const a5Fixtures = JSON.parse(readFileSync(goldenFixturePath, 'utf8')) as Array<{ id: string }>
    expect(a5Fixtures.length).toBeGreaterThanOrEqual(75)

    expect(KAEL_AGENTIC_GOLDEN_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'P9',
      'P10',
      'P11',
      'P12',
      'P13',
    ])

    for (const scenario of KAEL_AGENTIC_GOLDEN_SCENARIOS) {
      const result = evaluateKaelAgenticGoldenScenario(scenario)
      expect(result.allowed).toBe(true)
      expect(result.trace.policy_id).toBe(scenario.policyId)
      expect(result.trace.purpose).toBe(scenario.kaelPurpose)
      expect(result.trace.workflow_phase).toBe(scenario.workflowPhase)
      expect(result.trace.actor_role).toBe(scenario.actorRole)
      expect(result.trace.fallback.used).toBe(scenario.expectedFallback)
      expect(result.trace.safe_metadata).toEqual({
        scenario_id: scenario.id,
        route_count: scenario.expectedModelRouting.length,
      })
      expect(JSON.stringify(result.trace)).not.toMatch(/0901234567|sk-|pplx-|raw_text|message|description/i)
    }
  })

  it('checks P9-P13 provider routing against the real circuit-aware route helper', () => {
    for (const scenario of KAEL_AGENTIC_GOLDEN_SCENARIOS) {
      const routes = circuitAwareProviderCandidatesForPurpose(scenario.kaelPurpose)
        .map(({ provider, model }) => ({ provider, model }))
      expect(routes).toEqual(scenario.expectedModelRouting)

      const primary = scenario.expectedModelRouting[0]?.provider
      if (!primary) continue
      KAEL_CIRCUIT_BREAKER.recordFailure({
        purpose: scenario.kaelPurpose,
        provider: primary,
        errorCode: 'HTTP_402',
      })
      const afterOpen = circuitAwareProviderCandidatesForPurpose(scenario.kaelPurpose)
        .map(({ provider, model }) => ({ provider, model }))
      expect(afterOpen.map((route) => route.provider)).not.toContain(primary)
      expect(afterOpen).toEqual(
        scenario.expectedModelRouting.filter((route) => route.provider !== primary),
      )
      KAEL_CIRCUIT_BREAKER.reset()
    }
  })
})
