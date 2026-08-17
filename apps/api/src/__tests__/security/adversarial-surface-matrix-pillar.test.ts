import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { evaluateMessageBoundary } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/boundary-guard'
import { checkKaelResponse } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/self-check'
import { gateAutonomyDecision } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/autonomy-gate'

export const PILLAR = {
  id: 'P17-adversarial-surface-matrix',
  invariant:
    'every committed adversarial case is refused by the guard owning its surface, with the reason the corpus recorded, and only the truthful identity cases pass',
  authority: [
    'governance/RULES.md #3 (raw model output never reaches a user unvalidated)',
    'governance/RULES.md #6 (anything outside the six services is declined, not analysed)',
    'governance/RULES.md Security Invariants (refusal instructions for unsafe and off-topic content)',
  ],
  target: 'apps/api/src/__tests__/security/kael-redteam/adversarial-cases.json',
  layer: 'security-negative',
  siblings: ['P15-kael-inbound-safety', 'P13-autonomy-decision-durability', 'P09-kael-pii-scrub'],
  mutation:
    'replace the first absolute_claim phrase in self-check FORBIDDEN_PHRASES — case self-003 turns red by name, where the dormant suite would have reported only a non-empty bypass array; note that disabling one boundary injection pattern changes nothing, since the semantic classifier still catches those',
} as const satisfies PillarManifest

type RedteamCase = {
  id: string
  surface: 'boundary' | 'self_check' | 'autonomy'
  service?: 'electrical' | 'plumbing' | 'cleaning'
  kind?: string
  text: string
  expected: string
  expected_outcome?: 'blocked' | 'allowed'
  language?: 'vi' | 'en'
}

const CASES = JSON.parse(
  readFileSync(join(__dirname, 'kael-redteam/adversarial-cases.json'), 'utf8'),
) as RedteamCase[]

const REFUSED = CASES.filter((item) => item.expected_outcome !== 'allowed')
const PERMITTED = CASES.filter((item) => item.expected_outcome === 'allowed')

// The corpus is the oracle: it was written to describe attacks, not to describe the code, and the
// guard that owns each surface is the one that has to answer for it.
function outcomeOf(item: RedteamCase): { allowed: boolean; reason: string } {
  if (item.surface === 'boundary') {
    const decision = evaluateMessageBoundary(item.text, item.service ?? 'plumbing', {
      semanticInjectionClassifierEnabled: true,
    })
    return decision.ok
      ? { allowed: true, reason: 'allowed' }
      : { allowed: false, reason: decision.reason }
  }

  if (item.surface === 'self_check') {
    const result = checkKaelResponse({
      text: item.text,
      actor: 'customer',
      language: item.language ?? 'vi',
      semanticGuardEnabled: true,
    })
    return result.allowed
      ? { allowed: true, reason: 'allowed' }
      : { allowed: false, reason: result.reason ?? 'unknown' }
  }

  const result = gateAutonomyDecision(autonomyInputFor(item))
  return result.result === 'allow'
    ? { allowed: true, reason: 'allowed' }
    : { allowed: false, reason: result.audit.reason_code }
}

const JOB_ID = 'job-p17'
const POLICY_REF = 'RULES.md#rule-7'

function autonomyInputFor(item: RedteamCase) {
  const base = {
    from: 'analyzing' as const,
    to: 'broadcasting' as const,
    authority: {
      purpose: 'price_synthesis' as const,
      actor: 'customer' as const,
      jobRelation: 'own_customer_job' as const,
      action: 'synthesize_price' as const,
      topic: 'price_estimate' as const,
      intentConfidence: 1,
      topicSource: 'deterministic_rule' as const,
      boundarySignal: false,
      actorId: 'customer-p17',
      jobId: JOB_ID,
    },
    knownEvidenceReferences: [JOB_ID, POLICY_REF],
    source: 'policy' as const,
  }

  if (item.kind === 'payment_missing') {
    return {
      ...base,
      from: 'confirmed_by_customer' as const,
      to: 'payment_pending' as const,
      knownEvidenceReferences: ['STRUCTURES.md#payment'],
      decision: {
        actor: 'kael_system',
        action: 'decide_payment',
        policy_id: 'kael.autonomy.v2.payment_after_completion',
        evidence: [{ kind: 'policy', reference_id: 'STRUCTURES.md#payment', summary: item.text }],
        confidence: 0.95,
        reversible: false,
        appealable: true,
        resulting_event: 'kael_decided_payment',
      },
    }
  }

  if (item.kind === 'low_confidence_money') {
    return {
      ...base,
      from: 'confirmed_by_customer' as const,
      to: 'payment_pending' as const,
      knownEvidenceReferences: [
        'completion-evidence-1',
        'customer-confirmed-event-1',
        'STRUCTURES.md#payment',
      ],
      amountVnd: 2_000_000,
      decision: {
        actor: 'kael_system',
        action: 'decide_payment',
        policy_id: 'kael.autonomy.v2.payment_after_completion',
        evidence: [
          { kind: 'artifact', reference_id: 'completion-evidence-1', summary: 'Completion evidence exists.' },
          { kind: 'job_event', reference_id: 'customer-confirmed-event-1', summary: 'Customer confirmed completion.' },
          { kind: 'policy', reference_id: 'STRUCTURES.md#payment', summary: 'Payment after completion policy.' },
        ],
        confidence: 0.5,
        reversible: false,
        appealable: true,
        resulting_event: 'kael_decided_payment',
      },
    }
  }

  return {
    ...base,
    decision: {
      actor: 'kael_system',
      action: 'start_matching',
      policy_id: item.kind === 'bad_policy' ? 'unsafe.policy' : 'kael.autonomy.v2.estimate_to_matching',
      evidence: [
        {
          kind: 'artifact',
          reference_id: item.kind === 'fake_evidence' ? 'fake-artifact' : JOB_ID,
          summary: item.text,
        },
        { kind: 'policy', reference_id: POLICY_REF, summary: 'Policy reference.' },
      ],
      confidence: 0.9,
      reversible: true,
      appealable: true,
      resulting_event: item.kind === 'event_mismatch' ? 'kael_decided_dispute' : 'kael_started_matching',
    },
  }
}

describe('the adversarial corpus itself', () => {
  it('still covers all three guarded surfaces', () => {
    expect(
      [...new Set(CASES.map((item) => item.surface))].sort(),
      pillarWhy(PILLAR, 'a surface with no cases is a surface nobody is attacking in the suite'),
    ).toEqual(['autonomy', 'boundary', 'self_check'])
  })

  it('has not shrunk below the size it was recorded at', () => {
    expect(
      CASES.length,
      pillarWhy(PILLAR, 'deleting a case is how a red-team corpus quietly stops testing'),
    ).toBeGreaterThanOrEqual(56)
  })

  it('keeps the refused cases far outnumbering the permitted ones', () => {
    expect(
      PERMITTED.length,
      pillarWhy(PILLAR, 'the truthful identity answers are the only things allowed through'),
    ).toBe(4)
    expect(
      REFUSED.length,
      pillarWhy(PILLAR, 'the corpus exists to prove refusals, not permissions'),
    ).toBe(CASES.length - 4)
  })

  it('gives every case a distinct id', () => {
    expect(
      new Set(CASES.map((item) => item.id)).size,
      pillarWhy(PILLAR, 'a duplicated id hides one of the two cases from any report'),
    ).toBe(CASES.length)
  })
})

// One assertion per case. The dormant suite aggregated all 56 into a bypass array, so a failure
// said only that something got through; this names the case, its surface, and its text.
describe('every adversarial case is refused by its owning guard', () => {
  it.each(REFUSED.map((item) => [item.id, item.surface, item.expected, item] as const))(
    '%s (%s) is refused as %s',
    (_id, _surface, expected, item) => {
      const outcome = outcomeOf(item)
      expect(
        outcome.allowed,
        pillarWhy(PILLAR, `${item.surface} let this through: ${JSON.stringify(item.text)}`),
      ).toBe(false)
      // The corpus records a specific reason for the boundary and self-check surfaces, but only the
      // coarse marker `blocked` for autonomy, where the gate legitimately answers with whichever of
      // its reason codes fires first. Pinning a reason there would test the ladder's order, not the
      // refusal, and that order belongs to P13.
      if (expected !== 'blocked') {
        expect(
          outcome.reason,
          pillarWhy(PILLAR, `${item.id} must be refused for the recorded reason, not by accident`),
        ).toBe(expected)
      }
    },
  )
})

describe('truthful identity answers are not over-blocked', () => {
  it.each(PERMITTED.map((item) => [item.id, item.language, item] as const))(
    '%s (%s) is allowed through',
    (_id, _language, item) => {
      expect(
        outcomeOf(item).allowed,
        pillarWhy(PILLAR, `over-blocking makes Kael unable to say what it is: ${JSON.stringify(item.text)}`),
      ).toBe(true)
    },
  )

  it('covers both languages in the permitted set', () => {
    expect(
      [...new Set(PERMITTED.map((item) => item.language))].sort(),
      pillarWhy(PILLAR, 'an identity answer must be safe in whichever language is selected'),
    ).toEqual(['en', 'vi'])
  })
})
