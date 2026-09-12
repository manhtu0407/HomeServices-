import type { JobStatus, ServiceType } from "../../../../_shared/domain.ts";
import type { AdminActor } from "./admin-control.ts";

export type AdminOperationsResponse = {
  actor: AdminActor;
  generated_at: string;
  attention: Array<{
    key:
      | "worker_applications"
      | "payment_attention"
      | "open_disputes"
      | "workflow_recovery"
      | "other_admin_queue";
    target_section: "operations" | "workers" | "transactions";
    count: number;
  }>;
  flow: Array<{ status: string; count: number }>;
  quality: Array<{
    key: "workers_suspended" | "workers_in_verification";
    count: number;
  }>;
  audit_events: Array<{
    id: string;
    actor_id: string | null;
    actor_name: string | null;
    actor_role: string;
    action: string;
    topic: string | null;
    decision: string;
    occurred_at: string;
  }>;
};

export type AdminWorkflowRecoveryStatus =
  | "open"
  | "acknowledged"
  | "action_required"
  | "resolved";

export type AdminWorkflowRecoverySummary = {
  recovery_case_id: string;
  job_id: string;
  display_code: string;
  service_type: ServiceType;
  reason_code: string;
  detected_state: string;
  severity: "medium" | "high" | "critical";
  status: AdminWorkflowRecoveryStatus;
  first_detected_at: string;
  last_detected_at: string;
  last_activity_at: string;
  updated_at: string;
  version: number;
};

export type AdminWorkflowRecoveryListInput = {
  status: AdminWorkflowRecoveryStatus | "all";
  severity: "medium" | "high" | "critical" | "all";
  limit: number;
  offset: number;
};

export type AdminWorkflowRecoveryListResponse = {
  generated_at: string;
  records: AdminWorkflowRecoverySummary[];
  total_count: number;
};

export type AdminWorkflowRecoveryActionReceipt = {
  action: "acknowledge" | "mark_contact_required" | "reconcile_capacity" | "resolve_verified" | "system_recovered";
  reason: string;
  actor_id: string | null;
  actor_name: string | null;
  case_version: number;
  affected_reservation_count: number;
  observed_job_state: string;
  created_at: string;
};

export type AdminWorkflowRecoveryDetailResponse = {
  generated_at: string;
  summary: AdminWorkflowRecoverySummary;
  current_job_status: JobStatus;
  matching_operation_state: string | null;
  active_capacity_reservations: number;
  expired_capacity_reservations: number;
  actions: AdminWorkflowRecoveryActionReceipt[];
};

export type AdminWorkflowRecoveryActionInput = {
  action: "acknowledge" | "mark_contact_required" | "reconcile_capacity" | "resolve_verified";
  reason: string;
  idempotency_key: string;
  expected_version: number;
};

export type AdminWorkflowRecoveryActionResponse = {
  ok: true;
  recovery_case_id: string;
  job_id: string;
  status: AdminWorkflowRecoveryStatus;
  version: number;
  affected_reservation_count: number;
  already_applied: boolean;
  applied_at: string;
};
