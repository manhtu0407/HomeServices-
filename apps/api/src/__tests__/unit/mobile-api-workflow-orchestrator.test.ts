import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  validateKaelAutonomyTransition,
  validateWorkflowCommand,
  validateWorkflowTransition,
} from '../../../../../supabase/functions/mobile-api/_shared/workflow-orchestrator'

describe('mobile-api workflow orchestrator wrapper', () => {
  it('validates the main Kael-led service workflow sequence through review', () => {
    const sequence = [
      ['kael_started_matching', 'analyzing', 'broadcasting'],
      ['worker_accepted', 'broadcasting', 'worker_candidate_pending'],
      ['customer_confirmed_worker', 'worker_candidate_pending', 'worker_matched'],
      ['worker_status_advanced', 'worker_matched', 'worker_on_way'],
      ['worker_status_advanced', 'worker_on_way', 'arrived'],
      ['worker_status_advanced', 'arrived', 'inspecting'],
      ['worker_status_advanced', 'inspecting', 'repairing'],
      ['worker_completed', 'repairing', 'completed_by_worker'],
      ['kael_confirmed_completion', 'completed_by_worker', 'confirmed_by_customer'],
      ['kael_decided_payment', 'confirmed_by_customer', 'payment_pending'],
      ['payment_confirmed', 'payment_pending', 'paid'],
      ['review_submitted', 'paid', 'reviewed'],
    ] as const

    for (const [event, from, to] of sequence) {
      expect(validateWorkflowTransition({ event, from, to }).valid).toBe(true)
    }
  })

  it('accepts a validated Kael autonomy decision for transition ownership', () => {
    const result = validateKaelAutonomyTransition({
      decision: {
        actor: 'kael_system',
        action: 'start_matching',
        policy_id: 'kael.autonomy.v2.estimate_to_matching',
        evidence: [
          {
            kind: 'artifact',
            reference_id: 'estimate-card-1',
            summary: 'Kael estimate validated with supported service and HCMC district.',
          },
        ],
        confidence: 0.86,
        reversible: true,
        appealable: true,
        resulting_event: 'kael_started_matching',
      },
      from: 'analyzing',
      to: 'broadcasting',
    })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.event).toBe('kael_started_matching')
      expect(result.decision.actor).toBe('kael_system')
    }
  })

  it('accepts a validated Kael worker-cancellation decision for replacement matching', () => {
    const result = validateKaelAutonomyTransition({
      decision: {
        actor: 'kael_system',
        action: 'process_cancellation',
        policy_id: 'kael.autonomy.v2.worker_cancel_to_rematch',
        evidence: [
          {
            kind: 'worker_evidence',
            reference_id: 'cancel-1',
            summary: 'Worker cancellation classified by policy.',
          },
        ],
        confidence: 0.92,
        reversible: true,
        appealable: true,
        resulting_event: 'kael_processed_cancellation',
      },
      from: 'worker_on_way',
      to: 'broadcasting',
    })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.event).toBe('kael_processed_cancellation')
      expect(result.decision.action).toBe('process_cancellation')
    }
  })

  it('accepts a validated Kael customer-cancellation decision after worker acceptance', () => {
    for (const from of ['arrived', 'inspecting', 'repairing', 'scope_change_pending'] as const) {
      const result = validateKaelAutonomyTransition({
        decision: {
          actor: 'kael_system',
          action: 'process_cancellation',
          policy_id: 'kael.autonomy.v2.customer_cancel_after_accept',
          evidence: [
            {
              kind: 'customer_input',
              reference_id: `cancel-${from}`,
              summary: 'Customer cancellation input was classified by server policy.',
            },
            {
              kind: 'policy',
              reference_id: 'STRUCTURES.md#cancellation',
              summary: 'Kael can process active cancellation with audit and appeal.',
            },
          ],
          confidence: 0.84,
          reversible: true,
          appealable: true,
          resulting_event: 'kael_processed_cancellation',
        },
        from,
        to: 'cancelled',
      })

      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.event).toBe('kael_processed_cancellation')
        expect(result.timestampColumn).toBe('cancelled_at')
      }
    }
  })

  it('covers all Kael autonomy action to workflow event mappings including payment and dispute', () => {
    const cases = [
      ['confirm_ticket', 'kael_confirmed_ticket', 'awaiting_customer_confirm', 'broadcasting'],
      ['start_matching', 'kael_started_matching', 'analyzing', 'broadcasting'],
      ['process_cancellation', 'kael_processed_cancellation', 'worker_matched', 'broadcasting'],
      ['decide_scope_change', 'kael_decided_scope_change', 'scope_change_pending', 'repairing'],
      ['confirm_completion', 'kael_confirmed_completion', 'completed_by_worker', 'confirmed_by_customer'],
      ['decide_payment', 'kael_decided_payment', 'confirmed_by_customer', 'payment_pending'],
      ['decide_dispute', 'kael_decided_dispute', 'confirmed_by_customer', 'reviewed'],
    ] as const

    for (const [action, resulting_event, from, to] of cases) {
      const result = validateKaelAutonomyTransition({
        decision: {
          actor: 'kael_system',
          action,
          policy_id: `kael.autonomy.v2.${action}`,
          evidence: [
            {
              kind: 'policy',
              reference_id: `STRUCTURES.md#${action}`,
              summary: `Policy evidence for ${action}.`,
            },
          ],
          confidence: 0.9,
          reversible: true,
          appealable: true,
          resulting_event,
        },
        from,
        to,
      })

      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.event).toBe(resulting_event)
        expect(result.decision.action).toBe(action)
      }
    }
  })

  it('rejects a Kael autonomy decision when action and resulting event do not match', () => {
    const result = validateKaelAutonomyTransition({
      decision: {
        actor: 'kael_system',
        action: 'start_matching',
        policy_id: 'kael.autonomy.v2.estimate_to_matching',
        evidence: [
          {
            kind: 'artifact',
            reference_id: 'estimate-card-1',
            summary: 'Estimate exists, but the event is for cancellation.',
          },
        ],
        confidence: 0.86,
        reversible: true,
        appealable: true,
        resulting_event: 'kael_processed_cancellation',
      },
      from: 'analyzing',
      to: 'broadcasting',
    })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toContain('workflow')
    }
  })

  it('keeps the existing customer confirmation transition as a legacy recovery path', () => {
    const result = validateWorkflowTransition({
      event: 'customer_confirmed_ticket',
      from: 'awaiting_customer_confirm',
      to: 'broadcasting',
    })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.timestampColumn).toBe('broadcast_at')
      expect(result.event).toBe('customer_confirmed_ticket')
    }
  })

  it('covers worker acceptance and scope-change RPC transitions at the Edge boundary', () => {
    const workerAccepted = validateWorkflowTransition({
      event: 'worker_accepted',
      from: 'broadcasting',
      to: 'worker_candidate_pending',
    })
    const customerConfirmedWorker = validateWorkflowTransition({
      event: 'customer_confirmed_worker',
      from: 'worker_candidate_pending',
      to: 'worker_matched',
    })
    const scopeRequested = validateWorkflowTransition({
      event: 'scope_change_requested',
      from: 'repairing',
      to: 'scope_change_pending',
    })
    const scopeApproved = validateWorkflowTransition({
      event: 'kael_decided_scope_change',
      from: 'scope_change_pending',
      to: 'repairing',
    })
    const scopeRejected = validateWorkflowTransition({
      event: 'kael_decided_scope_change',
      from: 'scope_change_pending',
      to: 'worker_on_way',
    })

    expect(workerAccepted.valid).toBe(true)
    expect(customerConfirmedWorker.valid).toBe(true)
    expect(scopeRequested.valid).toBe(true)
    expect(scopeApproved.valid).toBe(true)
    expect(scopeRejected.valid).toBe(true)

    const servicesSource = readFileSync(
      join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services.ts'),
      'utf8',
    ) + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/matching.service.ts'), 'utf8')
    expect(servicesSource).toContain('event: "worker_accepted"')
    expect(servicesSource + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/scope-change.service.ts'), 'utf8')).toContain('event: "scope_change_requested"')
    expect(servicesSource + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/scope-change.service.ts'), 'utf8')).toContain('customer_confirmed_scope_change')
    expect(servicesSource + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/scope-change.service.ts'), 'utf8')).toContain('customer_rejected_scope_change')
    expect(servicesSource + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/scope-change.service.ts'), 'utf8')).not.toContain('runPolicyAutonomyGate')
    expect(servicesSource + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/scope-change.service.ts'), 'utf8')).not.toContain('tryAutoApproveScopeChange')
    // Scope-change auto-approval is disabled because
    // a scope-change changes the deal price, so it is ALWAYS confirmed by the
    // customer (even low-risk). The auto-approve branch and autonomy policy id
    // are removed, and the worker request always
    // routes to the customer-decide path. This assertion guards against the
    // auto-approve wiring being silently re-introduced.
    expect(servicesSource).not.toContain('policyId: "kael.autonomy.v2.scope_change_auto_approve"')
    expect(servicesSource + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/scope-change.service.ts'), 'utf8')).toContain('notifyCustomerScopeChangeRequested')
    expect(servicesSource + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/scope-change.service.ts'), 'utf8')).not.toContain('notifyCustomerScopeChangeDecided')
    expect(
      servicesSource +
        readFileSync(
          join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/notifications.service.ts'),
          'utf8',
        ),
    ).not.toContain('scope_change_auto_approved')
  })

  it('rejects out-of-order completion transitions', () => {
    const result = validateWorkflowTransition({
      event: 'worker_completed',
      from: 'broadcasting',
      to: 'completed_by_worker',
    })

    expect(result.valid).toBe(false)
  })

  it('rejects valid status pairs when the workflow event does not own that transition', () => {
    const result = validateWorkflowTransition({
      event: 'review_submitted',
      from: 'awaiting_customer_confirm',
      to: 'broadcasting',
    })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toContain('bước xử lý')
    }
  })

  it('does not allow the legacy customer recovery path to skip ticket-review status', () => {
    const result = validateWorkflowTransition({
      event: 'customer_confirmed_ticket',
      from: 'estimate_ready',
      to: 'broadcasting',
    })

    expect(result.valid).toBe(false)
  })

  it('wraps Kael estimate-ready job updates before autonomous matching', () => {
    const transition = validateWorkflowTransition({
      event: 'kael_started_matching',
      from: 'analyzing',
      to: 'broadcasting',
    })
    const servicesSource = readFileSync(
      join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services.ts'),
      'utf8',
    ) + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/matching.service.ts'), 'utf8') + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/kael-chat-confirm.service.ts'), 'utf8')

    expect(transition.valid).toBe(true)
    expect(servicesSource).toContain('resultingEvent: "kael_started_matching"')
    expect(servicesSource).toContain('policyId: "kael.autonomy.v2.chat_estimate_to_matching"')
    expect(servicesSource).toContain('autonomyDecision ? "kael_started_matching" : "customer_confirmed_search"')
  })

  it('keeps customer completion as an explicit server-validated gate', () => {
    const transition = validateWorkflowTransition({
      event: 'kael_confirmed_completion',
      from: 'completed_by_worker',
      to: 'confirmed_by_customer',
    })
    const servicesSource = readFileSync(
      join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services.ts'),
      'utf8',
    )

    expect(transition.valid).toBe(true)
    const completionSource = servicesSource + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/completion-review.service.ts'), 'utf8')
    expect(completionSource).toContain('event: "customer_confirmed_completion"')
    expect(completionSource).toContain('customer_input: "accepted_completion"')
    expect(completionSource).not.toContain('runPolicyAutonomyGate')
  })

  it('wraps Kael failure cleanup before cancelling an analyzing job', () => {
    const transition = validateWorkflowTransition({
      event: 'kael_failed',
      from: 'analyzing',
      to: 'cancelled',
    })
    const servicesSource = readFileSync(
      join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services.ts'),
      'utf8',
    ) + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/job-create.service.ts'), 'utf8')

    expect(transition.valid).toBe(true)
    expect(servicesSource).toContain('event: "kael_failed"')
  })

  it('requires paid server truth before review submission', () => {
    const paymentConfirmed = validateWorkflowTransition({
      event: 'payment_confirmed',
      from: 'payment_pending',
      to: 'paid',
    })
    const phaseZeroConfirmed = validateWorkflowTransition({
      event: 'review_submitted',
      from: 'confirmed_by_customer',
      to: 'reviewed',
    })
    const paid = validateWorkflowTransition({
      event: 'review_submitted',
      from: 'paid',
      to: 'reviewed',
    })
    const paymentPending = validateWorkflowTransition({
      event: 'review_submitted',
      from: 'payment_pending',
      to: 'reviewed',
    })
    expect(paymentConfirmed.valid).toBe(true)
    expect(phaseZeroConfirmed.valid).toBe(false)
    expect(paid.valid).toBe(true)
    expect(paymentPending.valid).toBe(false)
  })

  it('keeps direct customer cancellation limited to pre-accept statuses', () => {
    expect(validateWorkflowTransition({
      event: 'cancel_requested',
      from: 'awaiting_customer_confirm',
      to: 'cancelled',
    }).valid).toBe(true)
    expect(validateWorkflowTransition({
      event: 'cancel_requested',
      from: 'broadcasting',
      to: 'cancelled',
    }).valid).toBe(true)
    expect(validateWorkflowTransition({
      event: 'cancel_requested',
      from: 'worker_matched',
      to: 'cancelled',
    }).valid).toBe(false)

    const servicesSource = readFileSync(
      join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services.ts'),
      'utf8',
    )
    expect(servicesSource + readFileSync(join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services/customer-cancellation.service.ts'), 'utf8')).toContain('event: "cancel_requested"')
  })

  it('models cancellation and media attachment commands without letting terminal jobs mutate', () => {
    expect(validateWorkflowCommand({
      event: 'worker_cancellation_requested',
      status: 'worker_on_way',
    }).valid).toBe(true)
    expect(validateWorkflowCommand({
      event: 'customer_cancellation_requested',
      status: 'completed_by_worker',
    }).valid).toBe(true)
    expect(validateWorkflowCommand({
      event: 'worker_cancellation_requested',
      status: 'reviewed',
    }).valid).toBe(false)
    expect(validateWorkflowCommand({
      event: 'job_media_attached',
      status: 'worker_on_way',
      mediaStage: 'after',
    }).valid).toBe(false)
    expect(validateWorkflowCommand({
      event: 'job_media_attached',
      status: 'broadcasting',
      mediaStage: 'before',
    }).valid).toBe(true)
    expect(validateWorkflowCommand({
      event: 'job_media_attached',
      status: 'broadcasting',
      mediaStage: 'kael_reference',
    }).valid).toBe(true)
    expect(validateWorkflowCommand({
      event: 'job_media_attached',
      status: 'repairing',
      mediaStage: 'after',
    }).valid).toBe(true)
  })
})
