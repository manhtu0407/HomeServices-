export const WORKFLOW_ACTORS = Object.freeze([
  'customer',
  'worker',
  'admin',
  'kael_system',
] as const)

export type WorkflowActor = (typeof WORKFLOW_ACTORS)[number]

export const KAEL_AUTONOMY_ACTIONS = Object.freeze([
  'confirm_ticket',
  'start_matching',
  'process_cancellation',
  'decide_scope_change',
  'confirm_completion',
  'decide_payment',
  'decide_dispute',
] as const)

export type KaelAutonomyAction = (typeof KAEL_AUTONOMY_ACTIONS)[number]

export const KAEL_AUTONOMY_EVENTS = Object.freeze([
  'kael_confirmed_ticket',
  'kael_started_matching',
  'kael_processed_cancellation',
  'kael_decided_scope_change',
  'kael_confirmed_completion',
  'kael_decided_payment',
  'kael_decided_dispute',
] as const)

export type KaelAutonomyEvent = (typeof KAEL_AUTONOMY_EVENTS)[number]

export const KAEL_AUTONOMY_EVIDENCE_KINDS = Object.freeze([
  'artifact',
  'job_event',
  'policy',
  'worker_evidence',
  'customer_input',
  'system_check',
] as const)

export type KaelAutonomyEvidenceKind = (typeof KAEL_AUTONOMY_EVIDENCE_KINDS)[number]

export type KaelAutonomyEvidence = {
  kind: KaelAutonomyEvidenceKind
  reference_id: string
  summary?: string
}

export type KaelAutonomyDecision = {
  actor: 'kael_system'
  action: KaelAutonomyAction
  policy_id: string
  evidence: KaelAutonomyEvidence[]
  confidence: number
  reversible: boolean
  appealable: boolean
  resulting_event: KaelAutonomyEvent
}

export const WORKFLOW_EVENTS = Object.freeze([
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
  'customer_confirmed_worker',
  'worker_status_advanced',
  'scope_change_requested',
  'kael_decided_scope_change',
  'scope_change_decided',
  'worker_completed',
  'kael_confirmed_completion',
  'customer_confirmed_completion',
  'kael_decided_payment',
  'payment_confirmed',
  'worker_confirmed_cash_payment',
  'kael_decided_dispute',
  'review_submitted',
  'kael_processed_cancellation',
  'cancel_requested',
] as const)

export type WorkflowEvent = (typeof WORKFLOW_EVENTS)[number]

export const WORKFLOW_COMMAND_EVENTS = Object.freeze([
  'customer_cancellation_requested',
  'worker_cancellation_requested',
  'job_media_attached',
] as const)

export type WorkflowCommandEvent = (typeof WORKFLOW_COMMAND_EVENTS)[number]

export function isWorkflowEvent(value: unknown): value is WorkflowEvent {
  return typeof value === 'string' && (WORKFLOW_EVENTS as readonly string[]).includes(value)
}

export function isWorkflowCommandEvent(value: unknown): value is WorkflowCommandEvent {
  return typeof value === 'string' && (WORKFLOW_COMMAND_EVENTS as readonly string[]).includes(value)
}
