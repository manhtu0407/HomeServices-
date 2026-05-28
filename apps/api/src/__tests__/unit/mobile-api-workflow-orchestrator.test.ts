import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  validateWorkflowCommand,
  validateWorkflowTransition,
} from '../../../../../supabase/functions/mobile-api/_shared/workflow-orchestrator'

describe('mobile-api workflow orchestrator wrapper', () => {
  it('validates the main Kael-led service workflow sequence through review', () => {
    const sequence = [
      ['ai_estimate_ready', 'analyzing', 'awaiting_customer_confirm'],
      ['ai_explanation_ready', 'estimate_ready', 'awaiting_customer_confirm'],
      ['customer_confirmed_ticket', 'awaiting_customer_confirm', 'broadcasting'],
      ['worker_accepted', 'broadcasting', 'worker_matched'],
      ['worker_status_advanced', 'worker_matched', 'worker_on_way'],
      ['worker_status_advanced', 'worker_on_way', 'arrived'],
      ['worker_status_advanced', 'arrived', 'inspecting'],
      ['worker_status_advanced', 'inspecting', 'repairing'],
      ['worker_completed', 'repairing', 'completed_by_worker'],
      ['customer_confirmed_completion', 'completed_by_worker', 'confirmed_by_customer'],
      ['review_submitted', 'confirmed_by_customer', 'reviewed'],
    ] as const

    for (const [event, from, to] of sequence) {
      expect(validateWorkflowTransition({ event, from, to }).valid).toBe(true)
    }
  })

  it('allows the existing customer confirmation transition without renaming statuses', () => {
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
      to: 'worker_matched',
    })
    const scopeRequested = validateWorkflowTransition({
      event: 'scope_change_requested',
      from: 'repairing',
      to: 'scope_change_pending',
    })
    const scopeApproved = validateWorkflowTransition({
      event: 'scope_change_decided',
      from: 'scope_change_pending',
      to: 'repairing',
    })
    const scopeRejected = validateWorkflowTransition({
      event: 'scope_change_decided',
      from: 'scope_change_pending',
      to: 'cancelled',
    })

    expect(workerAccepted.valid).toBe(true)
    expect(scopeRequested.valid).toBe(true)
    expect(scopeApproved.valid).toBe(true)
    expect(scopeRejected.valid).toBe(true)

    const servicesSource = readFileSync(
      join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services.ts'),
      'utf8',
    )
    expect(servicesSource).toContain('event: "worker_accepted"')
    expect(servicesSource).toContain('event: "scope_change_requested"')
    expect(servicesSource).toContain('event: "scope_change_decided"')
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

  it('does not allow customer confirmation to skip the ticket-review backend status', () => {
    const result = validateWorkflowTransition({
      event: 'customer_confirmed_ticket',
      from: 'estimate_ready',
      to: 'broadcasting',
    })

    expect(result.valid).toBe(false)
  })

  it('wraps AI estimate-ready job updates before exposing ticket review', () => {
    const transition = validateWorkflowTransition({
      event: 'ai_estimate_ready',
      from: 'analyzing',
      to: 'awaiting_customer_confirm',
    })
    const servicesSource = readFileSync(
      join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services.ts'),
      'utf8',
    )

    expect(transition.valid).toBe(true)
    expect(servicesSource).toContain('event: "ai_estimate_ready"')
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
    )

    expect(transition.valid).toBe(true)
    expect(servicesSource).toContain('event: "kael_failed"')
  })

  it('allows Phase 0 direct review while still blocking payment_pending', () => {
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
    expect(phaseZeroConfirmed.valid).toBe(true)
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
    expect(servicesSource).toContain('event: "cancel_requested"')
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
      status: 'repairing',
      mediaStage: 'after',
    }).valid).toBe(true)
  })
})
