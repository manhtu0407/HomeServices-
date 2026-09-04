import type { ServiceType } from '@nestscout/shared'

export type AdminViewPriceBaselineSummary = {
  id: string
  service_type: ServiceType
  complexity: string
  district_code: string
  price_min: number
  price_max: number
  source: string
  version: number
  updated_at: string
}

export type AdminViewPriceBaselineListResponse = {
  generated_at?: string
  price_baselines: AdminViewPriceBaselineSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number
}

export type AdminViewAiCostSummary = {
  day: string
  purpose: string
  provider: string
  call_count: number
  success_count: number
  failure_count: number
  fallback_count: number
  total_cost_usd: number
  avg_latency_ms: number | null
  p95_latency_ms: number | null
  failure_rate: number | null
}

export type AdminViewAiCostListResponse = {
  generated_at?: string
  costs: AdminViewAiCostSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number
}

export type AdminViewLearningRuleSummary = {
  id: string
  rule_type: string
  affected_service: ServiceType | null
  affected_problem: string | null
  affected_district: string | null
  confidence: number
  evidence_count: number
  status: string
  active_version: number
  rollback_available: boolean
  updated_at: string
}

export type AdminViewLearningRuleListResponse = {
  generated_at?: string
  rules: AdminViewLearningRuleSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number
}

export type AdminViewServiceTaxonomyProblem = {
  id: string
  slug: string
  label_vi: string
  default_complexity: string
  is_active: boolean
  sort_order: number
  updated_at: string
}

export type AdminViewServiceTaxonomyCategory = {
  id: string
  service_type: ServiceType
  slug: string
  label_vi: string
  is_active: boolean
  sort_order: number
  updated_at: string
  problems: AdminViewServiceTaxonomyProblem[]
}

export type AdminViewServiceTaxonomyResponse = {
  generated_at: string
  data_quality: 'available' | 'partial' | 'unavailable'
  categories: AdminViewServiceTaxonomyCategory[]
}

export type AdminSystemDataQuality = 'available' | 'partial' | 'unavailable'

export type AdminSystemListInput = {
  query?: string
  limit?: number
  cursor?: string
  [key: string]: string | number | undefined
}

export type AdminSystemReceipt = {
  event_id: string
  action: string
  resource_id: string
  actor_id: string
  recorded_at: string
  new_version: number
  replayed: boolean
}

export type AdminSystemMutationInput = {
  expected_version: number
  client_request_id: string
  reason: string
}

export type AdminSystemPriceRecord = {
  id: string
  service_type: ServiceType
  service_label_vi: string
  service_label_en: string | null
  problem_id: string
  problem_slug: string
  problem_label_vi: string
  problem_label_en: string | null
  complexity: 'small' | 'medium' | 'large'
  district_code: string
  price_min: number
  price_max: number
  unit: string
  lifecycle: 'active' | 'superseded' | 'retired'
  version: number
  accepted_evidence_count: number
  evidence_quorum_met: boolean | null
  effective_from: string | null
  updated_at: string
}

export type AdminSystemPriceListResponse = {
  generated_at: string
  data_quality: AdminSystemDataQuality
  summary: { active_count: number; quorum_count: number; inactive_count: number; attention_count: number }
  records: AdminSystemPriceRecord[]
  has_more: boolean
  next_cursor: string | null
  next_offset: number | null
}

export type AdminSystemPriceEvidence = {
  domain: string
  url: string
  observed_at: string | null
  published_at: string | null
  verified_at: string | null
  price_min: number
  price_max: number
  unit: string
  normalized: boolean
  effective_tier: 1 | 2 | null
  accepted: boolean
  exclusion_reason: string | null
}

export type AdminSystemPriceDetailResponse = {
  generated_at: string
  data_quality: AdminSystemDataQuality
  record: AdminSystemPriceRecord & {
    source: string
    retired_at: string | null
    supersedes_id: string | null
    superseded_by_id: string | null
    evidence: AdminSystemPriceEvidence[]
    quorum_required: number | null
    downstream_reference_count: number
  }
  version: number
  history: Record<string, unknown>[]
  available_actions: string[]
  permission: 'read' | 'manage'
}

export type AdminSystemEvidencePackage = {
  id: string
  schema_version: 'baseline_price_evidence.v1'
  service_type: ServiceType
  problem_id: string
  complexity: 'small' | 'medium' | 'large'
  district_code: string
  aggregate_min: number
  aggregate_max: number
  unit: string
  accepted_source_count: number
  verified_at: string
}

export type AdminSystemPriceValidationResponse = {
  generated_at: string
  valid: boolean
  current: AdminSystemPriceRecord | null
  proposed: AdminSystemEvidencePackage
  evidence: AdminSystemPriceEvidence[]
  rejected_reasons: string[]
}

export type AdminSystemPriceMutationInput = AdminSystemMutationInput & {
  baseline_id?: string
  evidence_package_id: string
  effective_from?: string
}

export type AdminSystemTaxonomyProblem = {
  id: string
  slug: string
  label_vi: string
  label_en: string | null
  default_complexity: 'small' | 'medium' | 'large'
  is_active: boolean
  sort_order: number
  quote_ready: boolean
  reference_count: number
  updated_at: string
}

export type AdminSystemTaxonomyService = {
  id: string
  service_type: ServiceType
  slug: string
  label_vi: string
  label_en: string | null
  revision: number
  active_problem_count: number
  inactive_problem_count: number
  quote_ready_problem_count: number
  data_quality: AdminSystemDataQuality
  updated_at: string
  problems?: AdminSystemTaxonomyProblem[]
}

export type AdminSystemTaxonomyListResponse = {
  generated_at: string
  data_quality: AdminSystemDataQuality
  summary: { canonical_service_count: number; active_problem_count: number; inactive_problem_count: number; missing_baseline_count: number }
  records: AdminSystemTaxonomyService[]
  has_more: boolean
  next_cursor: string | null
  next_offset: number | null
}

export type AdminSystemTaxonomyDetailResponse = {
  generated_at: string
  data_quality: AdminSystemDataQuality
  record: AdminSystemTaxonomyService & { problems: AdminSystemTaxonomyProblem[] }
  version: number
  history: Record<string, unknown>[]
  available_actions: string[]
  permission: 'read' | 'manage'
}

export type AdminSystemTaxonomyMutationInput = {
  expected_revision: number
  client_request_id: string
  reason: string
  service_patch?: { label_vi?: string; label_en?: string }
  problem_changes: Record<string, unknown>[]
}

export type AdminSystemTaxonomyValidationResponse = {
  generated_at: string
  valid: boolean
  before: AdminSystemTaxonomyService
  after: AdminSystemTaxonomyService
  impact: { activated_problem_count: number; deactivated_problem_count: number; affected_reference_count: number }
  issues: string[]
}

export type AdminSystemLearningRecord = {
  id: string
  rule_type: string
  affected_service: ServiceType | null
  affected_problem: string | null
  affected_district: string | null
  confidence: number
  evidence_count: number
  status: string
  active_version: number
  rollback_available: boolean
  dependency_count: number
  updated_at: string
}

export type AdminSystemLearningListResponse = {
  generated_at: string
  data_quality: AdminSystemDataQuality
  summary: { active_count: number; monitoring_count: number; rollback_count: number; inactive_count: number }
  records: AdminSystemLearningRecord[]
  has_more: boolean
  next_cursor: string | null
  next_offset: number | null
}

export type AdminSystemLearningDetailResponse = {
  generated_at: string
  data_quality: AdminSystemDataQuality
  record: AdminSystemLearningRecord & {
    provenance_id: string | null
    release_id: string | null
    safe_payload: Record<string, unknown>
    dependencies: { id: string; type: string; status: string }[]
  }
  version: number
  history: Record<string, unknown>[]
  available_actions: string[]
  permission: 'read' | 'manage'
}

export type AdminSystemLearningActionInput = AdminSystemMutationInput & { target_version?: number }
export type AdminSystemLearningPreviewResponse = {
  generated_at: string
  action: 'rollback' | 'revoke'
  rule_id: string
  current_version: number
  target_version: number | null
  dependency_count: number
  dependencies: { id: string; type: string; status: string }[]
}

export type AdminSystemModelInventoryRecord = { provider: string; model: string; purpose: string; configured: boolean; detail_key: string }
export type AdminSystemModelHealthRecord = {
  detail_key: string
  bucket: string
  provider: string
  model: string | null
  purpose: string
  call_count: number | null
  success_count: number | null
  failure_count: number | null
  fallback_count: number | null
  avg_latency_ms: number | null
  p95_latency_ms: number | null
  total_cost_usd: number | null
  failure_kind: string | null
  circuit_state: 'open' | 'closed' | null
  updated_at: string
}

export type AdminSystemModelHealthResponse = {
  generated_at: string
  data_quality: AdminSystemDataQuality
  data_quality_sources: Record<'inventory' | 'calls' | 'latency' | 'costs' | 'circuits', AdminSystemDataQuality>
  summary: { configured_count: number; call_count: number | null; failure_count: number | null; fallback_count: number | null; open_circuit_count: number | null; total_cost_usd: string | null }
  inventory: AdminSystemModelInventoryRecord[]
  records: AdminSystemModelHealthRecord[]
  has_more: boolean
  next_cursor: string | null
  next_offset: number | null
}

export type AdminSystemModelHealthDetailResponse = {
  generated_at: string
  data_quality: AdminSystemDataQuality
  record: AdminSystemModelHealthRecord
  version: number
  history: Record<string, unknown>[]
  available_actions: []
  permission: 'read'
}
