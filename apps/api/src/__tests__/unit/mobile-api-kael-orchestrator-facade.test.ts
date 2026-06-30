import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runKaelAutonomyOrchestrator } from '../../../../../supabase/functions/mobile-api/_shared/kael/orchestrator-facade'

describe('Kael orchestrator facade', () => {
  it('runs autonomy decisions through the purpose stage and emits unified telemetry', async () => {
    const result = await runKaelAutonomyOrchestrator({
      label: 'estimate_to_matching',
      decision: {
        actor: 'kael_system',
        action: 'start_matching',
        policy_id: 'kael.autonomy.v2.estimate_to_matching',
        evidence: [
          {
            kind: 'artifact',
            reference_id: 'job-1',
            summary: 'Validated estimate and supported service scope.',
          },
          {
            kind: 'policy',
            reference_id: 'RULES.md#rule-7',
            summary: 'Policy allows Kael to continue matching after estimate.',
          },
        ],
        confidence: 0.9,
        reversible: true,
        appealable: true,
        resulting_event: 'kael_started_matching',
      },
      from: 'analyzing',
      to: 'broadcasting',
      authority: {
        purpose: 'price_synthesis',
        actor: 'customer',
        jobRelation: 'own_customer_job',
        action: 'synthesize_price',
        topic: 'price_estimate',
        actorId: 'customer-1',
        jobId: 'job-1',
      },
      knownEvidenceReferences: ['job-1', 'RULES.md#rule-7'],
      source: 'policy',
    })

    expect(result.gate.result).toBe('allow')
    expect(result.telemetry).toMatchObject({
      label: 'estimate_to_matching',
      purpose: 'price_synthesis',
      provider: null,
      cost_usd: 0,
      fallback_used: false,
      gate_result: 'allow',
      reason_code: 'ALLOW_AUTONOMY_DECISION',
      stage_success: true,
    })
    expect(result.telemetry.latency_ms).toBeGreaterThanOrEqual(0)
  })

  it('keeps services.ts on the facade for all current autonomy policy decision call-sites', () => {
    const servicesSource = readFileSync(
      join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services.ts'),
      'utf8',
    ) + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/job-create.service.ts'), 'utf8')

    expect(readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/autonomy-gate.ts'), 'utf8')).toContain('runKaelAutonomyOrchestrator')
    expect(servicesSource).toContain('label: "estimate_to_matching"')
    expect(readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/autonomy-gate.ts'), 'utf8')).toContain('async function runPolicyAutonomyGate')
    for (const label of [
      'customer_process_cancellation',
      'worker_evidence_confirm_completion',
      // 'scope_change_auto_approve' removed — K-1 disables scope auto-approve;
      // scope-change is always customer-confirmed (see workflow-orchestrator test).
      'worker_process_cancellation',
      'scope_change_customer_',
      'customer_confirm_completion',
    ]) {
      expect(servicesSource + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/scope-change.service.ts'), 'utf8') + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/completion-review.service.ts'), 'utf8') + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/customer-cancellation.service.ts'), 'utf8') + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/worker-cancellation.service.ts'), 'utf8') + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/job-status.service.ts'), 'utf8')).toContain(label)
    }
    expect(servicesSource).toContain('knownEvidenceReferences: [jobId, "RULES.md#rule-7"]')
    expect(readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/autonomy-gate.ts'), 'utf8')).toContain('audit: {')
    expect(servicesSource).toContain('jobId,')
    expect(servicesSource).toContain('actorId: ctx.user.id')
  })

  it('writes audit plus admin queue rows for narrow escalation paths when a client is supplied', async () => {
    const inserts: Array<{ table: string; value: Record<string, unknown> }> = []
    const client = {
      from(table: string) {
        return {
          insert(value: Record<string, unknown>) {
            inserts.push({ table, value })
            return Promise.resolve({ data: { id: `${table}-1` }, error: null })
          },
        }
      },
    }

    const result = await runKaelAutonomyOrchestrator({
      label: 'low_confidence_dispute',
      decision: {
        actor: 'kael_system',
        action: 'decide_dispute',
        policy_id: 'kael.autonomy.v2.dispute_resolution',
        evidence: [
          { kind: 'artifact', reference_id: 'dispute-snapshot-1', summary: 'Locked dispute snapshot exists.' },
          { kind: 'job_event', reference_id: 'customer-confirmed-event-1', summary: 'Customer confirmation event exists.' },
          { kind: 'policy', reference_id: 'STRUCTURES.md#dispute', summary: 'Fact-only dispute policy.' },
        ],
        confidence: 0.61,
        reversible: true,
        appealable: true,
        resulting_event: 'kael_decided_dispute',
      },
      from: 'confirmed_by_customer',
      to: 'reviewed',
      authority: {
        purpose: 'scope_change',
        actor: 'customer',
        jobRelation: 'own_customer_job',
        action: 'review_scope_change',
        topic: 'job_status',
        actorId: 'customer-1',
        jobId: 'job-1',
      },
      knownEvidenceReferences: ['dispute-snapshot-1', 'customer-confirmed-event-1', 'STRUCTURES.md#dispute'],
      amountVnd: 2_000_000,
      source: 'policy',
      featureFlags: { fullAutonomyEnabled: true },
      audit: {
        client,
        jobId: 'job-1',
        actorId: 'customer-1',
        actorRole: 'customer',
      },
    })

    expect(result.gate.result).toBe('escalate')
    expect(inserts.map((insert) => insert.table)).toEqual([
      'kael_autonomy_decision_audit',
      'kael_admin_queue',
    ])
    expect(inserts[1]?.value).toMatchObject({
      queue_type: 'autonomy_escalation',
      reason_code: 'HIGH_STAKES_LOW_CONFIDENCE',
      status: 'open',
    })
  })
})
