export type EdgeViolationConsequence = {
  entry_kind: string;
  effective_until: string | null;
  restored: boolean;
  detail: Record<string, unknown>;
};

export type EdgeViolationCase = {
  id: string;
  violation_code: string;
  level: number;
  source: "detector" | "admin" | "customer_report";
  statement: string | null;
  status: "proposed" | "confirmed" | "dismissed" | "fabricated_report";
  decision_deadline_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  appeal_status: "none" | "submitted" | "upheld" | "overturned";
  appeal_deadline_at: string | null;
  suspended_pending_review: boolean;
  created_at: string;
  consequences: EdgeViolationConsequence[];
};

export type EdgeDisciplinePolicyView = {
  l1_matching_days: number;
  l2_points_debit: number;
  l2_network_freeze_days: number;
  l3_freeze_days: number;
  strike_window_months: number;
  appeal_window_days: number;
  withdrawal_hold_days: number;
};

export type EdgeWorkerViolationsResponse = {
  policy: EdgeDisciplinePolicyView;
  cases: EdgeViolationCase[];
};

export type EdgeAppealEvidenceUploadResponse = {
  path: string;
  signed_url: string;
  token: string;
};

export type EdgeWorkerReportResponse = {
  case_id: string;
  level: number;
  status: EdgeViolationCase["status"];
};

export type EdgeAdminViolationCaseSummary = EdgeViolationCase & {
  worker_id: string;
  worker_name: string | null;
};

export type EdgeAdminViolationCaseDetail = EdgeAdminViolationCaseSummary & {
  customer_id: string | null;
  job_id: string | null;
  evidence: Record<string, unknown>;
  identity_recorded: boolean;
  appeal: {
    reason: string;
    evidence: Array<{ path: string; signed_url: string | null }>;
    status: "submitted" | "upheld" | "overturned";
    submitted_at: string;
    decision_reason: string | null;
  } | null;
  chat_evidence: Array<{ original_body: string; matched_rules: string[]; created_at: string }>;
  events: Array<{ event_kind: string; actor_id: string | null; detail: Record<string, unknown>; created_at: string }>;
};

export type EdgeAdminViolationCasesResponse = {
  cases: EdgeAdminViolationCaseSummary[];
};

export type EdgeIdentityBlock = {
  id: string;
  kind: "cccd" | "phone" | "email";
  case_id: string | null;
  created_at: string;
  lifted_at: string | null;
  lift_reason: string | null;
};

export type EdgeIdentityBlocksResponse = {
  blocks: EdgeIdentityBlock[];
};

export type EdgeWorkerIdentityNumberResponse = {
  worker_id: string;
  cccd_last4: string;
};
