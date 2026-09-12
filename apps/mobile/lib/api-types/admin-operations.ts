import type { JobStatus, ServiceType } from '@nestscout/shared'
import type { AdminViewActor } from './admin'

export type AdminViewOperationsResponse = {
  actor: AdminViewActor
  generated_at: string
  attention: {
    key: 'worker_applications' | 'payment_attention' | 'open_disputes' | 'workflow_recovery' | 'other_admin_queue'
    target_section: 'operations' | 'workers' | 'transactions'
    count: number
  }[]
  flow: { status: string; count: number }[]
  quality: { key: 'workers_suspended' | 'workers_in_verification'; count: number }[]
  audit_events: {
    id: string
    actor_id: string | null
    actor_name: string | null
    actor_role: string
    action: string
    topic: string | null
    decision: string
    occurred_at: string
  }[]
}

export type AdminViewWorkflowRecoveryStatus = 'open' | 'acknowledged' | 'action_required' | 'resolved'

export type AdminViewWorkflowRecoverySummary = {
  recovery_case_id: string
  job_id: string
  display_code: string
  service_type: ServiceType
  reason_code: string
  detected_state: string
  severity: 'medium' | 'high' | 'critical'
  status: AdminViewWorkflowRecoveryStatus
  first_detected_at: string
  last_detected_at: string
  last_activity_at: string
  updated_at: string
  version: number
}

export type AdminViewWorkflowRecoveryListInput = {
  status?: AdminViewWorkflowRecoveryStatus | 'all'
  severity?: 'medium' | 'high' | 'critical' | 'all'
  limit?: number
  offset?: number
}

export type AdminViewWorkflowRecoveryListResponse = {
  generated_at: string
  records: AdminViewWorkflowRecoverySummary[]
  total_count: number
}

export type AdminViewWorkflowRecoveryActionReceipt = {
  action: 'acknowledge' | 'mark_contact_required' | 'reconcile_capacity' | 'resolve_verified' | 'system_recovered'
  reason: string
  actor_id: string | null
  actor_name: string | null
  case_version: number
  affected_reservation_count: number
  observed_job_state: string
  created_at: string
}

export type AdminViewWorkflowRecoveryDetailResponse = {
  generated_at: string
  summary: AdminViewWorkflowRecoverySummary
  current_job_status: JobStatus
  matching_operation_state: string | null
  active_capacity_reservations: number
  expired_capacity_reservations: number
  actions: AdminViewWorkflowRecoveryActionReceipt[]
}

export type AdminViewWorkflowRecoveryActionInput = {
  action: 'acknowledge' | 'mark_contact_required' | 'reconcile_capacity' | 'resolve_verified'
  reason: string
  idempotency_key: string
  expected_version: number
}

export type AdminViewWorkflowRecoveryActionResponse = {
  ok: true
  recovery_case_id: string
  job_id: string
  status: AdminViewWorkflowRecoveryStatus
  version: number
  affected_reservation_count: number
  already_applied: boolean
  applied_at: string
}
