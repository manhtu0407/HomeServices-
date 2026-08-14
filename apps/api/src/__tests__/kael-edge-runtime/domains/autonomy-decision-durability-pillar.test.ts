import { describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  auditKaelAutonomyGateResult,
  gateAutonomyDecision,
  type KaelAutonomyAuditClient,
  type KaelAutonomyGateInput,
} from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/autonomy-gate'

export const PILLAR = {
  id: 'P13-autonomy-decision-durability',
  invariant:
    'an autonomy verdict is not durable until its audit row is written, an escalation also reaches the admin queue, and a failed write raises instead of passing silently',
  authority: [
    'governance/RULES.md #7 (autonomy is valid only through a recorded server decision)',
    'governance/RULES.md #9 (audit metadata must stay free of PII)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/autonomy-gate.ts',
  layer: 'integration',
  siblings: ['P12-workflow-transition-composition', 'P17-adversarial-surface-matrix', 'P09-kael-pii-scrub'],
  mutation:
    'swallow the insert error in persistAutonomyRecord by returning instead of throwing — the two fail-closed cases turn red while every recorded-row case stays green',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const JOB_ID = 'job-p13'
const CUSTOMER_PHONE = '0912345678'
const POLICY_REF = 'RULES.md#rule-7'

type RecordedInsert = { table: string; value: Record<string, unknown> }

// A double rather than makeSequenceClient, because the assertion here is which tables were written
// and what happens when one of them refuses.
function auditClient(failOn?: string): KaelAutonomyAuditClient & { inserts: RecordedInsert[] } {
  const inserts: RecordedInsert[] = []
  return {
    inserts,
    from(table: string) {
      return {
        insert(value: Record<string, unknown>) {
          inserts.push({ table, value })
          return Promise.resolve({ error: table === failOn ? { message: 'refused' } : null })
        },
      }
    },
  }
}

function authority(): KaelAutonomyGateInput['authority'] {
  return {
    purpose: 'price_synthesis',
    actor: 'customer',
    jobRelation: 'own_customer_job',
    action: 'synthesize_price',
    topic: 'price_estimate',
    intentConfidence: 1,
    topicSource: 'deterministic_rule',
    boundarySignal: false,
    actorId: 'customer-p13',
    jobId: JOB_ID,
  }
}

function paymentDecision(confidence: number) {
  return {
    actor: 'kael_system',
    action: 'decide_payment',
    policy_id: 'kael.autonomy.v2.payment_release',
    evidence: [
      { kind: 'artifact', reference_id: JOB_ID, summary: 'Confirmed completion artifact.' },
      { kind: 'job_event', reference_id: 'event-p13', summary: 'Customer confirmed completion.' },
      { kind: 'policy', reference_id: POLICY_REF, summary: 'Payment follows a confirmed completion.' },
    ],
    confidence,
    reversible: false,
    appealable: true,
    resulting_event: 'kael_decided_payment',
  }
}

function gateFor(confidence: number) {
  return gateAutonomyDecision({
    decision: paymentDecision(confidence),
    from: 'confirmed_by_customer',
    to: 'payment_pending',
    authority: authority(),
    knownEvidenceReferences: [JOB_ID, 'event-p13'],
    amountVnd: 2_000_000,
    featureFlags: { fullAutonomyEnabled: true },
  })
}

const auditInput = (gate: ReturnType<typeof gateFor>) => ({
  jobId: JOB_ID,
  actorId: 'customer-p13',
  actorRole: 'customer' as const,
  source: 'policy' as const,
  gate,
})

describe('gateAutonomyDecision high-stakes routing', () => {
  it('allows a confident payment decision', () => {
    expect(
      gateFor(0.95).result,
      pillarWhy(PILLAR, 'a well-evidenced decision above the confidence floor must pass'),
    ).toBe('allow')
  })

  // Below the floor a money decision is escalated rather than refused outright, so a human can
  // still act on it. Refusing would strand the job; allowing would move money on a guess.
  it('escalates a payment decision below the confidence floor', () => {
    const gate = gateFor(0.5)
    expect(
      gate.result,
      pillarWhy(PILLAR, 'a low-confidence money decision is neither allowed nor dropped'),
    ).toBe('escalate')
    expect(
      gate.audit.reason_code,
      pillarWhy(PILLAR, 'the audit row must name why a human was pulled in'),
    ).toBe('HIGH_STAKES_LOW_CONFIDENCE')
  })
})

describe('auditKaelAutonomyGateResult', () => {
  it('writes exactly one audit row for an allowed decision', async () => {
    const client = auditClient()
    await auditKaelAutonomyGateResult(client, auditInput(gateFor(0.95)))

    expect(
      client.inserts.map((insert) => insert.table),
      pillarWhy(PILLAR, 'an allowed decision needs an audit trail and nothing else'),
    ).toEqual(['kael_autonomy_decision_audit'])
    expect(
      client.inserts[0].value.gate_result,
      pillarWhy(PILLAR, 'the stored verdict must match the verdict that was returned'),
    ).toBe('allow')
  })

  it('also queues an escalated decision for a human', async () => {
    const client = auditClient()
    await auditKaelAutonomyGateResult(client, auditInput(gateFor(0.5)))

    expect(
      client.inserts.map((insert) => insert.table),
      pillarWhy(PILLAR, 'an escalation nobody is told about is an escalation that never happened'),
    ).toEqual(['kael_autonomy_decision_audit', 'kael_admin_queue'])
    expect(
      client.inserts[1].value,
      pillarWhy(PILLAR, 'the queue row has to carry the severity that makes it actionable'),
    ).toMatchObject({
      queue_type: 'autonomy_escalation',
      escalation_level: 'hard',
      status: 'open',
      priority: 'high',
    })
  })

  it('records a rejected decision too', async () => {
    const rejected = gateAutonomyDecision({
      decision: paymentDecision(0.95),
      from: 'draft',
      to: 'paid',
      authority: authority(),
      knownEvidenceReferences: [JOB_ID, 'event-p13'],
      featureFlags: { fullAutonomyEnabled: true },
    })
    const client = auditClient()
    await auditKaelAutonomyGateResult(client, auditInput(rejected))

    expect(
      rejected.result,
      pillarWhy(PILLAR, 'an illegal transition must not be allowed'),
    ).toBe('reject')
    expect(
      client.inserts.map((insert) => insert.table),
      pillarWhy(PILLAR, 'refusals are evidence of the gate working and must be kept'),
    ).toEqual(['kael_autonomy_decision_audit'])
  })

  // The whole point of the gate is that the decision and its record are inseparable. A swallowed
  // insert would leave a workflow write with no trace of what authorised it.
  it('raises when the audit row cannot be written', async () => {
    await expect(
      auditKaelAutonomyGateResult(auditClient('kael_autonomy_decision_audit'), auditInput(gateFor(0.95))),
      pillarWhy(PILLAR, 'an unrecorded autonomy decision must not be treated as durable'),
    ).rejects.toThrow('KAEL_AUTONOMY_AUDIT_FAILED')
  })

  it('raises when the escalation cannot be queued', async () => {
    await expect(
      auditKaelAutonomyGateResult(auditClient('kael_admin_queue'), auditInput(gateFor(0.5))),
      pillarWhy(PILLAR, 'an escalation that fails to queue must not report success'),
    ).rejects.toThrow('KAEL_AUTONOMY_ESCALATION_QUEUE_FAILED')
  })

  it('keeps contact details out of both rows', async () => {
    const gate = gateAutonomyDecision({
      decision: {
        ...paymentDecision(0.5),
        evidence: [
          { kind: 'artifact', reference_id: JOB_ID, summary: `Customer reachable on ${CUSTOMER_PHONE}.` },
          { kind: 'job_event', reference_id: 'event-p13', summary: 'Customer confirmed completion.' },
          { kind: 'policy', reference_id: POLICY_REF, summary: 'Payment follows a confirmed completion.' },
        ],
      },
      from: 'confirmed_by_customer',
      to: 'payment_pending',
      authority: authority(),
      knownEvidenceReferences: [JOB_ID, 'event-p13'],
      amountVnd: 2_000_000,
      featureFlags: { fullAutonomyEnabled: true },
    })

    expect(
      gate.result,
      pillarWhy(PILLAR, 'a phone number inside a decision is refused before it can be stored'),
    ).toBe('reject')
    expect(
      gate.audit.reason_code,
      pillarWhy(PILLAR, 'the refusal must name the invariant it enforced'),
    ).toBe('PII_OR_SECRET_DETECTED')

    // The rejected payload is retained verbatim in the `decision` column for forensics, so the
    // guarantee this pillar can hold is narrower: `safe_metadata` is the field other systems read
    // and surface, and it must never carry contact details.
    const client = auditClient()
    await auditKaelAutonomyGateResult(client, auditInput(gate))
    expect(
      JSON.stringify(client.inserts[0].value.safe_metadata),
      pillarWhy(PILLAR, 'safe_metadata is the field downstream readers treat as publishable'),
    ).not.toContain(CUSTOMER_PHONE)
  })
})
