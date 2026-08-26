import type { ServiceType } from "../../../../_shared/domain.ts";

type AdminSystemListInput = {
  query: string;
  limit: number;
  cursor?: string;
};

type AdminSystemPriceListInput = AdminSystemListInput & {
  from?: string;
  to?: string;
  service_type: ServiceType | "all";
  problem_id?: string;
  complexity: "all" | "small" | "medium" | "large";
  district: string;
  status: "all" | "active" | "superseded" | "retired";
  evidence_source: string;
};

type AdminSystemTaxonomyListInput = AdminSystemListInput & {
  status: "all" | "active" | "inactive";
  complexity: "all" | "small" | "medium" | "large";
  baseline: "all" | "available" | "missing";
};

type AdminSystemLearningListInput = AdminSystemListInput & {
  from?: string;
  to?: string;
  status: string;
  rule_type: string;
  service_type: ServiceType | "all";
  problem: string;
  district: string;
  confidence_min?: number;
  confidence_max?: number;
  rollback: "all" | "available" | "unavailable";
};

type AdminSystemModelHealthInput = AdminSystemListInput & {
  from?: string;
  to?: string;
  view: "overview" | "incidents" | "costs";
  provider: string;
  model: string;
  purpose: string;
  failure_kind: string;
  circuit: "all" | "open" | "closed";
};

type AdminSystemMutationInput = {
  expected_version: number;
  client_request_id: string;
  reason: string;
};

type AdminSystemPriceMutationInput = AdminSystemMutationInput & {
  baseline_id?: string;
  evidence_package_id: string;
  effective_from?: string;
};

type AdminSystemTaxonomyMutationInput = {
  expected_revision: number;
  client_request_id: string;
  reason: string;
  service_patch?: { label_vi?: string; label_en?: string };
  problem_changes: Array<
    | { action: "create"; value: { slug: string; label_vi: string; label_en: string; default_complexity: "small" | "medium" | "large"; sort_order: number } }
    | { action: "update"; id: string; patch: { label_vi?: string; label_en?: string; default_complexity?: "small" | "medium" | "large" } }
    | { action: "activate" | "deactivate"; id: string }
    | { action: "reorder"; id: string; sort_order: number }
  >;
};

type AdminSystemLearningActionInput = AdminSystemMutationInput & { target_version?: number };

type AdminSystemDataQuality = "available" | "partial" | "unavailable";
type AdminSystemPermission = "read" | "manage";

type AdminSystemReceipt = {
  event_id: string;
  action: string;
  resource_id: string;
  actor_id: string;
  recorded_at: string;
  new_version: number;
  replayed: boolean;
};

type AdminSystemListResponse<TRecord, TSummary extends Record<string, number | string | null>> = {
  generated_at: string;
  data_quality: AdminSystemDataQuality;
  summary: TSummary;
  records: TRecord[];
  has_more: boolean;
  next_cursor: string | null;
  next_offset: number | null;
};

type AdminSystemDetailResponse<TRecord, THistory = Record<string, unknown>> = {
  generated_at: string;
  data_quality: AdminSystemDataQuality;
  record: TRecord;
  version: number;
  history: THistory[];
  available_actions: string[];
  permission: AdminSystemPermission;
};

type AdminSystemPriceSummary = {
  id: string;
  service_type: ServiceType;
  service_label_vi: string;
  service_label_en: string | null;
  problem_id: string;
  problem_slug: string;
  problem_label_vi: string;
  problem_label_en: string | null;
  complexity: "small" | "medium" | "large";
  district_code: string;
  price_min: number;
  price_max: number;
  unit: string;
  lifecycle: "active" | "superseded" | "retired";
  version: number;
  accepted_evidence_count: number;
  evidence_quorum_met: boolean | null;
  effective_from: string | null;
  updated_at: string;
};

type AdminSystemPriceEvidence = {
  domain: string;
  url: string;
  observed_at: string | null;
  published_at: string | null;
  verified_at: string | null;
  price_min: number;
  price_max: number;
  unit: string;
  normalized: boolean;
  effective_tier: 1 | 2 | null;
  accepted: boolean;
  exclusion_reason: string | null;
};

type AdminSystemPriceDetail = AdminSystemPriceSummary & {
  source: string;
  retired_at: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  evidence: AdminSystemPriceEvidence[];
  quorum_required: number | null;
  downstream_reference_count: number;
};

type AdminSystemPriceListResponse = AdminSystemListResponse<AdminSystemPriceSummary, {
  active_count: number;
  quorum_count: number;
  inactive_count: number;
  attention_count: number;
}>;

type AdminSystemPriceDetailResponse = AdminSystemDetailResponse<AdminSystemPriceDetail>;

type AdminSystemEvidencePackage = {
  id: string;
  schema_version: "baseline_price_evidence.v1";
  service_type: ServiceType;
  problem_id: string;
  complexity: "small" | "medium" | "large";
  district_code: string;
  aggregate_min: number;
  aggregate_max: number;
  unit: string;
  accepted_source_count: number;
  verified_at: string;
};

type AdminSystemPriceValidationResponse = {
  generated_at: string;
  valid: boolean;
  current: AdminSystemPriceSummary | null;
  proposed: AdminSystemEvidencePackage;
  evidence: AdminSystemPriceEvidence[];
  rejected_reasons: string[];
};

type AdminSystemTaxonomyProblem = {
  id: string;
  slug: string;
  label_vi: string;
  label_en: string | null;
  default_complexity: "small" | "medium" | "large";
  is_active: boolean;
  sort_order: number;
  quote_ready: boolean;
  reference_count: number;
  updated_at: string;
};

type AdminSystemTaxonomyService = {
  id: string;
  service_type: ServiceType;
  slug: string;
  label_vi: string;
  label_en: string | null;
  revision: number;
  active_problem_count: number;
  inactive_problem_count: number;
  quote_ready_problem_count: number;
  data_quality: AdminSystemDataQuality;
  updated_at: string;
  problems?: AdminSystemTaxonomyProblem[];
};

type AdminSystemTaxonomyListResponse = AdminSystemListResponse<AdminSystemTaxonomyService, {
  canonical_service_count: number;
  active_problem_count: number;
  inactive_problem_count: number;
  missing_baseline_count: number;
}>;

type AdminSystemTaxonomyDetailResponse = AdminSystemDetailResponse<AdminSystemTaxonomyService>;

type AdminSystemTaxonomyValidationResponse = {
  generated_at: string;
  valid: boolean;
  before: AdminSystemTaxonomyService;
  after: AdminSystemTaxonomyService;
  impact: { activated_problem_count: number; deactivated_problem_count: number; affected_reference_count: number };
  issues: string[];
};

type AdminSystemLearningRuleSummary = {
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
  dependency_count: number;
  updated_at: string;
};

type AdminSystemLearningRuleDetail = AdminSystemLearningRuleSummary & {
  provenance_id: string | null;
  release_id: string | null;
  scope_actor: string | null;
  scope_workflow: string | null;
  safe_payload: Record<string, unknown>;
  dependencies: Array<{ id: string; type: string; status: string }>;
};

type AdminSystemLearningListResponse = AdminSystemListResponse<AdminSystemLearningRuleSummary, {
  active_count: number;
  monitoring_count: number;
  rollback_count: number;
  inactive_count: number;
}>;

type AdminSystemLearningDetailResponse = AdminSystemDetailResponse<AdminSystemLearningRuleDetail>;

type AdminSystemLearningPreviewResponse = {
  generated_at: string;
  action: "rollback" | "revoke";
  rule_id: string;
  current_version: number;
  target_version: number | null;
  dependency_count: number;
  dependencies: Array<{ id: string; type: string; status: string }>;
};

type AdminSystemModelInventoryRecord = {
  provider: string;
  model: string;
  purpose: string;
  configured: boolean;
  detail_key: string;
};

type AdminSystemModelHealthRecord = {
  detail_key: string;
  bucket: string;
  provider: string;
  model: string | null;
  purpose: string;
  call_count: number | null;
  success_count: number | null;
  failure_count: number | null;
  fallback_count: number | null;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  total_cost_usd: number | null;
  failure_kind: string | null;
  circuit_state: "open" | "closed" | null;
  updated_at: string;
};

type AdminSystemModelHealthResponse = AdminSystemListResponse<AdminSystemModelHealthRecord, {
  configured_count: number;
  call_count: number | null;
  failure_count: number | null;
  fallback_count: number | null;
  open_circuit_count: number | null;
  total_cost_usd: string | null;
}> & {
  data_quality_sources: {
    inventory: AdminSystemDataQuality;
    calls: AdminSystemDataQuality;
    latency: AdminSystemDataQuality;
    costs: AdminSystemDataQuality;
    circuits: AdminSystemDataQuality;
  };
  inventory: AdminSystemModelInventoryRecord[];
};

type AdminSystemModelHealthDetailResponse = AdminSystemDetailResponse<AdminSystemModelHealthRecord>;

export type AdminSystemContracts = {
  priceListInput: AdminSystemPriceListInput;
  taxonomyListInput: AdminSystemTaxonomyListInput;
  learningListInput: AdminSystemLearningListInput;
  modelHealthInput: AdminSystemModelHealthInput;
  mutationInput: AdminSystemMutationInput;
  priceMutationInput: AdminSystemPriceMutationInput;
  taxonomyMutationInput: AdminSystemTaxonomyMutationInput;
  learningActionInput: AdminSystemLearningActionInput;
  priceListResponse: AdminSystemPriceListResponse;
  priceDetailResponse: AdminSystemPriceDetailResponse;
  evidencePackage: AdminSystemEvidencePackage;
  priceValidationResponse: AdminSystemPriceValidationResponse;
  taxonomyListResponse: AdminSystemTaxonomyListResponse;
  taxonomyDetailResponse: AdminSystemTaxonomyDetailResponse;
  taxonomyValidationResponse: AdminSystemTaxonomyValidationResponse;
  learningListResponse: AdminSystemLearningListResponse;
  learningDetailResponse: AdminSystemLearningDetailResponse;
  learningPreviewResponse: AdminSystemLearningPreviewResponse;
  modelHealthResponse: AdminSystemModelHealthResponse;
  modelHealthDetailResponse: AdminSystemModelHealthDetailResponse;
  receipt: AdminSystemReceipt;
};
