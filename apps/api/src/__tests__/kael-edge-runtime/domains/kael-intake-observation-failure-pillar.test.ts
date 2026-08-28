import { describe, expect, it, vi } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { runKaelBaselineStage } from '../../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/stage-baseline'
import type { runKaelParallelStage } from '../../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/stage-parallel'
import type { PreparedKaelPipeline } from '../../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/prepare'
import type { IntakeEvalObservation, PipelineStageLog, QueryBuilderLike } from '../../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'

export const PILLAR = {
  id: 'P45-kael-intake-observation-failure',
  invariant:
    'a downstream baseline failure remains an honest no-price result while preserving the already-classified intake observation for the evaluation and response contracts',
  authority: [
    'governance/RULES.md #8 (provider or data failure must not become fake success)',
    'governance/RULES.md #9 (structured observations must remain safe metadata)',
    'governance/Plan.md §52 (zero errored records is required before paired delta evidence)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/pipeline/stage-baseline.ts',
  layer: 'integration',
  siblings: ['P11-kael-routing-conformance', 'P15-kael-inbound-safety', 'P17-adversarial-surface-matrix'],
  mutation:
    'restore the throw for a failed baseline stage — the failure-path assertion becomes a rejected promise and the preserved observation is no longer available',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const intakeObservation: IntakeEvalObservation = {
  scopeSignal: 'in_scope',
  suggestedService: null,
  problemSlug: 'flickering_light',
  needsClarification: false,
  safetySignals: [],
  modelId: 'deepseek-v4-pro',
  promptVersion: '2026-08-15.v3',
  playbookVersion: null,
}

function preparedPipeline(): PreparedKaelPipeline {
  const stageLogs: PipelineStageLog[] = []
  const query: QueryBuilderLike = {
    select: () => query,
    eq: () => query,
    in: () => query,
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected)
    },
  }
  return {
    input: {
      serviceType: 'electrical',
      problemChips: ['Đèn chập chờn'],
      description: 'Một đèn phòng khách bị chập chờn.',
      district: 'q7',
    },
    supabase: { from: () => query },
    secrets: {},
    serviceType: 'electrical',
    district: 'q7',
    language: 'vi',
    problemChips: ['Đèn chập chờn'],
    description: 'Một đèn phòng khách bị chập chờn.',
    modelDescription: 'Một đèn phòng khách bị chập chờn.',
    photoUrls: [],
    stageLogs,
    learningApplications: [],
    progressTarget: { table: 'kael_chat_sessions', id: 'session-p45' },
    electricalPlaybookEnabled: false,
    deterministicSafetySignals: [],
    withDeterministicSafetyGuidance: (text) => text,
    spendGate: { client: {}, actorId: null },
    recordProviderSpendIfEnforced: vi.fn(async () => undefined),
  }
}

function failedParallelRun(): Awaited<ReturnType<typeof runKaelParallelStage>>['parallelRun'] {
  return {
    elapsedMs: 12,
    results: [{
      label: 'baseline',
      purpose: 'problem_synthesis',
      status: 'failed',
      elapsedMs: 12,
      fallbackUsed: false,
      failureReason: 'baseline lookup unavailable',
    }],
  }
}

describe('baseline failure observation contract', () => {
  it('returns a structured no-baseline failure with the prior observation', async () => {
    const prepared = preparedPipeline()
    const result = await runKaelBaselineStage(prepared, {
      parallelRun: failedParallelRun(),
      effectiveComplexity: 'medium',
      referenceComplexity: 'medium',
      mergedSafetySignals: [],
      intakeObservation,
    })

    expect(
      result.ok,
      pillarWhy(PILLAR, 'a failed price lookup must not reject after intent has already produced evidence'),
    ).toBe(false)
    if (result.ok) throw new Error(pillarWhy(PILLAR, 'expected the baseline stage to return a failure result'))
    expect(
      result.failure,
      pillarWhy(PILLAR, 'the honest failure branch must retain the structured intake observation'),
    ).toMatchObject({
      success: false,
      code: 'NO_BASELINE',
      intakeObservation,
    })
    expect(
      prepared.recordProviderSpendIfEnforced,
      pillarWhy(PILLAR, 'a failed stage still closes its provider-spend accounting path'),
    ).toHaveBeenCalledOnce()
  })
})
