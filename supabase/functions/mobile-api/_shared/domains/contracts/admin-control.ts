import type {
  JobStatus,
  ServiceType,
  UserRole,
  WorkerVerificationStatus,
} from "../../../../_shared/domain.ts";
import type {
  EdgeAdminOperatorProvisionInput,
  EdgeAdminOperatorResetPasswordInput,
} from "../../../../_shared/domain.ts";
export type { EdgeAdminOperatorProvisionInput, EdgeAdminOperatorResetPasswordInput };
export const ADMIN_CONTROL_CAPABILITIES = [
  "operations.read",
  "operations.triage",
  "workers.read",
  "workers.review",
  "workers.manage",
  "transactions.read",
  "finance.read",
  "finance.reconcile",
  "finance.tax.manage",
  "payouts.read",
  "payouts.process",
  "team.read",
  "system.read",
  "system.manage",
] as const;
export type AdminControlCapability = typeof ADMIN_CONTROL_CAPABILITIES[number];

export type AdminActor = {
  access_level: "owner" | "operator";
  capabilities: AdminControlCapability[];
};

export type {
  AdminOperationsResponse,
  AdminWorkflowRecoveryStatus,
  AdminWorkflowRecoverySummary,
  AdminWorkflowRecoveryListInput,
  AdminWorkflowRecoveryListResponse,
  AdminWorkflowRecoveryActionReceipt,
  AdminWorkflowRecoveryDetailResponse,
  AdminWorkflowRecoveryActionInput,
  AdminWorkflowRecoveryActionResponse,
} from './admin-operations.ts'

export const ADMIN_OVERVIEW_DETAIL_KEYS = [
  "coordination",
  "assigned",
  "inService",
  "finishing",
  "other",
  "worker_applications",
  "payment_attention",
  "open_disputes",
  "other_admin_queue",
  "workers_in_verification",
  "workers_suspended",
] as const;

export type AdminOverviewDetailKey = typeof ADMIN_OVERVIEW_DETAIL_KEYS[number];

export type AdminOverviewDetailsInput = {
  key: AdminOverviewDetailKey;
  limit: number;
  cursor?: string;
};

export type AdminOverviewBreakdown = {
  key: string;
  count: number;
};

export type AdminOverviewJobRecord = {
  kind: "job";
  job_id: string;
  display_code: string;
  service_type: ServiceType;
  status: string;
  updated_at: string;
};

export type AdminOverviewApplicationRecord = {
  kind: "application";
  application_id: string;
  worker_id: string;
  name: string | null;
  contact_masked: string | null;
  stage: AdminWorkerReviewStage;
  checklist: AdminWorkerChecklist;
  service_types: ServiceType[];
  updated_at: string;
};

export type AdminOverviewWorkerRecord = {
  kind: "worker";
  worker_id: string;
  name: string | null;
  service_types: ServiceType[];
  state: string;
  updated_at: string;
};

export type AdminOverviewPaymentRecord = {
  kind: "payment";
  job_id: string;
  display_code: string;
  service_type: ServiceType;
  payment_status: string;
  updated_at: string;
};

export type AdminOverviewDisputeRecord = {
  kind: "dispute";
  dispute_id: string;
  job_id: string;
  display_code: string;
  dispute_type: string;
  status: string;
  updated_at: string;
};

export type AdminOverviewQueueRecord = {
  kind: "queue";
  queue_id: string;
  queue_type: string;
  status: string;
  updated_at: string;
};

export type AdminOverviewDetailRecord =
  | AdminOverviewJobRecord
  | AdminOverviewApplicationRecord
  | AdminOverviewWorkerRecord
  | AdminOverviewPaymentRecord
  | AdminOverviewDisputeRecord
  | AdminOverviewQueueRecord;

type AdminOverviewDetailsCommon = {
  generated_at: string;
  total_count: number;
  status_breakdown: AdminOverviewBreakdown[];
  service_breakdown: AdminOverviewBreakdown[];
  oldest_updated_at: string | null;
  has_more: boolean;
  next_cursor: string | null;
};

type AdminOverviewRecordByKey = {
  coordination: AdminOverviewJobRecord;
  assigned: AdminOverviewJobRecord;
  inService: AdminOverviewJobRecord;
  finishing: AdminOverviewJobRecord;
  other: AdminOverviewJobRecord;
  worker_applications: AdminOverviewApplicationRecord;
  payment_attention: AdminOverviewPaymentRecord;
  open_disputes: AdminOverviewDisputeRecord;
  other_admin_queue: AdminOverviewQueueRecord;
  workers_in_verification: AdminOverviewWorkerRecord;
  workers_suspended: AdminOverviewWorkerRecord;
};

export type AdminOverviewDetailsResponse = {
  [Key in AdminOverviewDetailKey]: AdminOverviewDetailsCommon & {
    key: Key;
    records: AdminOverviewRecordByKey[Key][];
  };
}[AdminOverviewDetailKey];

export const ADMIN_SCOPE_CHANGE_STATUSES = [
  "requested_by_worker",
  "reviewing_by_kael",
  "waiting_customer_decision",
  "approved_by_customer",
  "rejected_by_customer",
  "cancelled",
] as const;

export type AdminScopeChangeStatus = typeof ADMIN_SCOPE_CHANGE_STATUSES[number];

export type AdminScopeChangeListInput = {
  query: string;
  status: AdminScopeChangeStatus | "all";
  service_type: ServiceType | "all";
  request_timing: "all" | "pre_arrival" | "on_site";
  requested_from?: string;
  requested_to?: string;
  limit: number;
  cursor?: string;
};

export type AdminScopeChangeSummary = {
  scope_change_id: string;
  job_id: string;
  display_code: string;
  service_type: ServiceType;
  status: AdminScopeChangeStatus;
  updated_at: string;
  delta_min_vnd: number | null;
  delta_max_vnd: number | null;
};

export type AdminScopeChangeListResponse = {
  generated_at: string;
  counts: {
    kael_processing: number;
    waiting_customer: number;
    approved: number;
    rejected_or_cancelled: number;
  };
  records: AdminScopeChangeSummary[];
  has_more: boolean;
  next_cursor: string | null;
};

export type AdminEvidenceMetadata = {
  evidence_id: string;
  kind: "photo" | "document" | "chat" | "snapshot";
  label: string;
  captured_at: string | null;
};

export type AdminCaseTimelineEntry = {
  key: string;
  label: string;
  occurred_at: string;
};

export type AdminScopeChangeDetailResponse = {
  generated_at: string;
  summary: AdminScopeChangeSummary;
  original_scope: {
    description: string | null;
    price_min_vnd: number | null;
    price_max_vnd: number | null;
  };
  proposed_scope: {
    description: string;
    reason: string;
    request_timing: "pre_arrival" | "on_site";
    requested_at: string;
    customer_decision_at: string | null;
  };
  pricing: {
    kael_min_vnd: number | null;
    kael_max_vnd: number | null;
    total_min_vnd: number | null;
    total_max_vnd: number | null;
  };
  evidence: AdminEvidenceMetadata[];
  timeline: AdminCaseTimelineEntry[];
  price_receipt: Record<string, unknown> | null;
  related_dispute: {
    dispute_id: string;
    dispute_type: string;
    status: string;
  } | null;
};

export const ADMIN_SUPPORT_QUEUE_TYPES = [
  "demanding_customer",
  "worker_cancellation_review",
  "worker_no_show",
  "customer_cancellation_review",
  "disintermediation_risk",
  "autonomy_escalation",
] as const;

export type AdminSupportQueueType = typeof ADMIN_SUPPORT_QUEUE_TYPES[number];
export type AdminSupportCaseSource = "dispute" | "queue";
export type AdminSupportPreparationStatus = "new" | "acknowledged" | "in_review" | "ready";

export type AdminSupportChecklist = {
  opening_request_reviewed: boolean;
  counterparty_response_reviewed_or_missing: boolean;
  locked_evidence_reviewed: boolean;
  job_timeline_reviewed: boolean;
  scope_and_payment_reviewed: boolean;
  ready_for_next_step: boolean;
};

export type AdminSupportPreparation = {
  status: AdminSupportPreparationStatus;
  checklist: AdminSupportChecklist;
  assigned_to: string | null;
  assigned_to_name: string | null;
  version: number;
  updated_at: string | null;
  can_edit: boolean;
  assigned_to_me: boolean;
};

export type AdminSupportCaseListInput = {
  query: string;
  type: "all" | "dispute" | AdminSupportQueueType;
  source_status: string | "all";
  priority: "all" | "low" | "medium" | "high" | "critical";
  service_type: ServiceType | "all";
  preparation_status: AdminSupportPreparationStatus | "all";
  assignee: "all" | "unassigned" | "mine";
  limit: number;
  cursor?: string;
};

export type AdminSupportCaseSummary = {
  source: AdminSupportCaseSource;
  case_id: string;
  type: "dispute" | AdminSupportQueueType;
  job_id: string | null;
  display_code?: string | null;
  service_type?: ServiceType | null;
  priority: "low" | "medium" | "high" | "critical";
  source_status: string;
  preparation_status?: AdminSupportPreparationStatus;
  assigned_to?: string | null;
  reason_code: string;
  deadline_at?: string | null;
  updated_at: string;
};

export type AdminSupportCaseListResponse = {
  generated_at: string;
  counts: Array<{ key: string; count: number }>;
  records: AdminSupportCaseSummary[];
  has_more: boolean;
  next_cursor: string | null;
};

export type AdminSupportCaseNote = {
  note_id: string;
  body: string;
  author_name: string | null;
  created_at: string;
};

export type AdminSupportCaseDetailResponse = {
  generated_at: string;
  summary: AdminSupportCaseSummary;
  neutral_summary: string;
  parties: Array<{ role: string; name: string | null; contact_masked: string | null }>;
  opening_statement: string | null;
  counterparty_statement: string | null;
  evidence: AdminEvidenceMetadata[];
  timeline: AdminCaseTimelineEntry[];
  abuse_signals: string[];
  recorded_decision: Record<string, unknown> | null;
  preparation: AdminSupportPreparation;
  notes: AdminSupportCaseNote[];
};

export type AdminSupportPreparationInput = {
  expected_version: number;
  idempotency_key: string;
  assignment?: "claim" | "unclaim" | "keep";
  status?: AdminSupportPreparationStatus;
  checklist?: Partial<AdminSupportChecklist>;
  note?: string;
};

export type AdminEvidenceAccessInput = { evidence_id: string };
export type AdminEvidenceAccessResponse = {
  evidence_id: string;
  signed_url: string;
  expires_at: string;
};

export type AdminWorkerApplicationStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "cancelled";

export type AdminWorkerApplicationListInput = {
  status: AdminWorkerApplicationStatus | "all";
  stage?: AdminWorkerReviewStage | "all";
  query: string;
  limit: number;
  offset: number;
  cursor?: string;
};

export type AdminWorkerReviewStage =
  | "pending_access"
  | "missing_profile"
  | "ready_verification"
  | "verified";

export type AdminWorkerChecklist = {
  completed_count: number;
  total_count: number;
  missing: string[];
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
  stage: AdminWorkerReviewStage;
  checklist: AdminWorkerChecklist;
  profile_review_queue_id: string | null;
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
  next_cursor: string | null;
  total_count: number | null;
};

export type AdminWorkerReviewDetail = {
  application: AdminWorkerApplicationSummary;
  login_gates: {
    email: string | null;
    phone: string | null;
    full_name: string | null;
    created_at: string | null;
  };
  profile: {
    updated_at: string | null;
    legal_name: string | null;
    date_of_birth: string | null;
    gender: string | null;
    service_types: ServiceType[];
    years_experience: number;
    districts: string[];
    service_radius_km: number | null;
    problem_specializations: string[];
    bank_account: string | null;
    bank_name: string | null;
    documents: {
      cccd_front_url: string | null;
      cccd_back_url: string | null;
      selfie_url: string | null;
      expires_at: string | null;
    };
  } | null;
  history: Array<{
    stage: "access" | "profile";
    decision: "approve" | "request_changes" | "reject";
    reason: string | null;
    decided_at: string;
    decided_by_name: string | null;
  }>;
};

export type AdminWorkerProfileDecisionInput = {
  decision: "approve" | "request_changes";
  profile_review_queue_id: string;
  expected_profile_updated_at: string;
  reason?: string;
};

export type AdminWorkerProfileDecisionResponse = {
  ok: true;
  application_id: string;
  worker_id: string;
  decision: AdminWorkerProfileDecisionInput["decision"];
  verification_status: WorkerVerificationStatus;
  decided_at: string;
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
  version: number;
  granted_at: string;
  updated_at: string;
  last_activity_at: string | null;
};
export type AdminSubAdminListInput = {
  limit: number;
  cursor?: string;
};
export type AdminSubAdminListResponse = {
  actor: AdminActor;
  generated_at: string;
  total_count: number;
  members: AdminSubAdminSummary[];
  nominations: AdminManagerNominationSummary[];
  pending_accounts: AdminOperatorProvisioningSummary[];
  has_more: boolean;
  next_cursor: string | null;
};
export type AdminOperatorProvisioningSummary = {
  id: string;
  full_name: string;
  email_masked: string;
  status: "pending_password_change" | "active" | "failed";
  capabilities: AdminControlCapability[];
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
};
export type AdminOperatorProvisionResponse = {
  ok: true;
  account: AdminOperatorProvisioningSummary;
};

export type AdminOperatorResetPasswordResponse = {
  ok: true;
  provisioning_id: string;
  updated_at: string;
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
  client_request_id: string;
  expected_version: number;
  reason?: string;
};

export type AdminSubAdminAccessResponse = {
  ok: true;
  user_id: string;
  status: "active" | "revoked";
  role: UserRole;
  capabilities: AdminControlCapability[];
  version: number;
  event_id: string;
  generated_at: string;
  replayed: boolean;
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
  generated_at: string;
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
  generated_at: string;
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
  generated_at: string;
  rules: AdminLearningRuleSummary[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number;
};

export type AdminServiceTaxonomyProblem = {
  id: string;
  slug: string;
  label_vi: string;
  default_complexity: string;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
};

export type AdminServiceTaxonomyCategory = {
  id: string;
  service_type: ServiceType;
  slug: string;
  label_vi: string;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
  problems: AdminServiceTaxonomyProblem[];
};

export type AdminServiceTaxonomyResponse = {
  generated_at: string;
  data_quality: "available" | "partial" | "unavailable";
  categories: AdminServiceTaxonomyCategory[];
};
