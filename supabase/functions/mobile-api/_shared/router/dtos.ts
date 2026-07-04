import type {
  ApartmentAccessProfileInput,
  AvailabilityToggleInput,
  BroadcastStatus,
  ComplexityLevel,
  CustomerCancellationRequestInput,
  CustomerKaelFeedbackInput,
  CustomerScopeDecisionInput,
  DevicePushTokenInput,
  DisputeAdminDecisionInput,
  DisputeCounterStatementInput,
  DisputeOpenRequestInput,
  JobCreateInput,
  JobMediaAttachInput,
  JobMessageSendInput,
  JobStatus,
  KaelChatCreateInput,
  KaelChatTurnInput,
  KaelWorkerClarifyInput,
  LearningCandidateStatus,
  MessageSender,
  PlacesAutocompleteInput,
  ReviewInput,
  ScopeChangeStatus,
  ServiceType,
  UpdateKaelMemoryInput,
  UserRole,
  WorkerCancellationDecisionInput,
  WorkerCancellationRequestInput,
  WorkerKaelChatCreateInput,
  WorkerKaelChatTurnInput,
  WorkerKaelFeedbackInput,
  WorkerKaelTrainingConsentInput,
  WorkerRegisterInput,
  WorkerScopeChangeInput,
  WorkerVerificationStatus,
} from "../../../_shared/domain.ts";
import type { KaelPublicCharterResponse } from "../kael/system-prompt.ts";
import type {
  PriceSynthesisAbCaseInput,
  PriceSynthesisAbEvaluation,
} from "../kael/price-synthesis-ab.ts";

export type EdgeKaelEstimate = {
  service_type: ServiceType;
  problem_category: string;
  problem_summary: string;
  complexity: ComplexityLevel;
  price_min: number;
  price_max: number;
  confidence: number;
  advisory: string | null;
  disclaimer: string;
};

export type EdgeServiceCatalogResponse = {
  services: {
    id: string;
    service_type: ServiceType;
    label_vi: string;
    problems: {
      id: string;
      slug: string;
      label_vi: string;
      default_complexity: ComplexityLevel;
    }[];
    baselines: {
      complexity: ComplexityLevel;
      district_code: string;
      price_min: number;
      price_max: number;
    }[];
  }[];
};

export type EdgeCreateJobResponse = {
  job_id: string;
  display_code?: string;
  status: JobStatus;
  estimate: EdgeKaelEstimate;
  estimate_card_v3?: Record<string, unknown>;
  final_price?: number | null;
  fallback_used: boolean;
  broadcast_sent?: boolean;
  message?: string;
};
export type EdgeKaelChatStatus =
  | "active"
  | "collecting_evidence"
  | "estimate_ready"
  | "confirmed"
  | "abandoned"
  | "unsupported";
export type EdgeKaelChatNextAction =
  | "await_input"
  | "collect_evidence"
  | "ask_photo"
  | "ask_video"
  | "estimate_ready"
  | "unsupported"
  | "budget_exceeded"
  | "confirmed";
export type EdgeKaelChatTurnResponse = {
  id: string;
  session_id: string;
  turn_index: number;
  role: "customer" | "kael" | "system";
  content_type:
    | "text"
    | "photo_request"
    | "video_request"
    | "photo_attached"
    | "video_attached"
    | "clarification"
    | "analysis"
    | "estimate"
    | "error";
  text_content: string | null;
  media_refs: string[];
  estimate: EdgeKaelEstimate | null;
  created_at: string;
};
export type EdgeKaelChatSessionResponse = {
  id: string;
  job_id: string | null;
  customer_id: string;
  service_type: ServiceType;
  status: EdgeKaelChatStatus;
  estimate: EdgeKaelEstimate | null;
  started_at: string;
  estimate_ready_at: string | null;
  total_turns: number;
  total_cost_usd: number;
  next_action: EdgeKaelChatNextAction;
};
export type EdgeKaelChatResponse = {
  session: EdgeKaelChatSessionResponse;
  turns: EdgeKaelChatTurnResponse[];
};
export type EdgeKaelChatProgressResponse = {
  session_id: string;
  progress: {
    current_stage: string;
    status: "queued" | "running" | "completed" | "failed";
    progress: number;
    failure_reason: string | null;
    updated_at: string;
  } | null;
};
export type EdgeConfirmSearchResponse = {
  job_id: string;
  status: JobStatus;
  broadcast_sent: boolean;
  worker: null | { full_name: string; rating: number; total_jobs: number };
  message: string;
};
export type EdgeStatusUpdateResponse = {
  job_id: string;
  from_status: JobStatus;
  to_status: JobStatus;
  updated_at: string;
};
export type EdgeConfirmCompletionResponse = {
  job_id: string;
  status: JobStatus;
  final_price: number | null;
};
export type EdgeReviewResponse = { review_id: string; job_id: string; status: JobStatus };
export type EdgeCustomerKaelFeedbackResponse = {
  feedback_id: string;
  status: "new";
  created_at: string;
};
export type EdgeWorkerRegisterResponse = {
  worker_id: string;
  verification_status: WorkerVerificationStatus;
  submitted_at: string;
};
export type EdgeAvailabilityToggleResponse = {
  worker_id: string;
  is_available: boolean;
  updated_at: string;
};
export type EdgeAddressAccessView = {
  release_stage: "area_only" | "building_released" | "unit_released";
  exact_unit_released: boolean;
  worker_checked_in: boolean;
  check_in_required: boolean;
  identity_check_required: boolean;
  customer_handoff_required: boolean;
  evidence_mode: "none" | "geofence" | "manual_photo";
  access_profile: ApartmentAccessProfileInput;
};
export type EdgeAcceptBroadcastResponse = {
  job_id: string;
  status: JobStatus;
  full_address: {
    building: string | null;
    unit: string | null;
    floor: string | null;
    district: string | null;
  };
  address_access: EdgeAddressAccessView;
};
export type EdgeDeclineBroadcastResponse = { job_id: string; declined: true };
export type EdgeWorkerScopeChangeResponse = {
  scope_change_id: string;
  job_id: string;
  status: ScopeChangeStatus;
  created_at: string;
  kael_estimate?: {
    price_min: number;
    price_max: number;
    confidence: number;
    problem_summary: string;
    advisory: string | null;
    complexity_assessment: "small" | "medium" | "large";
    disclaimer: string;
    fallback_used: boolean;
  };
  anti_fraud?: Record<string, unknown>;
  worker_challenge?: Record<string, unknown>;
  customer_card?: Record<string, unknown>;
};
export type EdgeWorkerKaelClarifyResponse = {
  qa_id: string;
  job_id: string;
  remaining_questions: number;
  answer: {
    schema_version: "worker_qa_answer.v1";
    text: string;
    safety_notes: string[];
  };
};
export type EdgeWorkerKaelChatStatus = "active" | "closed" | "escalated" | "error";
export type EdgeWorkerKaelChatTurnResponse = {
  id: string;
  session_id: string;
  turn_index: number;
  role: "worker" | "kael" | "system";
  content_type: "text" | "clarification" | "guidance" | "photo_request" | "photo_attached" | "error";
  text_content: string | null;
  media_refs: string[];
  safety_notes: string[];
  created_at: string;
};
export type EdgeWorkerKaelChatSessionResponse = {
  id: string;
  job_id: string;
  worker_id: string;
  status: EdgeWorkerKaelChatStatus;
  started_at: string;
  closed_at: string | null;
  total_turns: number;
  progress: {
    current_stage: string;
    status: "queued" | "running" | "completed" | "failed";
    progress: number;
    failure_reason: string | null;
    updated_at: string;
  } | null;
};
export type EdgeWorkerKaelChatResponse = {
  session: EdgeWorkerKaelChatSessionResponse;
  turns: EdgeWorkerKaelChatTurnResponse[];
};
export type EdgeWorkerKaelChatListResponse = {
  sessions: EdgeWorkerKaelChatSessionResponse[];
};
export type EdgeWorkerKaelFeedbackResponse = {
  feedback_id: string;
  status: "new";
  created_at: string;
};
export type EdgeWorkerKaelTrainingConsentResponse = {
  worker_id: string;
  training_consent: boolean;
  updated_at: string | null;
};
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
export type EdgeWorkerCancellationResponse = {
  cancellation_id: string;
  job_id: string;
  status: string;
  job_status: JobStatus;
  broadcast_sent: boolean;
  message: string;
  created_at: string;
  reason_code: string;
  reason_category: string;
  admin_review_required: boolean;
  abuse_signals: string[];
  fallback_options: {
    id: string;
    label_vi: string;
    effect: string;
    no_charge_phase0?: boolean;
  }[];
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
export type EdgeDisputeOpenResponse = {
  dispute_id: string;
  job_id: string;
  status: string;
  dispute_type: string;
  evidence_snapshot_id: string;
  admin_review_required: boolean;
  priority: "low" | "medium" | "high" | "critical";
  evidence_locked_at: string;
  message: string;
  created_at: string;
};
export type EdgeDisputeCounterStatementResponse = {
  dispute_id: string;
  status: string;
  counter_party_statement_submitted: boolean;
  updated_at: string;
};
export type EdgeDisputeAdminDecisionResponse = {
  dispute_id: string;
  status: string;
  outcome: string;
  decided_at: string;
};
export type EdgeWorkerCancellationDecisionResponse = {
  cancellation_id: string;
  job_id: string;
  status: string;
  job_status: JobStatus;
  broadcast_sent: boolean;
  message: string;
};
export type EdgeJobMediaAttachResponse = {
  job_id: string;
  photo_urls: string[];
  media: {
    bucket_id: "job-media";
    object_path: string;
    storage_ref: string;
    stage: "before" | "after" | "kael_reference" | "cancellation_evidence" | "scope_change_evidence" | "access_check_in";
  }[];
};
export type EdgeJobMessageResponse = {
  id: string;
  job_id: string;
  sender_id: string | null;
  sender_role: MessageSender;
  content: string;
  is_read: boolean;
  created_at: string;
};
export type EdgeJobMessageListResponse = {
  job_id: string;
  messages: EdgeJobMessageResponse[];
};
export type EdgeJobMessageSendResponse = {
  message: EdgeJobMessageResponse;
};
export type EdgeCustomerScopeDecisionResponse = {
  scope_change_id: string;
  job_id: string;
  status: ScopeChangeStatus;
  decided_at: string;
};
export type EdgeNotificationListResponse = {
  unread_count: number;
  notifications: {
    id: string;
    title: string;
    body: string;
    event_type: string;
    status: string;
    job_id: string | null;
    created_at: string;
    read_at: string | null;
  }[];
};
export type EdgeNotificationReadResponse = {
  notification_id: string;
  status: "read";
  read_at: string;
};
export type EdgeDevicePushTokenResponse = {
  token_id: string;
  enabled: boolean;
  updated_at: string;
};
export type EdgeBroadcastListResponse = {
  broadcasts: {
    broadcast_id: string;
    job_id: string;
    status: BroadcastStatus;
    service_type: ServiceType;
    problem_summary: string | null;
    district: string | null;
    estimated_price_min: number | null;
    estimated_price_max: number | null;
    estimated_earning_min: number | null;
    estimated_earning_max: number | null;
    worker_brief_core?: Record<string, unknown> | null;
    sent_at: string | null;
    expires_at: string | null;
    seconds_remaining: number | null;
  }[];
};
export type EdgeWorkerJobListResponse = {
  jobs: {
    id: string;
    status: JobStatus;
    service_type: ServiceType;
    problem_summary: string | null;
    address_building: string | null;
    address_unit: string | null;
    address_floor: string | null;
    district: string | null;
    address_access: EdgeAddressAccessView;
    final_price: number | null;
    estimated_earning: number | null;
    completion_notes: string | null;
    completion_photo_urls: string[];
    worker_brief_guidance?: Record<string, unknown> | null;
    created_at: string;
    matched_at: string | null;
    completed_at: string | null;
  }[];
};
export type EdgeEarningsResponse = {
  worker_id: string;
  total_jobs_paid: number;
  gross_earnings: number;
  platform_fee_total: number;
  net_earnings: number;
  pending_payment_count: number;
  pending_payment_amount: number;
  from_date: string | null;
  to_date: string | null;
};
export type EdgeWorkerProfileResponse = {
  id: string;
  verification_status: WorkerVerificationStatus;
  is_available: boolean;
  is_approved: boolean;
  is_suspended: boolean;
  service_types: ServiceType[];
  districts: string[];
  home_lat: number | null;
  home_lng: number | null;
  service_radius_km: number | null;
  years_experience: number;
  rating: number;
  total_jobs: number;
  legal_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  bank_account_masked: string | null;
  bank_name: string | null;
  has_cccd: boolean;
  has_selfie: boolean;
};
export type EdgeJobDetailResponse = {
  job: {
    id: string;
    status: JobStatus;
    service_type: ServiceType;
    description: string;
    problem_chips: string[];
    photo_urls: string[];
    address_building: string | null;
    address_unit: string | null;
    address_floor: string | null;
    address_district: string | null;
    address_access: EdgeAddressAccessView;
    scheduled_at: string | null;
    kael_problem_identified: string | null;
    kael_complexity: ComplexityLevel | null;
    kael_price_min: number | null;
    kael_price_max: number | null;
    kael_advisory: string | null;
    kael_estimate_card_v3: Record<string, unknown> | null;
    kael_worker_brief_core: Record<string, unknown> | null;
    kael_worker_brief_guidance: Record<string, unknown> | null;
    kael_progress: EdgeKaelChatProgressResponse["progress"];
    final_price: number | null;
    completion_notes: string | null;
    completion_photo_urls: string[];
    created_at: string;
    matched_at: string | null;
    arrived_at: string | null;
    completed_at: string | null;
    confirmed_at: string | null;
    paid_at: string | null;
    reviewed_at: string | null;
  };
  broadcast_state: {
    active_count: number;
    seconds_remaining: number | null;
  } | null;
  current_scope_change: {
    id: string;
    status: ScopeChangeStatus;
    requested_description: string | null;
    reason: string | null;
    price_min: number | null;
    price_max: number | null;
    kael_computed_min: number | null;
    kael_computed_max: number | null;
    kael_review: Record<string, unknown> | null;
    kael_progress: EdgeKaelChatProgressResponse["progress"];
    evidence_photo_urls: string[];
    created_at: string | null;
  } | null;
};

export type EdgeCustomerActiveJobResponse = {
  active_job: EdgeJobDetailResponse | null;
};
