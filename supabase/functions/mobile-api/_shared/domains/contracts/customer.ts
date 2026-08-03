import type {
  JobStatus,
  ScopeChangeStatus,
} from "../../../../_shared/domain.ts";

export type EdgeCustomerKaelFeedbackResponse = {
  feedback_id: string;
  status: "new";
  created_at: string;
};

export type EdgeCustomerProfileInsightsResponse = {
  customer_id: string;
  member_since: string | null;
  kael_interaction_count: number;
  completed_service_count: number;
  saved_address_count: number;
  preferred_service_count: number;
  active_service_days: number;
  active_streak_days: number;
  reviewed_service_count: number;
  positive_review_rate_percent: number;
  price_savings_vnd: number;
  total_spend_vnd: number;
  usage_rank_level: number;
  usage_rank_points: number;
  fair_price_service_count: number;
  money_protection_score: number;
  protected_value_vnd: number;
  protected_transaction_count: number;
  total_transaction_count: number;
  dispute_free_rate_percent: number;
  fair_price_status: "verified" | "mixed" | "pending" | null;
};

export type EdgeCustomerRefundAccountResponse = {
  refund_account: {
    id: string;
    bank_key: string;
    bank_name: string;
    bank_account_masked: string;
    status: "pending_verification" | "verified" | "rejected";
    is_default: boolean;
    verified_at: string | null;
    updated_at: string;
  } | null;
};

export type EdgeCustomerFavoriteWorkerResponse = {
  worker_id: string;
  is_favorite: boolean;
};

export type EdgeCustomerCancellationResponse = {
  cancellation_id: string;
  job_id: string;
  status: "requested";
  job_status: JobStatus;
  sub_case:
    | "before_a7"
    | "after_a7_before_worker_accept"
    | "after_worker_accept"
    | "after_worker_completed_trigger_dispute"
    | "scheduled_job";
  reason_code: string;
  reason_category: string;
  admin_review_required: boolean;
  phase0_no_monetary_penalty: boolean;
  worker_goodwill: Record<string, unknown> | null;
  abuse_signals: string[];
  message: string;
  created_at: string;
};

export type EdgeCustomerScopeDecisionResponse = {
  scope_change_id: string;
  job_id: string;
  status: ScopeChangeStatus;
  decided_at: string;
};

export type EdgeCustomerAvatarResponse = {
  customer_id: string;
  avatar_url: string | null;
  updated_at: string | null;
};

export type EdgeCustomerAvatarUploadResponse = {
  bucket_id: "customer-avatars";
  object_path: string;
  avatar_ref: string;
  token: string;
  signed_upload_url: string;
  expires_in_seconds: number;
};

export type EdgeCustomerAccountDeletionResponse = {
  account_deleted: true;
  request_id: string;
  retained_transaction_records: true;
};
