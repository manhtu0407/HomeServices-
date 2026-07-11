import { describe, expect, it } from 'vitest'
import { buildWorkflowViewModel } from '../workflow'

describe('progressive service workflow scenarios', () => {
  it('progresses from Kael intake to reviewed done without showing done early', () => {
    const intake = buildWorkflowViewModel({ status: null, hasCustomerInput: true, hasAiNotes: true })
    const estimating = buildWorkflowViewModel({ status: 'analyzing', hasCustomerInput: true, hasAiNotes: true })
    const explaining = buildWorkflowViewModel({ status: 'estimate_ready', hasCustomerInput: true, hasAiNotes: true, hasEstimate: true })
    const kaelOrchestrating = buildWorkflowViewModel({ status: 'awaiting_customer_confirm', hasCustomerInput: true, hasAiNotes: true, hasEstimate: true })
    const matching = buildWorkflowViewModel({ status: 'broadcasting', hasCustomerInput: true, hasAiNotes: true, hasEstimate: true })
    const workerDone = buildWorkflowViewModel({ status: 'completed_by_worker', hasCompletionEvidence: true, hasCustomerInput: true, hasEstimate: true })
    const customerConfirmed = buildWorkflowViewModel({ status: 'confirmed_by_customer', hasCompletionEvidence: true, hasCustomerInput: true, hasEstimate: true })
    const paymentPending = buildWorkflowViewModel({ status: 'payment_pending', hasCompletionEvidence: true, hasCustomerInput: true, hasEstimate: true })
    const paid = buildWorkflowViewModel({ status: 'paid', hasCompletionEvidence: true, hasCustomerInput: true, hasEstimate: true })
    const reviewed = buildWorkflowViewModel({ status: 'reviewed', hasCompletionEvidence: true, hasCustomerInput: true, hasEstimate: true })

    expect(intake.artifacts.process_ticket.mode).toBe('partial')
    expect(estimating.artifacts.process_ticket.mode).toBe('loading')
    expect(explaining.artifacts.ai_notes.mode).toBe('annotated')
    expect(kaelOrchestrating.phase).toBe('ticket_review')
    expect(kaelOrchestrating.allowedActions.confirmTicketAndEstimate).toBe(true)
    expect(matching.artifacts.provider_match.mode).toBe('loading')
    expect(workerDone.artifacts.completion_evidence.mode).toBe('review')
    expect(customerConfirmed.artifacts.review.mode).toBe('review')
    expect(customerConfirmed.isDone).toBe(false)
    expect(paymentPending.artifacts.review.mode).toBe('blocked')
    expect(paid.artifacts.review.mode).toBe('review')
    expect(paid.allowedActions.submitReview).toBe(true)
    expect(reviewed.isDone).toBe(true)
  })

  it('shows provider matching only after the customer confirms the reviewed ticket', () => {
    const collecting = buildWorkflowViewModel({ status: null, hasCustomerInput: true })
    const kaelOrchestrating = buildWorkflowViewModel({ status: 'awaiting_customer_confirm', hasCustomerInput: true, hasEstimate: true })

    expect(collecting.artifacts.provider_match.visible).toBe(false)
    expect(kaelOrchestrating.artifacts.provider_match.mode).toBe('hidden')
    expect(kaelOrchestrating.allowedActions.confirmTicketAndEstimate).toBe(true)
  })

  it('does not reveal matching before the server phase changes, even during an optimistic request', () => {
    const startingMatching = buildWorkflowViewModel({
      status: 'awaiting_customer_confirm',
      hasCustomerInput: true,
      hasEstimate: true,
      optimistic: 'starting_matching',
    })

    expect(startingMatching.phase).toBe('ticket_review')
    expect(startingMatching.optimistic).toBe('starting_matching')
    expect(startingMatching.artifacts.provider_match.mode).toBe('hidden')
  })

  it('does not show late workflow artifacts early just because stale data exists', () => {
    const collectingWithStaleData = buildWorkflowViewModel({
      status: null,
      hasCompletionEvidence: true,
      hasCustomerInput: true,
      hasScopeChange: true,
    })
    const matchingWithStaleData = buildWorkflowViewModel({
      status: 'broadcasting',
      hasCompletionEvidence: true,
      hasCustomerInput: true,
      hasEstimate: true,
      hasScopeChange: true,
    })

    expect(collectingWithStaleData.artifacts.completion_evidence.visible).toBe(false)
    expect(collectingWithStaleData.artifacts.scope_change.visible).toBe(false)
    expect(matchingWithStaleData.artifacts.completion_evidence.visible).toBe(false)
    expect(matchingWithStaleData.artifacts.scope_change.visible).toBe(false)
  })
})
