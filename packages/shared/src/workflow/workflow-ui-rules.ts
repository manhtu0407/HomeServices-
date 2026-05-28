import type { JobStatus } from '../constants'
import {
  type WorkflowArtifactMode,
  type WorkflowArtifactType,
  WORKFLOW_ARTIFACT_TYPES,
} from './artifact-lifecycle'
import { type WorkflowPhase, toWorkflowPhase } from './workflow-phases'

export type WorkflowViewModelInput = {
  status: JobStatus | null
  hasCustomerInput?: boolean
  hasEstimate?: boolean
  hasAiNotes?: boolean
  hasScopeChange?: boolean
  hasCompletionEvidence?: boolean
  isLoading?: boolean
  optimistic?: 'confirming_ticket' | 'starting_matching' | null
}

export type WorkflowArtifactView = {
  mode: WorkflowArtifactMode
  visible: boolean
}

export type WorkflowViewModel = {
  phase: WorkflowPhase
  optimistic: WorkflowViewModelInput['optimistic']
  artifacts: Record<WorkflowArtifactType, WorkflowArtifactView>
  allowedActions: {
    confirmTicketAndEstimate: boolean
    confirmCompletion: boolean
    submitReview: boolean
  }
  isDone: boolean
}

export function buildWorkflowViewModel(input: WorkflowViewModelInput): WorkflowViewModel {
  const phase = resolveWorkflowPhase(input)
  const artifacts = buildArtifactViews(phase, input)

  return {
    phase,
    optimistic: input.optimistic ?? null,
    artifacts,
    allowedActions: {
      confirmTicketAndEstimate: phase === 'ticket_review' && artifacts.estimate.mode === 'review',
      confirmCompletion: phase === 'completed_by_worker',
      submitReview: phase === 'customer_confirmed_completion' || phase === 'paid',
    },
    isDone: phase === 'done',
  }
}

function resolveWorkflowPhase(input: WorkflowViewModelInput): WorkflowPhase {
  if (input.status) return toWorkflowPhase(input.status)
  if (input.hasEstimate) return 'kael_explaining'
  if (input.isLoading) return 'kael_estimating'
  if (input.hasCustomerInput || input.hasAiNotes) return 'kael_collecting'
  return 'intake_started'
}

function buildArtifactViews(
  phase: WorkflowPhase,
  input: WorkflowViewModelInput,
): Record<WorkflowArtifactType, WorkflowArtifactView> {
  const modes: Record<WorkflowArtifactType, WorkflowArtifactMode> = {
    service_request: serviceRequestMode(phase, input),
    process_ticket: processTicketMode(phase, input),
    ai_diagnosis: aiArtifactMode(phase, input),
    ai_notes: aiArtifactMode(phase, input),
    estimate: estimateMode(phase, input),
    provider_match: providerMatchMode(phase),
    booking: bookingMode(phase),
    scope_change: scopeChangeMode(phase, input),
    completion_evidence: completionEvidenceMode(phase, input),
    review: reviewMode(phase),
  }

  return Object.fromEntries(
    WORKFLOW_ARTIFACT_TYPES.map((type) => [type, {
      mode: modes[type],
      visible: modes[type] !== 'hidden',
    }]),
  ) as Record<WorkflowArtifactType, WorkflowArtifactView>
}

function serviceRequestMode(phase: WorkflowPhase, input: WorkflowViewModelInput): WorkflowArtifactMode {
  if (phase === 'cancelled') return 'blocked'
  if (phase === 'done') return 'done'
  if (input.hasCustomerInput || input.status) return 'basic'
  return 'hidden'
}

function processTicketMode(phase: WorkflowPhase, input: WorkflowViewModelInput): WorkflowArtifactMode {
  if (phase === 'cancelled') return 'blocked'
  if (phase === 'done') return 'done'
  if (phase === 'intake_started') return input.hasCustomerInput ? 'basic' : 'hidden'
  if (phase === 'kael_collecting') return 'partial'
  if (phase === 'kael_estimating') return 'loading'
  if (phase === 'kael_explaining') return 'annotated'
  if (phase === 'ticket_review') return 'review'
  return 'final'
}

function aiArtifactMode(phase: WorkflowPhase, input: WorkflowViewModelInput): WorkflowArtifactMode {
  if (phase === 'cancelled') return 'blocked'
  if (phase === 'kael_estimating') return 'loading'
  if (phase === 'kael_collecting') return input.hasAiNotes ? 'partial' : 'hidden'
  if (phase === 'kael_explaining') return input.hasAiNotes ? 'annotated' : 'loading'
  if (phase === 'ticket_review') return input.hasAiNotes ? 'review' : 'hidden'
  if (phase === 'intake_started') return 'hidden'
  return input.hasAiNotes ? 'final' : 'hidden'
}

function estimateMode(phase: WorkflowPhase, input: WorkflowViewModelInput): WorkflowArtifactMode {
  if (phase === 'kael_estimating') return 'loading'
  if (phase === 'ticket_review' && !input.hasEstimate) return 'loading'
  if (!input.hasEstimate && phase !== 'ticket_review') return 'hidden'
  if (phase === 'kael_explaining' || phase === 'ticket_review') return 'review'
  if (phase === 'cancelled') return 'blocked'
  if (phase === 'intake_started' || phase === 'kael_collecting') return 'hidden'
  return input.hasEstimate ? 'final' : 'hidden'
}

function providerMatchMode(phase: WorkflowPhase): WorkflowArtifactMode {
  if (phase === 'matching') return 'loading'
  if (phase === 'worker_matched' || phase === 'worker_on_way' || phase === 'arrived' || phase === 'inspecting' || phase === 'repairing' || phase === 'scope_change_pending' || phase === 'completed_by_worker' || phase === 'customer_confirmed_completion' || phase === 'payment_pending' || phase === 'paid') return 'final'
  if (phase === 'done') return 'done'
  return 'hidden'
}

function bookingMode(phase: WorkflowPhase): WorkflowArtifactMode {
  if (phase === 'matching') return 'loading'
  if (phase === 'cancelled') return 'blocked'
  if (phase === 'worker_matched' || phase === 'worker_on_way' || phase === 'arrived' || phase === 'inspecting' || phase === 'repairing' || phase === 'scope_change_pending' || phase === 'completed_by_worker' || phase === 'customer_confirmed_completion' || phase === 'payment_pending' || phase === 'paid') return 'final'
  if (phase === 'done') return 'done'
  return 'hidden'
}

function scopeChangeMode(phase: WorkflowPhase, input: WorkflowViewModelInput): WorkflowArtifactMode {
  if (!input.hasScopeChange && phase !== 'scope_change_pending') return 'hidden'
  if (phase === 'scope_change_pending') return 'review'
  if (phase === 'cancelled') return 'blocked'
  if (phase === 'repairing' || phase === 'completed_by_worker' || phase === 'customer_confirmed_completion' || phase === 'payment_pending' || phase === 'paid') return 'final'
  if (phase === 'done') return 'done'
  return 'hidden'
}

function completionEvidenceMode(phase: WorkflowPhase, _input: WorkflowViewModelInput): WorkflowArtifactMode {
  if (phase === 'completed_by_worker') return 'review'
  if (phase === 'customer_confirmed_completion' || phase === 'payment_pending' || phase === 'paid') return 'final'
  if (phase === 'done') return 'done'
  return 'hidden'
}

function reviewMode(phase: WorkflowPhase): WorkflowArtifactMode {
  if (phase === 'customer_confirmed_completion' || phase === 'paid') return 'review'
  if (phase === 'done') return 'done'
  if (phase === 'payment_pending') return 'blocked'
  return 'hidden'
}
