import { describe, expect, it } from 'vitest'
import { JOB_STATUSES } from '../constants'
import {
  ARTIFACT_LIFECYCLE_BY_TYPE,
  WORKFLOW_ARTIFACT_MODES,
  WORKFLOW_ARTIFACT_TYPES,
  WORKFLOW_COMMAND_EVENTS,
  WORKFLOW_EVENTS,
  WORKFLOW_PHASES,
  buildWorkflowViewModel,
  isWorkflowCommandEvent,
  isWorkflowPhase,
  toWorkflowPhase,
} from '../workflow'

describe('workflow phase contract', () => {
  it('defines the Kael-led request to done phase list without renaming backend statuses', () => {
    expect([...WORKFLOW_PHASES]).toEqual([
      'intake_started',
      'kael_collecting',
      'kael_estimating',
      'kael_explaining',
      'ticket_review',
      'matching',
      'worker_matched',
      'worker_on_way',
      'arrived',
      'inspecting',
      'repairing',
      'scope_change_pending',
      'completed_by_worker',
      'customer_confirmed_completion',
      'payment_pending',
      'paid',
      'done',
      'cancelled',
    ])
  })

  it('maps every existing backend job status into a workflow phase', () => {
    for (const status of JOB_STATUSES) {
      expect(isWorkflowPhase(toWorkflowPhase(status))).toBe(true)
    }

    expect(toWorkflowPhase('draft')).toBe('intake_started')
    expect(toWorkflowPhase('analyzing')).toBe('kael_estimating')
    expect(toWorkflowPhase('estimate_ready')).toBe('kael_explaining')
    expect(toWorkflowPhase('awaiting_customer_confirm')).toBe('ticket_review')
    expect(toWorkflowPhase('broadcasting')).toBe('matching')
    expect(toWorkflowPhase('confirmed_by_customer')).toBe('customer_confirmed_completion')
    expect(toWorkflowPhase('payment_pending')).toBe('payment_pending')
    expect(toWorkflowPhase('paid')).toBe('paid')
    expect(toWorkflowPhase('reviewed')).toBe('done')
  })

  it('keeps non-transition workflow commands explicit and separate from phase events', () => {
    expect([...WORKFLOW_COMMAND_EVENTS]).toEqual([
      'customer_cancellation_requested',
      'worker_cancellation_requested',
      'job_media_attached',
    ])
    expect(isWorkflowCommandEvent('job_media_attached')).toBe(true)
    expect(WORKFLOW_EVENTS).not.toContain('job_media_attached')
  })
})

describe('workflow event contract', () => {
  it('keeps events explicit about actor intent and backend confirmation points', () => {
    expect([...WORKFLOW_EVENTS]).toEqual([
      'customer_input_started',
      'customer_input_updated',
      'kael_missing_info_requested',
      'ai_partial_ticket_updated',
      'ai_estimate_ready',
      'kael_failed',
      'ai_explanation_ready',
      'customer_confirmed_ticket',
      'matching_started',
      'worker_accepted',
      'worker_status_advanced',
      'scope_change_requested',
      'scope_change_decided',
      'worker_completed',
      'customer_confirmed_completion',
      'payment_confirmed',
      'review_submitted',
      'cancel_requested',
    ])
  })
})

describe('artifact lifecycle contract', () => {
  it('defines the first durable artifact set without adding fake service categories', () => {
    expect([...WORKFLOW_ARTIFACT_TYPES]).toEqual([
      'service_request',
      'process_ticket',
      'ai_diagnosis',
      'ai_notes',
      'estimate',
      'provider_match',
      'booking',
      'scope_change',
      'completion_evidence',
      'review',
    ])
  })

  it('defines display-neutral artifact modes for future phase-gated UI', () => {
    expect([...WORKFLOW_ARTIFACT_MODES]).toEqual([
      'hidden',
      'basic',
      'loading',
      'partial',
      'annotated',
      'review',
      'final',
      'done',
      'blocked',
      'failed',
    ])
  })

  it('allows the ticket to appear early and become done only through lifecycle modes', () => {
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.process_ticket).toEqual([
      'hidden',
      'basic',
      'loading',
      'partial',
      'annotated',
      'review',
      'final',
      'done',
      'blocked',
      'failed',
    ])
  })

  it('keeps estimate, matching, completion, and review artifacts separate', () => {
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.estimate).toContain('review')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.provider_match).toContain('loading')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.completion_evidence).toContain('review')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.review).toContain('done')
  })

  it('only returns artifact modes that belong to each artifact lifecycle', () => {
    for (const status of JOB_STATUSES) {
      const workflow = buildWorkflowViewModel({
        status,
        hasAiNotes: true,
        hasCompletionEvidence: true,
        hasCustomerInput: true,
        hasEstimate: true,
        hasScopeChange: true,
      })

      for (const artifactType of WORKFLOW_ARTIFACT_TYPES) {
        expect(ARTIFACT_LIFECYCLE_BY_TYPE[artifactType]).toContain(workflow.artifacts[artifactType].mode)
      }
    }
  })
})

describe('workflow view model contract', () => {
  it('keeps the ticket hidden before customer intent exists', () => {
    const workflow = buildWorkflowViewModel({ status: null })

    expect(workflow.phase).toBe('intake_started')
    expect(workflow.artifacts.process_ticket.mode).toBe('hidden')
    expect(workflow.artifacts.estimate.mode).toBe('hidden')
    expect(workflow.allowedActions.confirmTicketAndEstimate).toBe(false)
  })

  it('shows a partial ticket while Kael is collecting user input', () => {
    const workflow = buildWorkflowViewModel({ status: null, hasCustomerInput: true, hasAiNotes: true })

    expect(workflow.phase).toBe('kael_collecting')
    expect(workflow.artifacts.process_ticket.mode).toBe('partial')
    expect(workflow.artifacts.ai_notes.mode).toBe('partial')
    expect(workflow.artifacts.estimate.mode).toBe('hidden')
  })

  it('does not show AI diagnosis before Kael has produced notes', () => {
    const workflow = buildWorkflowViewModel({ status: null, hasCustomerInput: true })

    expect(workflow.phase).toBe('kael_collecting')
    expect(workflow.artifacts.process_ticket.mode).toBe('partial')
    expect(workflow.artifacts.ai_diagnosis.visible).toBe(false)
    expect(workflow.artifacts.ai_notes.visible).toBe(false)
  })

  it('shows Kael analysis as loading without enabling confirmation', () => {
    const workflow = buildWorkflowViewModel({ status: 'analyzing', hasCustomerInput: true })

    expect(workflow.phase).toBe('kael_estimating')
    expect(workflow.artifacts.process_ticket.mode).toBe('loading')
    expect(workflow.artifacts.estimate.mode).toBe('loading')
    expect(workflow.allowedActions.confirmTicketAndEstimate).toBe(false)
  })

  it('separates explaining from final ticket confirmation', () => {
    const explaining = buildWorkflowViewModel({ status: 'estimate_ready', hasCustomerInput: true, hasEstimate: true })
    const review = buildWorkflowViewModel({ status: 'awaiting_customer_confirm', hasCustomerInput: true, hasEstimate: true })

    expect(explaining.phase).toBe('kael_explaining')
    expect(explaining.artifacts.estimate.mode).toBe('review')
    expect(explaining.artifacts.ai_notes.mode).toBe('loading')
    expect(explaining.allowedActions.confirmTicketAndEstimate).toBe(false)
    expect(review.phase).toBe('ticket_review')
    expect(review.allowedActions.confirmTicketAndEstimate).toBe(true)
  })

  it('does not show AI notes in review mode unless Kael produced notes', () => {
    const withoutNotes = buildWorkflowViewModel({ status: 'awaiting_customer_confirm', hasCustomerInput: true, hasEstimate: true })
    const withNotes = buildWorkflowViewModel({ status: 'awaiting_customer_confirm', hasCustomerInput: true, hasAiNotes: true, hasEstimate: true })

    expect(withoutNotes.artifacts.ai_notes.visible).toBe(false)
    expect(withoutNotes.artifacts.ai_diagnosis.visible).toBe(false)
    expect(withNotes.artifacts.ai_notes.mode).toBe('review')
    expect(withNotes.artifacts.ai_diagnosis.mode).toBe('review')
  })

  it('does not allow ticket confirmation if the estimate artifact is missing', () => {
    const workflow = buildWorkflowViewModel({ status: 'awaiting_customer_confirm', hasCustomerInput: true })

    expect(workflow.phase).toBe('ticket_review')
    expect(workflow.artifacts.estimate.mode).toBe('loading')
    expect(workflow.allowedActions.confirmTicketAndEstimate).toBe(false)
  })

  it('only exposes provider matching after backend matching starts', () => {
    const workflow = buildWorkflowViewModel({ status: 'broadcasting', hasCustomerInput: true, hasEstimate: true })

    expect(workflow.phase).toBe('matching')
    expect(workflow.artifacts.provider_match.mode).toBe('loading')
    expect(workflow.allowedActions.confirmTicketAndEstimate).toBe(false)
  })

  it('does not mark the flow done until the reviewed backend status', () => {
    const workerDone = buildWorkflowViewModel({ status: 'completed_by_worker', hasCompletionEvidence: true })
    const customerConfirmed = buildWorkflowViewModel({ status: 'confirmed_by_customer', hasCompletionEvidence: true })
    const paymentPending = buildWorkflowViewModel({ status: 'payment_pending', hasCompletionEvidence: true })
    const paid = buildWorkflowViewModel({ status: 'paid', hasCompletionEvidence: true })
    const reviewed = buildWorkflowViewModel({ status: 'reviewed', hasCompletionEvidence: true })

    expect(workerDone.artifacts.completion_evidence.mode).toBe('review')
    expect(customerConfirmed.phase).toBe('customer_confirmed_completion')
    expect(customerConfirmed.isDone).toBe(false)
    expect(customerConfirmed.artifacts.review.mode).toBe('review')
    expect(customerConfirmed.allowedActions.submitReview).toBe(true)
    expect(paymentPending.artifacts.review.mode).toBe('blocked')
    expect(paymentPending.allowedActions.submitReview).toBe(false)
    expect(paid.artifacts.review.mode).toBe('review')
    expect(paid.allowedActions.submitReview).toBe(true)
    expect(reviewed.phase).toBe('done')
    expect(reviewed.artifacts.review.mode).toBe('done')
    expect(reviewed.isDone).toBe(true)
  })
})
