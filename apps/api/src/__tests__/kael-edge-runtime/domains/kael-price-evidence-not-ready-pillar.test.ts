import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P337-kael-price-evidence-not-ready',
  invariant:
    'when analysis has no validated price evidence, Kael returns a completed not-ready analysis turn, leaves the quote blocked for review, and never presents the missing data as a system error or fabricated price',
  authority: [
    'governance/RULES.md #4 (no invented price)',
    'governance/STRUCTURES.md §9 (an honest not-ready state when no validated source exists)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/branches-post-pipeline.ts',
  layer: 'unit',
  siblings: ['P335-kael-work-reply-stream', 'P45-kael-intake-observation-failure'],
  mutation:
    'restore contentType error or failed progress for missing price evidence, or add an estimate without validated evidence — the not-ready response or no-price assertions turn red',
} as const satisfies PillarManifest

const hooks = vi.hoisted(() => ({
  emitStep: vi.fn(),
}))

vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/emit-step.ts', () => ({
  emitKaelChatStep: (...args: unknown[]) => hooks.emitStep(...args),
}))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/kael/learning/audit.ts', () => ({
  apiLogPurposeForPipelineStage: (stage: string) => stage,
  logApiCalls: vi.fn(async () => undefined),
}))

import { handleKaelChatPipelineOutcome } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/branches-post-pipeline'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael/contracts/artifact-contract'

afterEach(() => {
  hooks.emitStep.mockReset()
})

describe(`${PILLAR.id}: honest unavailable-price response`, () => {
  it('emits a completed analysis turn with a blocked quote and no estimate', async () => {
    const input = {
      client: {} as never,
      sessionId: 'session-no-price',
      requestId: 'request-no-price',
      pipeline: {
        success: false,
        code: 'NO_BASELINE',
        error: 'No validated baseline is available.',
        stageLogs: [],
      },
      artifact: buildInitialDiagnosisScopeArtifact({
        serviceType: 'hvac',
        customerGoal: 'Máy lạnh không mát.',
      }),
      service_type: 'hvac',
      language: 'vi',
      earlySafetySignals: [],
      electricalPlaybookEnabled: false,
      progressTarget: { table: 'kael_chat_sessions', id: 'session-no-price' },
      customerAnalysisDetail: 'Máy lạnh không mát dù đã vệ sinh lưới lọc.',
      safeCustomerEvidence: '',
      problemChips: [],
      district: 'Quận 3',
      currentCostUsd: 0,
      ctx: { user: { id: 'customer-no-price' } },
    }

    await handleKaelChatPipelineOutcome(input as never)

    expect(hooks.emitStep, pillarWhy(PILLAR, 'the valid no-price branch must persist one response step')).toHaveBeenCalledTimes(1)
    const step = hooks.emitStep.mock.calls[0][3]
    expect(step, pillarWhy(PILLAR, 'scope may be shown while price stays blocked')).toMatchObject({
      artifact: {
        quote_ready: false,
        quote_blockers: ['validated_price_evidence'],
        next_action: { kind: 'escalate', reason: 'validated_price_evidence_unavailable' },
      },
      turn: {
        contentType: 'analysis',
        nextStatus: 'active',
        metadata: { quote_readiness: 'validated_price_evidence_unavailable' },
      },
      progress: { stage: 'price_synthesis', status: 'completed', progress: 1 },
    })
    expect(step.progress, pillarWhy(PILLAR, 'a valid not-ready result must not surface as a failed request')).not.toHaveProperty('failureReason')
    expect(step.turn, pillarWhy(PILLAR, 'no price source means no estimate payload')).not.toHaveProperty('estimate')
    expect(step.turn.text, pillarWhy(PILLAR, 'explain why no offer is shown')).toContain('chưa có dữ liệu giá đã kiểm chứng')
  })

  it('keeps both validated-price fallback branches out of the error state', () => {
    const source = readFileSync(
      resolve(process.cwd(), '../../supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support.ts'),
      'utf8',
    )
    const branches = [
      priceFailureBlock(source, source.indexOf('export async function finalizeKaelChatEstimate(')),
      priceFailureBlock(source, source.indexOf('async function finalizePreviousReleaseEstimate(')),
    ]

    for (const branch of branches) {
      expect(branch, pillarWhy(PILLAR, 'each estimate path must make the same honest no-price response')).toContain('contentType: "analysis"')
      expect(branch, pillarWhy(PILLAR, 'the no-price decision completed without producing an estimate')).toContain('status: "completed"')
      expect(branch, pillarWhy(PILLAR, 'the blocker remains explicit in metadata')).toContain('validated_price_evidence_unavailable')
      expect(branch, pillarWhy(PILLAR, 'missing price evidence is not shown as a system error')).not.toContain('contentType: "error"')
    }
  })
})

function priceFailureBlock(source: string, fromIndex: number) {
  const start = source.indexOf('if (!hasValidatedKaelPriceEvidence({', fromIndex)
  if (start < 0) return ''
  const end = source.indexOf('return;', start)
  return end < 0 ? source.slice(start) : source.slice(start, end)
}
