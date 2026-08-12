import type {
  JobStatus,
  ServiceType,
  UserRole,
  WorkerVerificationStatus,
} from "../../../../_shared/domain.ts";

export const ADMIN_CONTROL_CAPABILITIES = [
  "operations.read",
  "workers.read",
  "workers.review",
  "workers.manage",
  "transactions.read",
  "finance.reconcile",
  "payouts.read",
  "payouts.process",
  "team.read",
] as const;

export type AdminControlCapability = typeof ADMIN_CONTROL_CAPABILITIES[number];

export type AdminActor = {
  access_level: "owner" | "operator";
  capabilities: AdminControlCapability[];
};

export type AdminOperationsResponse = {
  actor: AdminActor;
  generated_at: string;
  attention: Array<{
    key:
      | "worker_applications"
      | "payment_attention"
      | "open_disputes"
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

export type AdminWorkerApplicationStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "cancelled";

export type AdminWorkerApplicationListInput = {
  status: AdminWorkerApplicationStatus | "all";
  query: string;
  limit: number;
  offset: number;
};

export type AdminWorkerApplicationSummary = {
  id: string;
  worker_id: string;
  status: AdminWorkerApplicationStatus;
  submitted_at: string;
  updated_at: string;
  contact_type: "email" | "phone" | "unknown";
  contact_suffix: string | null;
  source: string | null;
  language: "vi" | "en" | null;
  account_role: UserRole | null;
  full_name: string | null;
  phone_masked: string | null;
  worker_profile: {
    verification_status: WorkerVerificationStatus;
    is_approved: boolean;
    is_suspended: boolean;
    service_types: ServiceType[];
    districts: string[];
    has_cccd: boolean;
    has_selfie: boolean;
  } | null;
  review: {
    decision: "approve" | "request_changes" | "reject";
    reason: string | null;
    decided_at: string;
    decided_by_name: string | null;
  } | null;
};

export type AdminWorkerApplicationListResponse = {
  applications: AdminWorkerApplicationSummary[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number | null;
};

export type AdminWorkerApplicationDecisionInput = {
  decision: "approve" | "request_changes" | "reject";
  reason?: string;
};

export type AdminWorkerApplicationDecisionResponse = {
  ok: true;
  application_id: string;
  worker_id: string;
  decision: AdminWorkerApplicationDecisionInput["decision"];
  status: Exclude<AdminWorkerApplicationStatus, "cancelled">;
  role: UserRole;
  verification_status: WorkerVerificationStatus | null;
  decided_at: string;
};

export type AdminWorkerAccessInput = {
  action: "suspend" | "reinstate";
  reason: string;
};

export type AdminWorkerAccessResponse = {
  ok: true;
  worker_id: string;
  verification_status: WorkerVerificationStatus;
  is_suspended: boolean;
  decided_at: string;
};

export type AdminSubAdminSummary = {
  user_id: string;
  full_name: string | null;
  phone_masked: string | null;
  baseline_role: "customer" | "worker";
  status: "active" | "revoked";
  capabilities: AdminControlCapability[];
  granted_at: string;
  updated_at: string;
  last_activity_at: string | null;
};

export type AdminSubAdminListResponse = {
  actor: AdminActor;
  members: AdminSubAdminSummary[];
  nominations: AdminManagerNominationSummary[];
};

export type AdminSubAdminAccountSearchInput = {
  query: string;
};

export type AdminSubAdminAccountCandidate = {
  user_id: string;
  full_name: string | null;
  phone_masked: string | null;
  role: "customer" | "worker";
};

export type AdminSubAdminAccountSearchResponse = {
  accounts: AdminSubAdminAccountCandidate[];
};

export type AdminManagerNominationSummary = {
  id: string;
  user_id: string;
  full_name: string | null;
  phone_masked: string | null;
  role: "customer" | "worker";
  nominated_at: string;
};

export type AdminManagerNominationResponse = {
  ok: true;
  nomination: AdminManagerNominationSummary;
};

export type AdminManagerNominationCancellationResponse = {
  ok: true;
  nomination_id: string;
};

export type AdminSubAdminAccessInput = {
  action: "grant" | "update" | "revoke";
  capabilities: AdminControlCapability[];
  reason?: string;
};

export type AdminSubAdminAccessResponse = {
  ok: true;
  user_id: string;
  status: "active" | "revoked";
  role: UserRole;
  capabilities: AdminControlCapability[];
  updated_at: string;
};

export type AdminTransactionListInput = {
  payment_status: string | "all";
  query: string;
  limit: number;
  offset: number;
};

export type AdminTransactionSummary = {
  job_id: string;
  display_code: string;
  service_type: ServiceType;
  status: JobStatus;
  payment_status: string | null;
  payment_provider: string | null;
  gross_amount: number | null;
  platform_fee: number | null;
  worker_net: number | null;
  customer_name: string | null;
  worker_name: string | null;
  dispute_status: string | null;
  updated_at: string;
  paid_at: string | null;
};

export type AdminTransactionListResponse = {
  transactions: AdminTransactionSummary[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number | null;
};

export type AdminTransactionTimelineItem = {
  key: "created" | "payment_updated" | "paid" | "ledger_recorded" | "dispute_opened";
  occurred_at: string;
  label_key: "created" | "payment_updated" | "paid" | "ledger_recorded" | "dispute_opened";
};

export type AdminTransactionDetailResponse = {
  transaction: AdminTransactionSummary;
  timeline: AdminTransactionTimelineItem[];
  ledger: {
    created_at: string;
    payment_state: string | null;
    available_at: string | null;
    gross_amount: number;
    platform_fee: number;
    worker_net: number;
    commission_level: number | null;
    commission_rate_bps: number | null;
    sepay_transaction_suffix: string | null;
    sepay_reference_suffix: string | null;
  } | null;
};

export type AdminGovernanceListInput = {
  limit: number;
  offset: number;
};

export type AdminDisputeSummary = {
  id: string;
  job_id: string;
  display_code: string;
  dispute_type: string;
  initiated_by: string;
  status: string;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
};

export type AdminDisputeListResponse = {
  disputes: AdminDisputeSummary[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number;
};

export type AdminPriceBaselineSummary = {
  id: string;
  service_type: ServiceType;
  complexity: string;
  district_code: string;
  price_min: number;
  price_max: number;
  source: string;
  version: number;
  updated_at: string;
};

export type AdminPriceBaselineListResponse = {
  price_baselines: AdminPriceBaselineSummary[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number;
};

export type AdminAiCostSummary = {
  day: string;
  purpose: string;
  provider: string;
  call_count: number;
  success_count: number;
  failure_count: number;
  fallback_count: number;
  total_cost_usd: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  failure_rate: number | null;
};

export type AdminAiCostListResponse = {
  costs: AdminAiCostSummary[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number;
};

export type AdminLearningRuleSummary = {
  id: string;
  rule_type: string;
  affected_service: ServiceType | null;
  affected_problem: string | null;
  affected_district: string | null;
  confidence: number;
  evidence_count: number;
  status: string;
  active_version: number;
  rollback_available: boolean;
  updated_at: string;
};

export type AdminLearningRuleListResponse = {
  rules: AdminLearningRuleSummary[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number;
};
