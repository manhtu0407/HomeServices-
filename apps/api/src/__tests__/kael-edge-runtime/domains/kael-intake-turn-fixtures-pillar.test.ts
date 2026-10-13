import { describe, expect, it, vi } from 'vitest'

import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael/contracts/artifact-contract'
import { finalizeUnpricedStage1Intake } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support'
import type { ActiveIntakePolicy } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-intake-policy'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P372-customer-intake-turn-fixtures',
  invariant:
    'fixture-backed Customer intake stays active while required Tier A details are missing and becomes ready for an RFQ only when complete, without showing a fabricated price or calling a provider',
  authority: [
    'governance/RULES.md #4 (no invented price)',
    'governance/RULES.md #8 (failure or incomplete evidence must not become fake success)',
    'governance/STRUCTURES.md §9 (an honest not-ready state when no validated price exists)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support.ts',
  layer: 'integration',
  siblings: ['P45-kael-intake-observation-failure', 'P337-kael-price-evidence-not-ready', 'P369-customer-kael-turn-http'],
  mutation:
    'mark a missing Tier A intake ready or leave a complete RFQ intake active; the paired status and follow-up assertions turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const SESSION_ID = '37200000-0000-4000-8000-000000000001'
const DETAIL = 'Vòi bếp rò nước tại khớp nối dưới bồn rửa.'

function intakePolicy(missingTierA: string[] = []): ActiveIntakePolicy {
  return {
    policyId: 'plumbing-rfq-v1',
    version: 1,
    quoteMode: 'rfq',
    tierAFields: ['address_label'],
    tierBSlots: [],
    questionOverrides: { address_label: { vi: 'Bạn vui lòng bổ sung địa chỉ căn hộ.' } },
    capabilityRequirements: [],
    safetyRequirements: [],
    evidenceRequirements: {
      minimumSourceCount: 0,
      minimumHighTrustSourceCount: 0,
      requiresActiveBaseline: false,
      allowLiveMarketEvidence: false,
      unavailableFallback: null,
    },
    missingTierA,
  }
}

function clientForTurn() {
  return makeSequenceClient([
    { data: { id: SESSION_ID }, error: null },
    { data: { id: SESSION_ID, total_turns: 1, total_cost_usd: 0, safe_metadata: {} }, error: null },
    { data: { id: 'kael-turn-372' }, error: null },
    { data: { id: SESSION_ID }, error: null },
  ])
}

function turnRow(client: ReturnType<typeof clientForTurn>) {
  const call = client.calls.find(({ table }) => table === 'kael_chat_turns')
  return call?.operations.find(([operation]) => operation === 'insert')?.[1] as Record<string, unknown> | undefined
}

function sessionUpdate(client: ReturnType<typeof clientForTurn>, status: string) {
  return client.calls
    .filter(({ table }) => table === 'kael_chat_sessions')
    .flatMap(({ operations }) => operations)
    .map(([, value]) => value as Record<string, unknown> | undefined)
    .find((value) => value?.status === status)
}

function inputForTurn(
  client: ReturnType<typeof clientForTurn>,
  policy: ActiveIntakePolicy,
) {
  return {
    client: client as never,
    sessionId: SESSION_ID,
    artifact: buildInitialDiagnosisScopeArtifact({ serviceType: 'plumbing', customerGoal: DETAIL }),
    serviceProblemId: 'plumbing-leak',
    serviceType: 'plumbing' as const,
    customerAnalysisDetail: DETAIL,
    problemChips: ['leak'],
    district: 'q3',
    language: 'vi' as const,
    policy,
    profileFacts: { problem_slug: 'leaking_pipe_joint' },
    responseSafetySignals: [],
    costUsd: 0,
  }
}

describe('Customer intake turn fixtures', () => {
  it('keeps the intake active and asks for a missing required address detail', async () => {
    const client = clientForTurn()
    const fetchMock = vi.fn(async () => {
      throw new Error('Unexpected provider request in fixture test')
    })
    vi.stubGlobal('fetch', fetchMock)

    await finalizeUnpricedStage1Intake(inputForTurn(client, intakePolicy(['address_label'])))

    const turn = turnRow(client)
    expect(turn, pillarWhy(PILLAR, 'missing required detail must produce a persisted clarification')).toMatchObject({
      role: 'kael',
      content_type: 'clarification',
      text_content: 'Bạn vui lòng bổ sung địa chỉ căn hộ.',
      safe_metadata: {
        quote_readiness: 'tier_a_incomplete',
        intake_coverage: {
          order_eligible: false,
          missing_required_fields: ['address_label'],
          confirmation_kind: 'none',
          next_action: 'collect_required',
        },
      },
    })
    expect(sessionUpdate(client, 'active'), pillarWhy(PILLAR, 'an incomplete intake must not become ready')).toBeTruthy()
    expect(turn, pillarWhy(PILLAR, 'clarification must not invent a quote')).not.toHaveProperty('estimate')
    expect(fetchMock, pillarWhy(PILLAR, 'fixture intake must not call an AI or external provider')).not.toHaveBeenCalled()
  })

  it('marks a complete RFQ intake ready for worker quotes without showing a price', async () => {
    const client = clientForTurn()
    const fetchMock = vi.fn(async () => {
      throw new Error('Unexpected provider request in fixture test')
    })
    vi.stubGlobal('fetch', fetchMock)

    await finalizeUnpricedStage1Intake(inputForTurn(client, intakePolicy()))

    const turn = turnRow(client)
    expect(turn, pillarWhy(PILLAR, 'complete RFQ intake must persist a reviewable scope')).toMatchObject({
      role: 'kael',
      content_type: 'analysis',
      text_content: expect.stringContaining('Kael chưa hiển thị giá'),
      safe_metadata: {
        quote_readiness: 'worker_quote_or_inspection_ready',
        intake_coverage: {
          order_eligible: true,
          missing_required_fields: [],
          confirmation_kind: 'rfq_request',
          next_action: 'rfq_review',
        },
      },
    })
    expect(sessionUpdate(client, 'estimate_ready'), pillarWhy(PILLAR, 'complete RFQ scope must reach the ready state')).toBeTruthy()
    expect(turn, pillarWhy(PILLAR, 'RFQ readiness must not fabricate an estimate')).not.toHaveProperty('estimate')
    expect(fetchMock, pillarWhy(PILLAR, 'fixture intake must not call an AI or external provider')).not.toHaveBeenCalled()
  })

  it('rejects a priced policy before persisting an unpriced intake result', async () => {
    const client = clientForTurn()
    const fetchMock = vi.fn(async () => {
      throw new Error('Unexpected provider request in fixture test')
    })
    vi.stubGlobal('fetch', fetchMock)
    const policy = { ...intakePolicy(), quoteMode: 'blocked' as const }

    await expect(finalizeUnpricedStage1Intake(inputForTurn(client, policy)))
      .rejects.toMatchObject({ code: 'POLICY_UNAVAILABLE' })

    expect(client.calls, pillarWhy(PILLAR, 'an unsupported policy must fail before any database write')).toHaveLength(0)
    expect(fetchMock, pillarWhy(PILLAR, 'policy refusal must not call a provider')).not.toHaveBeenCalled()
  })
})
