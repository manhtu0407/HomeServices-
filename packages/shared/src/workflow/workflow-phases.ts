import type { JobStatus } from '../constants'

export const WORKFLOW_PHASES = Object.freeze([
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
] as const)

export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number]

export const JOB_STATUS_TO_WORKFLOW_PHASE = Object.freeze({
  draft: 'intake_started',
  analyzing: 'kael_estimating',
  estimate_ready: 'kael_explaining',
  awaiting_customer_confirm: 'matching',
  broadcasting: 'matching',
  worker_matched: 'worker_matched',
  worker_on_way: 'worker_on_way',
  arrived: 'arrived',
  inspecting: 'inspecting',
  repairing: 'repairing',
  scope_change_pending: 'scope_change_pending',
  completed_by_worker: 'completed_by_worker',
  confirmed_by_customer: 'customer_confirmed_completion',
  payment_pending: 'payment_pending',
  paid: 'paid',
  reviewed: 'done',
  cancelled: 'cancelled',
} satisfies Record<JobStatus, WorkflowPhase>)

export function toWorkflowPhase(status: JobStatus): WorkflowPhase {
  return JOB_STATUS_TO_WORKFLOW_PHASE[status]
}

export function isWorkflowPhase(value: string): value is WorkflowPhase {
  return (WORKFLOW_PHASES as readonly string[]).includes(value)
}
