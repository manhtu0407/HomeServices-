export const WORKFLOW_EVENTS = Object.freeze([
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
] as const)

export type WorkflowEvent = (typeof WORKFLOW_EVENTS)[number]

export const WORKFLOW_COMMAND_EVENTS = Object.freeze([
  'customer_cancellation_requested',
  'worker_cancellation_requested',
  'job_media_attached',
] as const)

export type WorkflowCommandEvent = (typeof WORKFLOW_COMMAND_EVENTS)[number]

export function isWorkflowEvent(value: string): value is WorkflowEvent {
  return (WORKFLOW_EVENTS as readonly string[]).includes(value)
}

export function isWorkflowCommandEvent(value: string): value is WorkflowCommandEvent {
  return (WORKFLOW_COMMAND_EVENTS as readonly string[]).includes(value)
}
