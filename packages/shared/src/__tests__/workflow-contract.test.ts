import { describe, expect, it } from 'vitest'
import { JOB_STATUSES } from '../constants'
import {
  ARTIFACT_LIFECYCLE_BY_TYPE,
  KAEL_AUTONOMY_ACTIONS,
  KAEL_AUTONOMY_EVENTS,
  KAEL_AUTONOMY_EVIDENCE_KINDS,
  WORKFLOW_ARTIFACT_MODES,
  WORKFLOW_ARTIFACT_TYPES,
  WORKFLOW_ACTORS,
  WORKFLOW_COMMAND_EVENTS,
  WORKFLOW_EVENTS,
  WORKFLOW_PHASE_SECTION_IDS,
  WORKFLOW_PHASES,
  buildWorkflowViewModel,
  isWorkflowCommandEvent,
  isWorkflowPhase,
  orderWorkflowPhaseSectionsForSummary,
  toWorkflowPhase,
  workflowAllowedActionsLabel,
  workflowArtifactModeLabel,
  workflowBlockedReasonLabel,
  workflowEventLabel,
  workflowSourceOfTruthLabel,
} from '../workflow'

describe('workflow phase contract', () => {
  it('defines Kael as a first-class workflow actor without making raw AI a status writer', () => {
    expect([...WORKFLOW_ACTORS]).toEqual([
      'customer',
      'worker',
      'admin',
      'kael_system',
    ])
  })

  it('publishes the Kael autonomy decision interface without making it a raw artifact event', () => {
    expect([...KAEL_AUTONOMY_ACTIONS]).toEqual([
      'confirm_ticket',
      'start_matching',
      'process_cancellation',
      'decide_scope_change',
      'confirm_completion',
      'decide_payment',
      'decide_dispute',
    ])
    expect([...KAEL_AUTONOMY_EVENTS]).toEqual([
      'kael_confirmed_ticket',
      'kael_started_matching',
      'kael_processed_cancellation',
      'kael_decided_scope_change',
      'kael_confirmed_completion',
      'kael_decided_payment',
      'kael_decided_dispute',
    ])
    expect([...KAEL_AUTONOMY_EVIDENCE_KINDS]).toEqual([
      'artifact',
      'job_event',
      'policy',
      'worker_evidence',
      'customer_input',
      'system_check',
    ])
    expect(WORKFLOW_EVENTS).not.toContain('kael_autonomy_decision')
  })

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
    expect(toWorkflowPhase('awaiting_customer_confirm')).toBe('matching')
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
  it('keeps events explicit about actor intent and Kael autonomy points', () => {
    expect([...WORKFLOW_EVENTS]).toEqual([
      'customer_input_started',
      'customer_input_updated',
      'kael_missing_info_requested',
      'ai_partial_ticket_updated',
      'ai_estimate_ready',
      'kael_failed',
      'ai_explanation_ready',
      'kael_confirmed_ticket',
      'kael_started_matching',
      'customer_confirmed_ticket',
      'matching_started',
      'worker_accepted',
      'worker_status_advanced',
      'scope_change_requested',
      'kael_decided_scope_change',
      'scope_change_decided',
      'worker_completed',
      'kael_confirmed_completion',
      'customer_confirmed_completion',
      'kael_decided_payment',
      'payment_confirmed',
      'kael_decided_dispute',
      'review_submitted',
      'kael_processed_cancellation',
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
      'worker_brief',
      'provider_match',
      'booking',
      'scope_change',
      'cancellation_review',
      'completion_evidence',
      'completion_review',
      'dispute_decision',
      'payment_decision',
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

  it('keeps estimate, matching, cancellation, completion, dispute, payment, and review artifacts separate', () => {
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.estimate).toContain('review')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.worker_brief).toContain('final')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.provider_match).toContain('loading')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.scope_change).toContain('basic')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.cancellation_review).toContain('final')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.completion_evidence).toContain('basic')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.completion_evidence).toContain('review')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.completion_review).toContain('review')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.dispute_decision).toContain('review')
    expect(ARTIFACT_LIFECYCLE_BY_TYPE.payment_decision).toContain('review')
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

  it('keeps pending intake on the pending-intake source before a Kael session exists', () => {
    const workflow = buildWorkflowViewModel({ status: null, hasPendingIntake: true })

    expect(workflow.phase).toBe('intake_started')
    expect(workflow.phaseContext.sourceOfTruth).toBe('pending_intake')
    expect(workflow.artifacts.service_request.mode).toBe('basic')
    expect(workflow.artifacts.process_ticket.mode).toBe('hidden')
    expect(workflow.phaseContext.primaryArtifact?.artifact).toBe('service_request')
    expect(workflow.phaseContext.blockedReason).toBe('waiting_for_kael_analysis')
    expect(workflow.phaseContext.nextExpectedEvent).toBe('ai_partial_ticket_updated')
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

  it('keeps ticket artifacts visible while Kael orchestration replaces the customer confirmation gate', () => {
    const explaining = buildWorkflowViewModel({ status: 'estimate_ready', hasCustomerInput: true, hasEstimate: true })
    const orchestrating = buildWorkflowViewModel({ status: 'awaiting_customer_confirm', hasCustomerInput: true, hasEstimate: true })

    expect(explaining.phase).toBe('kael_explaining')
    expect(explaining.artifacts.estimate.mode).toBe('review')
    expect(explaining.artifacts.ai_notes.mode).toBe('loading')
    expect(explaining.allowedActions.confirmTicketAndEstimate).toBe(false)
    expect(orchestrating.phase).toBe('matching')
    expect(orchestrating.artifacts.provider_match.mode).toBe('loading')
    expect(orchestrating.allowedActions.confirmTicketAndEstimate).toBe(false)
  })

  it('keeps AI notes hidden during orchestration unless Kael produced notes', () => {
    const withoutNotes = buildWorkflowViewModel({ status: 'awaiting_customer_confirm', hasCustomerInput: true, hasEstimate: true })
    const withNotes = buildWorkflowViewModel({ status: 'awaiting_customer_confirm', hasCustomerInput: true, hasAiNotes: true, hasEstimate: true })

    expect(withoutNotes.artifacts.ai_notes.visible).toBe(false)
    expect(withoutNotes.artifacts.ai_diagnosis.visible).toBe(false)
    expect(withNotes.artifacts.ai_notes.mode).toBe('final')
    expect(withNotes.artifacts.ai_diagnosis.mode).toBe('final')
  })

  it('does not restore customer confirmation when an orchestration estimate is missing', () => {
    const workflow = buildWorkflowViewModel({ status: 'awaiting_customer_confirm', hasCustomerInput: true })

    expect(workflow.phase).toBe('matching')
    expect(workflow.artifacts.estimate.mode).toBe('hidden')
    expect(workflow.artifacts.provider_match.mode).toBe('loading')
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
    expect(workerDone.artifacts.completion_review.mode).toBe('review')
    expect(workerDone.artifacts.dispute_decision.mode).toBe('review')
    expect(customerConfirmed.phase).toBe('customer_confirmed_completion')
    expect(customerConfirmed.isDone).toBe(false)
    expect(customerConfirmed.artifacts.payment_decision.mode).toBe('review')
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

describe('workflow phase context contract', () => {
  it('publishes the role-aware phase section vocabulary without adding workflow authority', () => {
    expect([...WORKFLOW_PHASE_SECTION_IDS]).toEqual([
      'intake_receipt',
      'process_ticket',
      'diagnosis_trace',
      'estimate',
      'orchestration',
      'provider_match',
      'worker_brief',
      'booking',
      'active_timeline',
      'job_chat',
      'scope_change',
      'completion_evidence',
      'completion_review',
      'dispute_decision',
      'payment_decision',
      'review',
      'cancellation_review',
    ])
  })

  it('localizes phase context source, event, blocked reason, and artifact mode labels outside UI components', () => {
    expect(workflowSourceOfTruthLabel('pending_intake', 'vi')).toBe('Phiếu chờ')
    expect(workflowEventLabel('kael_started_matching', 'vi')).toBe('Kael bắt đầu điều phối')
    expect(workflowBlockedReasonLabel('chat_requires_real_job', 'vi')).toBe('Chat cần công việc thật')
    expect(workflowBlockedReasonLabel('chat_send_closed', 'vi')).toBe('Chat chỉ còn đọc lại')
    expect(workflowAllowedActionsLabel({ confirmTicketAndEstimate: false, confirmCompletion: false, submitReview: true }, 'vi')).toBe('Gửi đánh giá')
    expect(workflowAllowedActionsLabel({ confirmTicketAndEstimate: false, confirmCompletion: false, jobChatSend: true, submitReview: false }, 'vi')).toBe('Nhắn trong chat công việc')
    expect(workflowAllowedActionsLabel({ confirmTicketAndEstimate: false, confirmCompletion: false, jobChatRead: true, submitReview: false }, 'en')).toBe('Read job chat')
    expect(workflowAllowedActionsLabel({ confirmTicketAndEstimate: false, confirmCompletion: false, submitReview: false }, 'en')).toBe('No action unlocked')
    expect(workflowArtifactModeLabel('review', 'vi')).toBe('Cần xét')
    expect(workflowArtifactModeLabel('final', 'en')).toBe('Final')
  })

  it('builds a source-of-truth context for every backend status fixture', () => {
    const expected = {
      draft: ['intake_started', 'pending_intake', 'service_request', 'customer_input_updated'],
      analyzing: ['kael_estimating', 'kael_chat_session', 'estimate', 'ai_estimate_ready'],
      estimate_ready: ['kael_explaining', 'kael_chat_session', 'estimate', 'kael_started_matching'],
      awaiting_customer_confirm: ['matching', 'broadcast', 'provider_match', 'worker_accepted'],
      broadcasting: ['matching', 'broadcast', 'provider_match', 'worker_accepted'],
      worker_matched: ['worker_matched', 'hydrated_job', 'booking', 'worker_status_advanced'],
      worker_on_way: ['worker_on_way', 'hydrated_job', 'booking', 'worker_status_advanced'],
      arrived: ['arrived', 'hydrated_job', 'booking', 'worker_status_advanced'],
      inspecting: ['inspecting', 'hydrated_job', 'booking', 'worker_status_advanced'],
      repairing: ['repairing', 'hydrated_job', 'booking', 'worker_completed'],
      scope_change_pending: ['scope_change_pending', 'scope_change', 'scope_change', 'kael_decided_scope_change'],
      completed_by_worker: ['completed_by_worker', 'completion_evidence', 'completion_evidence', 'kael_confirmed_completion'],
      confirmed_by_customer: ['customer_confirmed_completion', 'completion_evidence', 'payment_decision', 'review_submitted'],
      payment_pending: ['payment_pending', 'hydrated_job', 'payment_decision', 'payment_confirmed'],
      paid: ['paid', 'hydrated_job', 'review', 'review_submitted'],
      reviewed: ['done', 'review', 'review', null],
      cancelled: ['cancelled', 'hydrated_job', 'cancellation_review', null],
    } as const

    for (const status of JOB_STATUSES) {
      const workflow = buildWorkflowViewModel({
        status,
        hasAiNotes: true,
        hasCompletionEvidence: true,
        hasCustomerInput: true,
        hasEstimate: true,
        hasScopeChange: true,
      })
      const [phase, sourceOfTruth, primaryArtifact, nextExpectedEvent] = expected[status]

      expect(workflow.phaseContext.phase).toBe(phase)
      expect(workflow.phaseContext.sourceOfTruth).toBe(sourceOfTruth)
      expect(workflow.phaseContext.primaryArtifact?.artifact).toBe(primaryArtifact)
      expect(workflow.phaseContext.nextExpectedEvent).toBe(nextExpectedEvent)
      expect(workflow.phaseContext.sections.length).toBe(WORKFLOW_PHASE_SECTION_IDS.length)
      expect(workflow.phaseContext.allowedActions).toBe(workflow.allowedActions)
      const visibleArtifacts = workflow.phaseContext.primaryArtifact
        ? [workflow.phaseContext.primaryArtifact, ...workflow.phaseContext.secondaryArtifacts]
        : [...workflow.phaseContext.secondaryArtifacts]
      expect(visibleArtifacts.every((section) => section.mode !== 'hidden')).toBe(true)
    }
  })

  it('gives every visible artifact a phase section so secondary artifacts stay complete', () => {
    for (const status of JOB_STATUSES) {
      const workflow = buildWorkflowViewModel({
        status,
        hasAiNotes: true,
        hasCompletionEvidence: true,
        hasCustomerInput: true,
        hasEstimate: true,
        hasScopeChange: true,
      })
      const visibleArtifacts = Object.entries(workflow.artifacts)
        .filter(([artifact, view]) => artifact !== 'ai_notes' && view.visible && view.mode !== 'hidden')
        .map(([artifact]) => artifact)
      const sectionArtifacts = workflow.phaseContext.sections
        .filter((section) => section.visible && section.artifact)
        .map((section) => section.artifact)

      for (const artifact of visibleArtifacts) {
        expect(sectionArtifacts).toContain(artifact)
      }
    }
  })

  it('keeps phase sections rich while customer search and completion authority stay disabled', () => {
    const matching = buildWorkflowViewModel({
      status: 'broadcasting',
      hasAiNotes: true,
      hasCustomerInput: true,
      hasEstimate: true,
      optimistic: 'starting_matching',
    })
    const chatSection = matching.phaseContext.sections.find((section) => section.id === 'job_chat')
    const orchestrationSection = matching.phaseContext.sections.find((section) => section.id === 'orchestration')

    expect(matching.phaseContext.blockedReason).toBe('waiting_for_worker_acceptance')
    expect(orchestrationSection?.visible).toBe(true)
    expect(chatSection?.visible).toBe(false)
    expect(chatSection?.lockedReason).toBe('chat_requires_real_job')
    expect(matching.allowedActions.confirmTicketAndEstimate).toBe(false)
    expect(matching.allowedActions.confirmCompletion).toBe(false)
  })

  it('does not expose orchestration as a live section before the backend confirms matching', () => {
    const estimateReady = buildWorkflowViewModel({
      status: 'estimate_ready',
      hasAiNotes: true,
      hasCustomerInput: true,
      hasEstimate: true,
      optimistic: 'starting_matching',
    })
    const orchestrationSection = estimateReady.phaseContext.sections.find((section) => section.id === 'orchestration')

    expect(estimateReady.phaseContext.phase).toBe('kael_explaining')
    expect(estimateReady.phaseContext.blockedReason).toBe('waiting_for_kael_orchestration')
    expect(orchestrationSection?.visible).toBe(false)
    expect(orchestrationSection?.lockedReason).toBe('waiting_for_kael_orchestration')
  })

  it('orders visible phase sections around the live artifact before historical intake context', () => {
    const matching = buildWorkflowViewModel({ status: 'broadcasting', hasCustomerInput: true, hasEstimate: true })
    const active = buildWorkflowViewModel({ status: 'worker_on_way', hasCustomerInput: true, hasEstimate: true })
    const inspecting = buildWorkflowViewModel({ status: 'inspecting', hasCustomerInput: true, hasEstimate: true })
    const repairing = buildWorkflowViewModel({ status: 'repairing', hasCustomerInput: true, hasEstimate: true })
    const scope = buildWorkflowViewModel({ status: 'scope_change_pending', hasScopeChange: true })
    const matchingSections = orderWorkflowPhaseSectionsForSummary(
      matching.phaseContext,
      matching.phaseContext.sections.filter((section) => section.visible && section.role !== 'worker'),
    )
    const activeSections = orderWorkflowPhaseSectionsForSummary(
      active.phaseContext,
      active.phaseContext.sections.filter((section) => section.visible && section.role !== 'worker'),
    )
    const scopeSections = orderWorkflowPhaseSectionsForSummary(
      scope.phaseContext,
      scope.phaseContext.sections.filter((section) => section.visible),
    )
    const inspectingSections = orderWorkflowPhaseSectionsForSummary(
      inspecting.phaseContext,
      inspecting.phaseContext.sections.filter((section) => section.visible),
    )
    const repairingSections = orderWorkflowPhaseSectionsForSummary(
      repairing.phaseContext,
      repairing.phaseContext.sections.filter((section) => section.visible),
    )

    expect(matchingSections[0]?.id).toBe('provider_match')
    expect(activeSections[0]?.id).toBe('booking')
    expect(activeSections.slice(0, 3).map((section) => section.id)).toContain('active_timeline')
    expect(inspectingSections.slice(0, 3).map((section) => section.id)).toContain('scope_change')
    expect(repairingSections.slice(0, 3).map((section) => section.id)).toContain('completion_evidence')
    expect(repairingSections.slice(0, 4).map((section) => section.id)).toContain('scope_change')
    expect(scopeSections[0]?.id).toBe('scope_change')
  })

  it('surfaces active, scope, completion, payment, review, and cancellation gates without client money authority', () => {
    const active = buildWorkflowViewModel({ status: 'worker_on_way', hasCustomerInput: true, hasEstimate: true })
    const inspecting = buildWorkflowViewModel({ status: 'inspecting', hasCustomerInput: true, hasEstimate: true })
    const repairing = buildWorkflowViewModel({ status: 'repairing', hasCustomerInput: true, hasEstimate: true })
    const scope = buildWorkflowViewModel({ status: 'scope_change_pending', hasScopeChange: true })
    const completion = buildWorkflowViewModel({ status: 'completed_by_worker', hasCompletionEvidence: true })
    const completionMissingEvidence = buildWorkflowViewModel({ status: 'completed_by_worker', hasCompletionEvidence: false })
    const customerConfirmedMissingEvidence = buildWorkflowViewModel({ status: 'confirmed_by_customer', hasCompletionEvidence: false })
    const payment = buildWorkflowViewModel({ status: 'payment_pending', hasCompletionEvidence: true })
    const paymentMissingEvidence = buildWorkflowViewModel({ status: 'payment_pending', hasCompletionEvidence: false })
    const paid = buildWorkflowViewModel({ status: 'paid', hasCompletionEvidence: true })
    const paidMissingEvidence = buildWorkflowViewModel({ status: 'paid', hasCompletionEvidence: false })
    const cancelled = buildWorkflowViewModel({ status: 'cancelled' })

    expect(active.phaseContext.sections.find((section) => section.id === 'active_timeline')?.visible).toBe(true)
    expect(active.phaseContext.sections.find((section) => section.id === 'job_chat')?.visible).toBe(true)
    expect(active.allowedActions.jobChatRead).toBe(true)
    expect(active.allowedActions.jobChatSend).toBe(true)
    expect(inspecting.artifacts.scope_change.mode).toBe('basic')
    expect(inspecting.phaseContext.sections.find((section) => section.id === 'scope_change')?.visible).toBe(true)
    expect(repairing.artifacts.scope_change.mode).toBe('basic')
    expect(repairing.phaseContext.sections.find((section) => section.id === 'scope_change')?.visible).toBe(true)
    expect(repairing.artifacts.completion_evidence.mode).toBe('basic')
    expect(repairing.phaseContext.sections.find((section) => section.id === 'completion_evidence')?.visible).toBe(true)
    expect(scope.phaseContext.blockedReason).toBe('kael_scope_decision_required')
    expect(scope.phaseContext.primaryArtifact?.artifact).toBe('scope_change')
    expect(completion.phaseContext.blockedReason).toBe('kael_completion_review_required')
    expect(completion.phaseContext.primaryArtifact?.artifact).toBe('completion_evidence')
    expect(completion.phaseContext.sections.find((section) => section.id === 'completion_evidence')?.role).toBe('shared')
    expect(completionMissingEvidence.phaseContext.blockedReason).toBe('completion_evidence_required')
    expect(completionMissingEvidence.artifacts.completion_evidence.mode).toBe('blocked')
    expect(completionMissingEvidence.artifacts.dispute_decision.mode).toBe('hidden')
    expect(completionMissingEvidence.phaseContext.sections.find((section) => section.id === 'dispute_decision')?.visible).toBe(false)
    expect(customerConfirmedMissingEvidence.allowedActions.submitReview).toBe(true)
    expect(customerConfirmedMissingEvidence.artifacts.completion_evidence.mode).toBe('blocked')
    expect(customerConfirmedMissingEvidence.phaseContext.sections.find((section) => section.id === 'review')?.lockedReason).toBeNull()
    expect(payment.phaseContext.sections.find((section) => section.id === 'job_chat')?.visible).toBe(true)
    expect(payment.phaseContext.sections.find((section) => section.id === 'job_chat')?.lockedReason).toBe('chat_send_closed')
    expect(payment.allowedActions.jobChatRead).toBe(true)
    expect(payment.allowedActions.jobChatSend).toBe(false)
    expect(payment.phaseContext.sections.find((section) => section.id === 'review')?.lockedReason).toBe('payment_pending')
    expect(payment.allowedActions.submitReview).toBe(false)
    expect(paymentMissingEvidence.artifacts.completion_evidence.mode).toBe('blocked')
    expect(paymentMissingEvidence.phaseContext.sections.find((section) => section.id === 'completion_evidence')?.lockedReason).toBe('completion_evidence_required')
    expect(paymentMissingEvidence.phaseContext.sections.find((section) => section.id === 'payment_decision')?.visible).toBe(true)
    expect(paid.phaseContext.sections.find((section) => section.id === 'job_chat')?.lockedReason).toBe('chat_send_closed')
    expect(paid.allowedActions.jobChatRead).toBe(true)
    expect(paid.allowedActions.jobChatSend).toBe(false)
    expect(paid.allowedActions.submitReview).toBe(true)
    expect(paidMissingEvidence.allowedActions.submitReview).toBe(true)
    expect(paidMissingEvidence.artifacts.completion_evidence.mode).toBe('blocked')
    expect(paidMissingEvidence.phaseContext.sections.find((section) => section.id === 'review')?.lockedReason).toBeNull()
    const done = buildWorkflowViewModel({ status: 'reviewed', hasCompletionEvidence: true })
    expect(done.phaseContext.sections.find((section) => section.id === 'job_chat')?.lockedReason).toBe('chat_send_closed')
    expect(done.allowedActions.jobChatRead).toBe(true)
    expect(done.allowedActions.jobChatSend).toBe(false)
    expect(done.phaseContext.sections.find((section) => section.id === 'review')?.lockedReason).toBeNull()
    expect(cancelled.phaseContext.primaryArtifact?.artifact).toBe('cancellation_review')
    expect(cancelled.phaseContext.blockedReason).toBe('job_cancelled')
  })
})
