import type {
  ComplexityLevel,
  LearningCandidateStatus,
  ServiceType,
} from "../../../../_shared/domain.ts";

export type MarketCacheInvalidateInput = {
  cache_id?: string;
  district_code?: string;
  service_type?: ServiceType;
  problem_slug?: string;
  complexity?: ComplexityLevel;
};

export type MarketCacheInvalidateResponse = {
  invalidated_count: number;
  invalidated_at: string;
  filters: MarketCacheInvalidateInput;
};

export type KaelLearningQueueProcessInput = {
  limit?: number;
  force_realtime?: boolean;
};

export type KaelLearningQueueProcessResponse = {
  selected: number;
  submitted: number;
  realtime_fallback: number;
  batch_id?: string;
  provider_batch_id?: string;
  skipped_reason?: string;
  error_code?: string;
};

export type KaelBatchResultsProcessInput = {
  limit?: number;
  force_poll?: boolean;
};

export type KaelBatchResultsProcessResponse = {
  checked: number;
  ended: number;
  processed_items: number;
  failed_items: number;
  skipped_reason?: string;
  error_code?: string;
};

export type KaelLearningMonitorInput = {
  limit?: number;
};

export type KaelLearningMonitorResponse = {
  checked: number;
  monitored: number;
  rolled_back: number;
  loop_health?: {
    checked_at: string;
    manual_review_sla_days: number;
    manual_review_overdue_count: number;
    manual_review_overdue_ids: string[];
    failed_queue_count: number;
    failed_queue_ids: string[];
    failed_batch_count: number;
    failed_batch_ids: string[];
    error_codes: string[];
  };
  skipped_reason?: string;
  error_code?: string;
};

export type KaelLearningCandidateListInput = {
  state: LearningCandidateStatus;
  limit?: number;
};

export type KaelLearningCandidateSummary = {
  id: string;
  candidate_type: string;
  affected_service: ServiceType | null;
  affected_problem: string | null;
  affected_district: string | null;
  confidence: number;
  evidence_count: number;
  status: LearningCandidateStatus;
  audit_reason: string | null;
  created_at: string;
  updated_at: string;
  promoted_at: string | null;
  rolled_back_at: string | null;
  suggested_payload: Record<string, unknown>;
  evidence_snapshot: Record<string, unknown> | null;
};

export type KaelLearningCandidateListResponse = {
  candidates: KaelLearningCandidateSummary[];
};

export type KaelLearningCandidateReviewInput = {
  review_note?: string;
  reason?: string;
};

export type KaelLearningCandidateApproveResponse = {
  ok: boolean;
  candidate_id: string;
  rule_id: string | null;
  rule_version: number | null;
  status: string;
  knowledge_apply: {
    ok: boolean;
    error_code: string | null;
    knowledge_table: string | null;
    record_key: string | null;
    knowledge_version: number | null;
  } | null;
};

export type KaelLearningCandidateRejectResponse = {
  ok: boolean;
  candidate_id: string;
  status: string;
};
