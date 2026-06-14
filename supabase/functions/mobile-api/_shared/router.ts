import {
  type AvailabilityToggleInput,
  availabilityToggleSchema,
  type CustomerCancellationRequestInput,
  customerCancellationRequestSchema,
  type CustomerKaelFeedbackInput,
  customerKaelFeedbackSchema,
  type CustomerScopeDecisionInput,
  customerScopeDecisionSchema,
  type DisputeAdminDecisionInput,
  disputeAdminDecisionSchema,
  type DisputeCounterStatementInput,
  disputeCounterStatementSchema,
  type DisputeOpenRequestInput,
  disputeOpenRequestSchema,
  type DevicePushTokenInput,
  devicePushTokenSchema,
  type ApartmentAccessProfileInput,
  type JobCreateInput,
  type JobMediaAttachInput,
  jobMediaAttachSchema,
  type JobMessageSendInput,
  jobMessageSendSchema,
  jobCreateSchema,
  type KaelWorkerClarifyInput,
  kaelWorkerClarifySchema,
  type KaelChatCreateInput,
  kaelChatCreateSchema,
  type KaelChatTurnInput,
  kaelChatTurnSchema,
  type WorkerKaelChatCreateInput,
  workerKaelChatCreateSchema,
  type WorkerKaelChatTurnInput,
  workerKaelChatTurnSchema,
  type WorkerKaelFeedbackInput,
  workerKaelFeedbackSchema,
  type WorkerKaelTrainingConsentInput,
  workerKaelTrainingConsentSchema,
  type PlacesAutocompleteInput,
  placesAutocompleteSchema,
  type ReviewInput,
  reviewSchema,
  type WorkerCancellationDecisionInput,
  workerCancellationDecisionSchema,
  type WorkerCancellationRequestInput,
  workerCancellationRequestSchema,
  type WorkerRegisterInput,
  workerRegisterSchema,
  type WorkerScopeChangeInput,
  workerScopeChangeSchema,
  LEARNING_CANDIDATE_STATUSES,
} from "../../_shared/domain.ts";
import type {
  BroadcastStatus,
  ComplexityLevel,
  JobStatus,
  LearningCandidateStatus,
  MessageSender,
  ScopeChangeStatus,
  ServiceType,
  UserRole,
  WorkerVerificationStatus,
} from "../../_shared/domain.ts";
import type { KaelPublicCharterResponse } from "./kael/system-prompt.ts";
import {
  priceSynthesisAbCaseSchema,
  type PriceSynthesisAbCaseInput,
  type PriceSynthesisAbEvaluation,
} from "./kael/price-synthesis-ab.ts";

type KaelEstimate = {
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

type ServiceCatalogResponse = {
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

type CreateJobResponse = {
  job_id: string;
  status: JobStatus;
  estimate: KaelEstimate;
  estimate_card_v3?: Record<string, unknown>;
  final_price?: number | null;
  fallback_used: boolean;
  broadcast_sent?: boolean;
  message?: string;
};
type KaelChatStatus =
  | "active"
  | "estimate_ready"
  | "confirmed"
  | "abandoned"
  | "unsupported";
type KaelChatNextAction =
  | "await_input"
  | "ask_photo"
  | "ask_video"
  | "estimate_ready"
  | "unsupported"
  | "budget_exceeded"
  | "confirmed";
type KaelChatTurnResponse = {
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
  estimate: KaelEstimate | null;
  created_at: string;
};
type KaelChatSessionResponse = {
  id: string;
  job_id: string | null;
  customer_id: string;
  service_type: ServiceType;
  status: KaelChatStatus;
  estimate: KaelEstimate | null;
  started_at: string;
  estimate_ready_at: string | null;
  total_turns: number;
  total_cost_usd: number;
  next_action: KaelChatNextAction;
};
type KaelChatResponse = {
  session: KaelChatSessionResponse;
  turns: KaelChatTurnResponse[];
};
type KaelChatProgressResponse = {
  session_id: string;
  progress: {
    current_stage: string;
    status: "queued" | "running" | "completed" | "failed";
    progress: number;
    failure_reason: string | null;
    updated_at: string;
  } | null;
};
type ConfirmSearchResponse = {
  job_id: string;
  status: JobStatus;
  broadcast_sent: boolean;
  worker: null | { full_name: string; rating: number; total_jobs: number };
  message: string;
};
type StatusUpdateResponse = {
  job_id: string;
  from_status: JobStatus;
  to_status: JobStatus;
  updated_at: string;
};
type ConfirmCompletionResponse = {
  job_id: string;
  status: JobStatus;
  final_price: number | null;
};
type ReviewResponse = { review_id: string; job_id: string; status: JobStatus };
type CustomerKaelFeedbackResponse = {
  feedback_id: string;
  status: "new";
  created_at: string;
};
type WorkerRegisterResponse = {
  worker_id: string;
  verification_status: WorkerVerificationStatus;
  submitted_at: string;
};
type AvailabilityToggleResponse = {
  worker_id: string;
  is_available: boolean;
  updated_at: string;
};
type AddressAccessView = {
  release_stage: "area_only" | "building_released" | "unit_released";
  exact_unit_released: boolean;
  worker_checked_in: boolean;
  check_in_required: boolean;
  identity_check_required: boolean;
  customer_handoff_required: boolean;
  evidence_mode: "none" | "geofence" | "manual_photo";
  access_profile: ApartmentAccessProfileInput;
};
type AcceptBroadcastResponse = {
  job_id: string;
  status: JobStatus;
  full_address: {
    building: string | null;
    unit: string | null;
    floor: string | null;
    district: string | null;
  };
  address_access: AddressAccessView;
};
type DeclineBroadcastResponse = { job_id: string; declined: true };
type WorkerScopeChangeResponse = {
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
type WorkerKaelClarifyResponse = {
  qa_id: string;
  job_id: string;
  remaining_questions: number;
  answer: {
    schema_version: "worker_qa_answer.v1";
    text: string;
    safety_notes: string[];
  };
};
type WorkerKaelChatStatus = "active" | "closed" | "escalated" | "error";
type WorkerKaelChatTurnResponse = {
  id: string;
  session_id: string;
  turn_index: number;
  role: "worker" | "kael" | "system";
  content_type: "text" | "clarification" | "guidance" | "photo_request" | "photo_attached" | "error";
  text_content: string | null;
  media_refs: string[];
  safe_metadata: Record<string, unknown>;
  created_at: string;
};
type WorkerKaelChatSessionResponse = {
  id: string;
  job_id: string;
  worker_id: string;
  status: WorkerKaelChatStatus;
  started_at: string;
  closed_at: string | null;
  total_turns: number;
  total_cost_usd: number;
  progress: {
    current_stage: string;
    status: "queued" | "running" | "completed" | "failed";
    progress: number;
    failure_reason: string | null;
    updated_at: string;
  } | null;
  safe_metadata: Record<string, unknown>;
};
type WorkerKaelChatResponse = {
  session: WorkerKaelChatSessionResponse;
  turns: WorkerKaelChatTurnResponse[];
};
type WorkerKaelChatListResponse = {
  sessions: WorkerKaelChatSessionResponse[];
};
type WorkerKaelFeedbackResponse = {
  feedback_id: string;
  status: "new";
  created_at: string;
};
type WorkerKaelTrainingConsentResponse = {
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
type WorkerCancellationResponse = {
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
type CustomerCancellationResponse = {
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
type DisputeOpenResponse = {
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
type DisputeCounterStatementResponse = {
  dispute_id: string;
  status: string;
  counter_party_statement_submitted: boolean;
  updated_at: string;
};
type DisputeAdminDecisionResponse = {
  dispute_id: string;
  status: string;
  outcome: string;
  decided_at: string;
};
type WorkerCancellationDecisionResponse = {
  cancellation_id: string;
  job_id: string;
  status: string;
  job_status: JobStatus;
  broadcast_sent: boolean;
  message: string;
};
type JobMediaAttachResponse = {
  job_id: string;
  photo_urls: string[];
  media: {
    bucket_id: "job-media";
    object_path: string;
    storage_ref: string;
    stage: "before" | "after" | "kael_reference" | "cancellation_evidence" | "scope_change_evidence" | "access_check_in";
  }[];
};
type JobMessageResponse = {
  id: string;
  job_id: string;
  sender_id: string | null;
  sender_role: MessageSender;
  content: string;
  is_read: boolean;
  created_at: string;
};
type JobMessageListResponse = {
  job_id: string;
  messages: JobMessageResponse[];
};
type JobMessageSendResponse = {
  message: JobMessageResponse;
};
type CustomerScopeDecisionResponse = {
  scope_change_id: string;
  job_id: string;
  status: ScopeChangeStatus;
  decided_at: string;
};
type NotificationListResponse = {
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
type NotificationReadResponse = {
  notification_id: string;
  status: "read";
  read_at: string;
};
type DevicePushTokenResponse = {
  token_id: string;
  enabled: boolean;
  updated_at: string;
};
type BroadcastListResponse = {
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
type WorkerJobListResponse = {
  jobs: {
    id: string;
    status: JobStatus;
    service_type: ServiceType;
    problem_summary: string | null;
    address_building: string | null;
    address_unit: string | null;
    address_floor: string | null;
    district: string | null;
    address_access: AddressAccessView;
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
type EarningsResponse = {
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
type WorkerProfileResponse = {
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
type JobDetailResponse = {
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
    address_access: AddressAccessView;
    scheduled_at: string | null;
    kael_problem_identified: string | null;
    kael_complexity: ComplexityLevel | null;
    kael_price_min: number | null;
    kael_price_max: number | null;
    kael_advisory: string | null;
    kael_estimate_card_v3: Record<string, unknown> | null;
    kael_worker_brief_core: Record<string, unknown> | null;
    kael_worker_brief_guidance: Record<string, unknown> | null;
    kael_progress: KaelChatProgressResponse["progress"];
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
    kael_progress: KaelChatProgressResponse["progress"];
    evidence_photo_urls: string[];
    created_at: string | null;
  } | null;
};

// X4 (Plan.md §27.7 — 2026-05-29): F-17 customer active-job hydration.
type CustomerActiveJobResponse = {
  active_job: JobDetailResponse | null;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};
const MAX_JSON_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
};

export type MobileApiAuthResult =
  | {
    success: true;
    user: { id: string; email?: string };
    role: UserRole;
    supabase: unknown;
    requestUrl?: string;
    requestHost?: string;
    requestProjectRef?: string;
  }
  | {
    success: false;
    error: string;
    status: 401 | 403;
  };

export type MobileApiContext = Extract<MobileApiAuthResult, { success: true }>;

type WorkerStatusUpdate = Extract<
  JobStatus,
  | "worker_on_way"
  | "arrived"
  | "inspecting"
  | "repairing"
  | "completed_by_worker"
>;

export type WorkerStatusUpdateInput = {
  status: WorkerStatusUpdate;
  completion_notes?: string;
  completion_photo_urls?: string[];
  access_check_in?: {
    mode: "geofence" | "manual_photo";
    lat?: number;
    lng?: number;
    accuracy_m?: number;
    photo_urls?: string[];
    note?: string;
    checked_in_at?: string;
  };
};

export type PlacesAutocompleteResponse = {
  suggestions: Array<{
    place_id: string;
    label: string;
    main_text: string;
    secondary_text: string | null;
  }>;
  fallback_used: boolean;
};

export type KaelMemorySelfViewResponse = {
  subject_type: "customer" | "worker";
  memory: Record<string, unknown> | null;
};

export type KaelMemoryDeleteResponse = {
  subject_type: "customer" | "worker";
  deleted: true;
};

export type MobileApiServices = {
  getKaelCharter(): Promise<KaelPublicCharterResponse> | KaelPublicCharterResponse;
  listServices(ctx: MobileApiContext): Promise<ServiceCatalogResponse>;
  placesAutocomplete(
    ctx: MobileApiContext,
    input: PlacesAutocompleteInput,
  ): Promise<PlacesAutocompleteResponse>;
  createJob(
    ctx: MobileApiContext,
    input: JobCreateInput,
  ): Promise<CreateJobResponse>;
  getJob(ctx: MobileApiContext, jobId: string): Promise<JobDetailResponse>;
  listCustomerActiveJobs(
    ctx: MobileApiContext,
  ): Promise<CustomerActiveJobResponse>;
  createKaelChat(
    ctx: MobileApiContext,
    input: KaelChatCreateInput,
  ): Promise<KaelChatResponse>;
  getKaelChat(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<KaelChatResponse>;
  getKaelChatProgress(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<KaelChatProgressResponse>;
  streamKaelChatTurn(
    ctx: MobileApiContext,
    sessionId: string,
    input: KaelChatTurnInput,
  ): Promise<Response> | Response;
  sendKaelChatTurn(
    ctx: MobileApiContext,
    sessionId: string,
    input: KaelChatTurnInput,
  ): Promise<KaelChatResponse>;
  confirmKaelChat(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<ConfirmSearchResponse & { session_id: string }>;
  confirmSearch(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<ConfirmSearchResponse>;
  cancelJob(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<{ job_id: string; status: JobStatus }>;
  acceptBroadcast(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<AcceptBroadcastResponse>;
  declineBroadcast(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<DeclineBroadcastResponse>;
  updateJobStatus(
    ctx: MobileApiContext,
    jobId: string,
    input: WorkerStatusUpdateInput,
  ): Promise<StatusUpdateResponse>;
  authorizeApartmentAccess(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<{
    job_id: string;
    release_stage: string;
    already_authorized: boolean;
  }>;
  requestScopeChange(
    ctx: MobileApiContext,
    jobId: string,
    input: WorkerScopeChangeInput,
  ): Promise<WorkerScopeChangeResponse>;
  askKaelForWorker(
    ctx: MobileApiContext,
    jobId: string,
    input: KaelWorkerClarifyInput,
  ): Promise<WorkerKaelClarifyResponse>;
  createWorkerKaelChat(
    ctx: MobileApiContext,
    input: WorkerKaelChatCreateInput,
  ): Promise<WorkerKaelChatResponse>;
  listWorkerKaelChats(ctx: MobileApiContext): Promise<WorkerKaelChatListResponse>;
  getWorkerKaelChat(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<WorkerKaelChatResponse>;
  sendWorkerKaelChatTurn(
    ctx: MobileApiContext,
    sessionId: string,
    input: WorkerKaelChatTurnInput,
  ): Promise<WorkerKaelChatResponse>;
  streamWorkerKaelChatTurn(
    ctx: MobileApiContext,
    sessionId: string,
    input: WorkerKaelChatTurnInput,
  ): Promise<Response> | Response;
  submitWorkerKaelFeedback(
    ctx: MobileApiContext,
    input: WorkerKaelFeedbackInput,
  ): Promise<WorkerKaelFeedbackResponse>;
  getWorkerKaelTrainingConsent(
    ctx: MobileApiContext,
  ): Promise<WorkerKaelTrainingConsentResponse>;
  setWorkerKaelTrainingConsent(
    ctx: MobileApiContext,
    input: WorkerKaelTrainingConsentInput,
  ): Promise<WorkerKaelTrainingConsentResponse>;
  requestWorkerCancellation(
    ctx: MobileApiContext,
    jobId: string,
    input: WorkerCancellationRequestInput,
  ): Promise<WorkerCancellationResponse>;
  requestCustomerCancellation(
    ctx: MobileApiContext,
    jobId: string,
    input: CustomerCancellationRequestInput,
  ): Promise<CustomerCancellationResponse>;
  openDispute(
    ctx: MobileApiContext,
    jobId: string,
    input: DisputeOpenRequestInput,
  ): Promise<DisputeOpenResponse>;
  submitDisputeCounterStatement(
    ctx: MobileApiContext,
    disputeId: string,
    input: DisputeCounterStatementInput,
  ): Promise<DisputeCounterStatementResponse>;
  decideDispute(
    ctx: MobileApiContext,
    disputeId: string,
    input: DisputeAdminDecisionInput,
  ): Promise<DisputeAdminDecisionResponse>;
  attachJobMedia(
    ctx: MobileApiContext,
    jobId: string,
    input: JobMediaAttachInput,
  ): Promise<JobMediaAttachResponse>;
  listJobMessages(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<JobMessageListResponse>;
  sendJobMessage(
    ctx: MobileApiContext,
    jobId: string,
    input: JobMessageSendInput,
  ): Promise<JobMessageSendResponse>;
  decideWorkerCancellation(
    ctx: MobileApiContext,
    cancellationId: string,
    input: WorkerCancellationDecisionInput,
  ): Promise<WorkerCancellationDecisionResponse>;
  decideScopeChange(
    ctx: MobileApiContext,
    scopeChangeId: string,
    input: CustomerScopeDecisionInput,
  ): Promise<CustomerScopeDecisionResponse>;
  confirmCompletion(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<ConfirmCompletionResponse>;
  submitReview(
    ctx: MobileApiContext,
    jobId: string,
    input: Omit<ReviewInput, "job_id">,
  ): Promise<ReviewResponse>;
  submitCustomerKaelFeedback(
    ctx: MobileApiContext,
    input: CustomerKaelFeedbackInput,
  ): Promise<CustomerKaelFeedbackResponse>;
  registerWorker(
    ctx: MobileApiContext,
    input: WorkerRegisterInput,
  ): Promise<WorkerRegisterResponse>;
  getMyKaelMemory(ctx: MobileApiContext): Promise<KaelMemorySelfViewResponse>;
  getWorkerKaelMemory(ctx: MobileApiContext): Promise<KaelMemorySelfViewResponse>;
  deleteMyKaelMemory(ctx: MobileApiContext): Promise<KaelMemoryDeleteResponse>;
  getWorkerProfile(ctx: MobileApiContext): Promise<WorkerProfileResponse>;
  updateWorkerAvailability(
    ctx: MobileApiContext,
    input: AvailabilityToggleInput,
  ): Promise<AvailabilityToggleResponse>;
  listWorkerBroadcasts(ctx: MobileApiContext): Promise<BroadcastListResponse>;
  listWorkerJobs(ctx: MobileApiContext): Promise<WorkerJobListResponse>;
  getWorkerEarnings(
    ctx: MobileApiContext,
    range: { from?: string; to?: string },
  ): Promise<EarningsResponse>;
  invalidateMarketCache(
    ctx: MobileApiContext,
    input: MarketCacheInvalidateInput,
  ): Promise<MarketCacheInvalidateResponse>;
  evaluatePriceSynthesisAbCase(
    ctx: MobileApiContext,
    input: PriceSynthesisAbCaseInput,
  ): Promise<PriceSynthesisAbEvaluation>;
  processKaelLearningQueue(
    ctx: MobileApiContext,
    input: KaelLearningQueueProcessInput,
  ): Promise<KaelLearningQueueProcessResponse>;
  processKaelBatchResults(
    ctx: MobileApiContext,
    input: KaelBatchResultsProcessInput,
  ): Promise<KaelBatchResultsProcessResponse>;
  monitorKaelLearningRules(
    ctx: MobileApiContext,
    input: KaelLearningMonitorInput,
  ): Promise<KaelLearningMonitorResponse>;
  listKaelLearningCandidates(
    ctx: MobileApiContext,
    input: KaelLearningCandidateListInput,
  ): Promise<KaelLearningCandidateListResponse>;
  approveKaelLearningCandidate(
    ctx: MobileApiContext,
    candidateId: string,
    input: KaelLearningCandidateReviewInput,
  ): Promise<KaelLearningCandidateApproveResponse>;
  rejectKaelLearningCandidate(
    ctx: MobileApiContext,
    candidateId: string,
    input: KaelLearningCandidateReviewInput,
  ): Promise<KaelLearningCandidateRejectResponse>;
  listNotifications(ctx: MobileApiContext): Promise<NotificationListResponse>;
  markNotificationRead(
    ctx: MobileApiContext,
    notificationId: string,
  ): Promise<NotificationReadResponse>;
  registerDevicePushToken(
    ctx: MobileApiContext,
    input: DevicePushTokenInput,
  ): Promise<DevicePushTokenResponse>;
};

export type MobileApiHandlerDeps = {
  authenticate(
    request: Request,
    allowedRoles?: UserRole[],
  ): Promise<MobileApiAuthResult>;
  services: MobileApiServices;
};

class ApiFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function apiFailure(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): never {
  throw new ApiFailure(code, message, status, extra);
}

export function createMobileApiHandler(deps: MobileApiHandlerDeps) {
  return async function handleMobileApi(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      const route = matchRoute(request);
      if (!route) return jsonError("NOT_FOUND", "Không tìm thấy endpoint", 404);

      if (isPublicRoute(route)) {
        const data = await dispatchPublicRoute(route, request, deps.services);
        return json(data, 200);
      }

      const auth = await deps.authenticate(request, route.roles);
      if (!auth.success) {
        return jsonError(
          auth.status === 401 ? "AUTH_MISSING" : "AUTH_FORBIDDEN",
          auth.error,
          auth.status,
        );
      }

      const requestContext = requestRuntimeContext(request);
      const ctx: MobileApiContext = { ...auth, ...requestContext };
      const data = await dispatchRoute(route, request, ctx, deps.services);
      if (data instanceof Response) return data;
      return json(
        data,
        ("successStatus" in route ? route.successStatus : undefined) ?? 200,
      );
    } catch (err) {
      if (err instanceof ApiFailure) {
        return jsonError(err.code, err.message, err.status, err.extra);
      }

      console.error("mobile-api unhandled error", {
        code: "UNHANDLED",
        errorName: err instanceof Error ? err.name : typeof err,
      });
      return jsonError(
        "INTERNAL_ERROR",
        "Hệ thống đang bận, vui lòng thử lại",
        500,
      );
    }
  };
}

type PublicRoute = { kind: "kael.charter"; method: "GET"; public: true };

type Route =
  | PublicRoute
  | { kind: "services"; method: "GET"; roles?: UserRole[] }
  | {
    kind: "places.autocomplete";
    method: "POST";
    roles: UserRole[];
  }
  | {
    kind: "jobs.create";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "kael.chat.create";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "kael.chat.get";
    method: "GET";
    sessionId: string;
    roles: UserRole[];
  }
  | {
    kind: "kael.chat.progress";
    method: "GET";
    sessionId: string;
    roles: UserRole[];
  }
  | {
    kind: "kael.chat.stream";
    method: "POST";
    sessionId: string;
    roles: UserRole[];
  }
  | {
    kind: "kael.chat.turn";
    method: "POST";
    sessionId: string;
    roles: UserRole[];
  }
  | {
    kind: "kael.chat.confirm";
    method: "POST";
    sessionId: string;
    roles: UserRole[];
  }
  | { kind: "jobs.get"; method: "GET"; jobId: string; roles?: UserRole[] }
  | {
    kind: "jobs.confirmSearch";
    method: "POST";
    jobId: string;
    roles: UserRole[];
  }
  | { kind: "jobs.cancel"; method: "POST"; jobId: string; roles: UserRole[] }
  | {
    kind: "jobs.customerCancellation";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "jobs.openDispute";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "jobs.accept"; method: "POST"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.decline"; method: "POST"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.status"; method: "PATCH"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.accessAuthorize"; method: "POST"; jobId: string; roles: UserRole[] }
  | {
    kind: "jobs.scopeChange";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "jobs.kaelClarify";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "jobs.workerCancellation";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "jobs.media";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "jobs.messages.list";
    method: "GET";
    jobId: string;
    roles: UserRole[];
  }
  | {
    kind: "jobs.messages.send";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "scope.decide";
    method: "POST";
    scopeChangeId: string;
    roles: UserRole[];
  }
  | {
    kind: "workerCancellation.decide";
    method: "POST";
    cancellationId: string;
    roles: UserRole[];
  }
  | {
    kind: "disputes.counterStatement";
    method: "POST";
    disputeId: string;
    roles: UserRole[];
  }
  | {
    kind: "disputes.adminDecision";
    method: "POST";
    disputeId: string;
    roles: UserRole[];
  }
  | {
    kind: "jobs.confirmCompletion";
    method: "POST";
    jobId: string;
    roles: UserRole[];
  }
  | {
    kind: "jobs.review";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "workers.register";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "me.kaelMemory"; method: "GET"; roles: UserRole[] }
  | { kind: "me.kaelMemory.delete"; method: "DELETE"; roles: UserRole[] }
  | {
    kind: "me.kaelFeedback";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "me.jobs.active"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.me"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.kaelMemory"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.kaelChat.create"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "workers.kaelChat.list"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.kaelChat.get"; method: "GET"; sessionId: string; roles: UserRole[] }
  | { kind: "workers.kaelChat.stream"; method: "POST"; sessionId: string; roles: UserRole[] }
  | { kind: "workers.kaelChat.turn"; method: "POST"; sessionId: string; roles: UserRole[] }
  | { kind: "workers.kaelFeedback"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "workers.kaelTrainingConsent.get"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.kaelTrainingConsent.set"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.availability"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.broadcasts"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.jobs"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.earnings"; method: "GET"; roles: UserRole[] }
  | { kind: "admin.marketCache.invalidate"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelAb.priceSynthesis"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.processQueue"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.processBatchResults"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.monitorRules"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.candidates.list"; method: "GET"; roles: UserRole[] }
  | {
    kind: "admin.kaelLearning.candidates.approve";
    method: "POST";
    candidateId: string;
    roles: UserRole[];
  }
  | {
    kind: "admin.kaelLearning.candidates.reject";
    method: "POST";
    candidateId: string;
    roles: UserRole[];
  }
  | { kind: "notifications"; method: "GET"; roles: UserRole[] }
  | { kind: "notifications.deviceToken"; method: "POST"; roles: UserRole[] }
  | {
    kind: "notifications.read";
    method: "POST";
    notificationId: string;
    roles: UserRole[];
  };

function matchRoute(request: Request): Route | null {
  const path = normalizePath(new URL(request.url).pathname);
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/services") {
    return { kind: "services", method: "GET" };
  }
  if (method === "GET" && path === "/kael/charter") {
    return { kind: "kael.charter", method: "GET", public: true };
  }
  if (method === "POST" && path === "/places/autocomplete") {
    return {
      kind: "places.autocomplete",
      method: "POST",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "POST" && path === "/admin/market-cache/invalidate") {
    return {
      kind: "admin.marketCache.invalidate",
      method: "POST",
      roles: ["admin"],
    };
  }
  if (method === "POST" && path === "/admin/kael-ab/price-synthesis") {
    return {
      kind: "admin.kaelAb.priceSynthesis",
      method: "POST",
      roles: ["admin"],
    };
  }
  if (method === "POST" && path === "/admin/kael-learning/process-queue") {
    return {
      kind: "admin.kaelLearning.processQueue",
      method: "POST",
      roles: ["admin"],
    };
  }
  if (method === "POST" && path === "/admin/kael-learning/process-batch-results") {
    return {
      kind: "admin.kaelLearning.processBatchResults",
      method: "POST",
      roles: ["admin"],
    };
  }
  if (method === "POST" && path === "/admin/kael-learning/monitor-rules") {
    return {
      kind: "admin.kaelLearning.monitorRules",
      method: "POST",
      roles: ["admin"],
    };
  }
  if (
    method === "GET" &&
    (path === "/admin/kael/learning/candidates" ||
      path === "/admin/kael-learning/candidates")
  ) {
    return {
      kind: "admin.kaelLearning.candidates.list",
      method: "GET",
      // S2/F2 (§38): admin-only at the router, matching every other /admin/* route.
      // Service layer keeps its own ctx.role !== "admin" guard as defense-in-depth.
      roles: ["admin"],
    };
  }
  const learningCandidate = path.match(
    /^\/admin\/(?:kael\/learning|kael-learning)\/candidates\/([^/]+)\/(approve|reject)$/,
  );
  if (learningCandidate && method === "POST") {
    const candidateId = safeDecodePathSegment(learningCandidate[1] ?? "");
    const action = learningCandidate[2];
    if (!candidateId) return null;
    return {
      kind: action === "approve"
        ? "admin.kaelLearning.candidates.approve"
        : "admin.kaelLearning.candidates.reject",
      method: "POST",
      candidateId,
      // S2/F2 (§38): admin-only at the router (was customer/worker/admin).
      // Service layer keeps its own ctx.role !== "admin" guard as defense-in-depth.
      roles: ["admin"],
    };
  }
  if (method === "POST" && path === "/jobs") {
    return {
      kind: "jobs.create",
      method: "POST",
      roles: ["customer", "admin"],
      successStatus: 201,
    };
  }
  if (method === "GET" && path === "/me/jobs/active") {
    return { kind: "me.jobs.active", method: "GET", roles: ["customer", "admin"] };
  }
  if (method === "POST" && path === "/me/kael-feedback") {
    return {
      kind: "me.kaelFeedback",
      method: "POST",
      roles: ["customer", "admin"],
      successStatus: 201,
    };
  }
  if (method === "GET" && path === "/me/kael-memory") {
    return { kind: "me.kaelMemory", method: "GET", roles: ["customer", "worker", "admin"] };
  }
  if (method === "DELETE" && path === "/me/kael-memory") {
    return {
      kind: "me.kaelMemory.delete",
      method: "DELETE",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "POST" && path === "/kael/chat") {
    return {
      kind: "kael.chat.create",
      method: "POST",
      roles: ["customer", "admin"],
      successStatus: 201,
    };
  }
  const kaelChat = path.match(/^\/kael\/chat\/([^/]+)(?:\/([^/]+))?$/);
  if (kaelChat) {
    const sessionId = safeDecodePathSegment(kaelChat[1] ?? "");
    if (!sessionId) return null;
    const action = kaelChat[2];
    if (!action && method === "GET") {
      return {
        kind: "kael.chat.get",
        method: "GET",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
    if (!action && method === "POST") {
      return {
        kind: "kael.chat.turn",
        method: "POST",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
    if (action === "progress" && method === "GET") {
      return {
        kind: "kael.chat.progress",
        method: "GET",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
    if (action === "stream" && method === "POST") {
      return {
        kind: "kael.chat.stream",
        method: "POST",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
    if (action === "confirm" && method === "POST") {
      return {
        kind: "kael.chat.confirm",
        method: "POST",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
  }
  if (method === "GET" && path === "/notifications") {
    return {
      kind: "notifications",
      method: "GET",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "POST" && path === "/notifications/device-token") {
    return {
      kind: "notifications.deviceToken",
      method: "POST",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "POST" && path === "/workers/register") {
    return {
      kind: "workers.register",
      method: "POST",
      roles: ["worker"],
      successStatus: 201,
    };
  }
  if (method === "GET" && path === "/workers/me") {
    return { kind: "workers.me", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/kael-memory") {
    return { kind: "workers.kaelMemory", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/kael/chat") {
    return { kind: "workers.kaelChat.list", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "POST" && path === "/workers/me/kael-feedback") {
    return {
      kind: "workers.kaelFeedback",
      method: "POST",
      roles: ["worker", "admin"],
      successStatus: 201,
    };
  }
  if (method === "GET" && path === "/workers/me/kael-training-consent") {
    return { kind: "workers.kaelTrainingConsent.get", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "PATCH" && path === "/workers/me/kael-training-consent") {
    return { kind: "workers.kaelTrainingConsent.set", method: "PATCH", roles: ["worker", "admin"] };
  }
  if (method === "POST" && path === "/workers/me/kael/chat") {
    return {
      kind: "workers.kaelChat.create",
      method: "POST",
      roles: ["worker", "admin"],
      successStatus: 201,
    };
  }
  const workerKaelChatStream = path.match(/^\/workers\/me\/kael\/chat\/([^/]+)\/stream$/);
  if (workerKaelChatStream) {
    const sessionId = safeDecodePathSegment(workerKaelChatStream[1] ?? "");
    if (!sessionId) return null;
    return {
      kind: "workers.kaelChat.stream",
      method: "POST",
      sessionId,
      roles: ["worker", "admin"],
    };
  }
  const workerKaelChat = path.match(/^\/workers\/me\/kael\/chat\/([^/]+)$/);
  if (workerKaelChat) {
    const sessionId = safeDecodePathSegment(workerKaelChat[1] ?? "");
    if (!sessionId) return null;
    if (method === "GET") {
      return {
        kind: "workers.kaelChat.get",
        method: "GET",
        sessionId,
        roles: ["worker", "admin"],
      };
    }
    if (method === "POST") {
      return {
        kind: "workers.kaelChat.turn",
        method: "POST",
        sessionId,
        roles: ["worker", "admin"],
      };
    }
  }
  if (method === "PATCH" && path === "/workers/me/availability") {
    return { kind: "workers.availability", method: "PATCH", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/broadcasts") {
    return { kind: "workers.broadcasts", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/jobs") {
    return { kind: "workers.jobs", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/earnings") {
    return { kind: "workers.earnings", method: "GET", roles: ["worker", "admin"] };
  }

  const accessAuthorize = path.match(/^\/jobs\/([^/]+)\/access\/authorize$/);
  if (method === "POST" && accessAuthorize) {
    const accessAuthorizeJobId = safeDecodePathSegment(accessAuthorize[1] ?? "");
    if (!accessAuthorizeJobId) return null;
    return {
      kind: "jobs.accessAuthorize",
      method: "POST",
      jobId: accessAuthorizeJobId,
      roles: ["customer", "admin"],
    };
  }

  const job = path.match(/^\/jobs\/([^/]+)(?:\/([^/]+))?$/);
  if (job) {
    const jobId = safeDecodePathSegment(job[1] ?? "");
    if (!jobId) return null;
    const action = job[2];
    if (!action && method === "GET") {
      return { kind: "jobs.get", method: "GET", jobId };
    }
    if (action === "confirm-search" && method === "POST") {
      return {
        kind: "jobs.confirmSearch",
        method: "POST",
        jobId,
        roles: ["customer", "admin"],
      };
    }
    if (action === "cancel" && method === "POST") {
      return {
        kind: "jobs.cancel",
        method: "POST",
        jobId,
        roles: ["customer", "admin"],
      };
    }
    if (
      action === "customer-cancellation" &&
      method === "POST" &&
      path.endsWith("/customer-cancellation")
    ) {
      return {
        kind: "jobs.customerCancellation",
        method: "POST",
        jobId,
        roles: ["customer", "admin"],
        successStatus: 201,
      };
    }
    if (action === "disputes" && method === "POST" && path.endsWith("/disputes")) {
      return {
        kind: "jobs.openDispute",
        method: "POST",
        jobId,
        roles: ["customer", "worker", "admin"],
        successStatus: 201,
      };
    }
    if (action === "accept" && method === "POST") {
      return { kind: "jobs.accept", method: "POST", jobId, roles: ["worker", "admin"] };
    }
    if (action === "decline" && method === "POST") {
      return { kind: "jobs.decline", method: "POST", jobId, roles: ["worker", "admin"] };
    }
    if (action === "status" && method === "PATCH") {
      return { kind: "jobs.status", method: "PATCH", jobId, roles: ["worker", "admin"] };
    }
    if (action === "scope-change" && method === "POST") {
      return {
        kind: "jobs.scopeChange",
        method: "POST",
        jobId,
        roles: ["worker", "admin"],
        successStatus: 201,
      };
    }
    if (action === "kael-clarify" && method === "POST") {
      return {
        kind: "jobs.kaelClarify",
        method: "POST",
        jobId,
        roles: ["worker", "admin"],
        successStatus: 201,
      };
    }
    if (action === "worker-cancellation" && method === "POST") {
      return {
        kind: "jobs.workerCancellation",
        method: "POST",
        jobId,
        roles: ["worker", "admin"],
        successStatus: 201,
      };
    }
    if (action === "media" && method === "POST") {
      return {
        kind: "jobs.media",
        method: "POST",
        jobId,
        roles: ["customer", "worker", "admin"],
        successStatus: 201,
      };
    }
    if (action === "messages" && method === "GET") {
      return {
        kind: "jobs.messages.list",
        method: "GET",
        jobId,
        roles: ["customer", "worker", "admin"],
      };
    }
    if (action === "messages" && method === "POST") {
      return {
        kind: "jobs.messages.send",
        method: "POST",
        jobId,
        roles: ["customer", "worker"],
        successStatus: 201,
      };
    }
    if (action === "confirm-completion" && method === "POST") {
      return {
        kind: "jobs.confirmCompletion",
        method: "POST",
        jobId,
        roles: ["customer", "admin"],
      };
    }
    if (action === "review" && method === "POST") {
      return {
        kind: "jobs.review",
        method: "POST",
        jobId,
        roles: ["customer", "admin"],
        successStatus: 201,
      };
    }
  }

  const scope = path.match(/^\/scope-changes\/([^/]+)\/decide$/);
  if (scope && method === "POST") {
    const scopeChangeId = safeDecodePathSegment(scope[1] ?? "");
    if (!scopeChangeId) return null;
    return {
      kind: "scope.decide",
      method: "POST",
      scopeChangeId,
      roles: ["customer", "admin"],
    };
  }

  const workerCancellation = path.match(
    /^\/worker-cancellations\/([^/]+)\/decide$/,
  );
  if (workerCancellation && method === "POST") {
    const cancellationId = safeDecodePathSegment(workerCancellation[1] ?? "");
    if (!cancellationId) return null;
    return {
      kind: "workerCancellation.decide",
      method: "POST",
      cancellationId,
      roles: ["admin"],
    };
  }

  const dispute = path.match(/^\/disputes\/([^/]+)\/([^/]+)$/);
  if (dispute && method === "POST") {
    const disputeId = safeDecodePathSegment(dispute[1] ?? "");
    const action = dispute[2];
    if (!disputeId) return null;
    if (action === "counter-statement") {
      return {
        kind: "disputes.counterStatement",
        method: "POST",
        disputeId,
        roles: ["customer", "worker", "admin"],
      };
    }
    if (action === "admin-decision") {
      return {
        kind: "disputes.adminDecision",
        method: "POST",
        disputeId,
        roles: ["admin"],
      };
    }
  }

  const notification = path.match(/^\/notifications\/([^/]+)\/read$/);
  if (notification && method === "POST") {
    const notificationId = safeDecodePathSegment(notification[1] ?? "");
    if (!notificationId) return null;
    return {
      kind: "notifications.read",
      method: "POST",
      notificationId,
      roles: ["customer", "worker", "admin"],
    };
  }

  return null;
}

function requestRuntimeContext(request: Request): Pick<
  MobileApiContext,
  "requestUrl" | "requestHost" | "requestProjectRef"
> {
  const parsed = safeRequestUrl(request.url);
  const host = request.headers.get("host") ??
    request.headers.get("x-forwarded-host") ??
    parsed?.host;
  return {
    requestUrl: request.url,
    requestHost: host ?? undefined,
    requestProjectRef: request.headers.get("sb-project-ref") ??
      request.headers.get("x-supabase-project-ref") ??
      projectRefFromHost(host) ??
      projectRefFromHost(parsed?.host),
  };
}

function safeRequestUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function projectRefFromHost(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const hostname = value.split(":")[0] ?? value;
  const [projectRef, ...rest] = hostname.split(".");
  return rest.join(".").endsWith("supabase.co") && projectRef
    ? projectRef
    : undefined;
}

function isPublicRoute(route: Route): route is PublicRoute {
  return "public" in route && route.public === true;
}

function safeDecodePathSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

async function dispatchRoute(
  route: Route,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "services":
      return services.listServices(ctx);
    case "places.autocomplete": {
      const input = placesAutocompleteSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.placesAutocomplete(ctx, input.data);
    }
    case "admin.marketCache.invalidate":
      return services.invalidateMarketCache(
        ctx,
        marketCacheInvalidateInput(await readJson(request)),
      );
    case "admin.kaelAb.priceSynthesis": {
      const input = priceSynthesisAbCaseSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Du lieu A/B khong hop le", 400);
      return services.evaluatePriceSynthesisAbCase(ctx, input.data);
    }
    case "admin.kaelLearning.processQueue":
      return services.processKaelLearningQueue(
        ctx,
        kaelLearningQueueProcessInput(await readJson(request)),
      );
    case "admin.kaelLearning.processBatchResults":
      return services.processKaelBatchResults(
        ctx,
        kaelBatchResultsProcessInput(await readJson(request)),
      );
    case "admin.kaelLearning.monitorRules":
      return services.monitorKaelLearningRules(
        ctx,
        kaelLearningMonitorInput(await readJson(request)),
      );
    case "admin.kaelLearning.candidates.list":
      return services.listKaelLearningCandidates(
        ctx,
        kaelLearningCandidateListInput(new URL(request.url)),
      );
    case "admin.kaelLearning.candidates.approve":
      return services.approveKaelLearningCandidate(
        ctx,
        route.candidateId,
        kaelLearningCandidateReviewInput(await readJson(request), "approve"),
      );
    case "admin.kaelLearning.candidates.reject":
      return services.rejectKaelLearningCandidate(
        ctx,
        route.candidateId,
        kaelLearningCandidateReviewInput(await readJson(request), "reject"),
      );
    case "jobs.create": {
      const input = jobCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createJob(ctx, input.data);
    }
    case "kael.chat.create": {
      const input = kaelChatCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createKaelChat(ctx, input.data);
    }
    case "kael.chat.get":
      return services.getKaelChat(ctx, route.sessionId);
    case "kael.chat.progress":
      return services.getKaelChatProgress(ctx, route.sessionId);
    case "kael.chat.stream": {
      const input = kaelChatTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.streamKaelChatTurn(ctx, route.sessionId, input.data);
    }
    case "kael.chat.turn": {
      const input = kaelChatTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.sendKaelChatTurn(ctx, route.sessionId, input.data);
    }
    case "kael.chat.confirm":
      return services.confirmKaelChat(ctx, route.sessionId);
    case "jobs.get":
      return services.getJob(ctx, route.jobId);
    case "jobs.confirmSearch":
      return services.confirmSearch(ctx, route.jobId);
    case "jobs.cancel":
      return services.cancelJob(ctx, route.jobId);
    case "jobs.customerCancellation": {
      const input = customerCancellationRequestSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.requestCustomerCancellation(ctx, route.jobId, input.data);
    }
    case "jobs.openDispute": {
      const input = disputeOpenRequestSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.openDispute(ctx, route.jobId, input.data);
    }
    case "jobs.accept":
      return services.acceptBroadcast(ctx, route.jobId);
    case "jobs.decline":
      return services.declineBroadcast(ctx, route.jobId);
    case "jobs.status": {
      const input = workerStatusUpdateSchema(await readJson(request));
      return services.updateJobStatus(ctx, route.jobId, input);
    }
    case "jobs.accessAuthorize":
      return services.authorizeApartmentAccess(ctx, route.jobId);
    case "jobs.scopeChange": {
      const input = workerScopeChangeSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.requestScopeChange(ctx, route.jobId, input.data);
    }
    case "jobs.kaelClarify": {
      const input = kaelWorkerClarifySchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.askKaelForWorker(ctx, route.jobId, input.data);
    }
    case "jobs.workerCancellation": {
      const input = workerCancellationRequestSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.requestWorkerCancellation(ctx, route.jobId, input.data);
    }
    case "jobs.media": {
      const input = jobMediaAttachSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.attachJobMedia(ctx, route.jobId, input.data);
    }
    case "jobs.messages.list":
      return services.listJobMessages(ctx, route.jobId);
    case "jobs.messages.send": {
      const input = jobMessageSendSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.sendJobMessage(ctx, route.jobId, input.data);
    }
    case "scope.decide": {
      const input = customerScopeDecisionSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.decideScopeChange(ctx, route.scopeChangeId, input.data);
    }
    case "workerCancellation.decide": {
      const input = workerCancellationDecisionSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.decideWorkerCancellation(
        ctx,
        route.cancellationId,
        input.data,
      );
    }
    case "disputes.counterStatement": {
      const input = disputeCounterStatementSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitDisputeCounterStatement(
        ctx,
        route.disputeId,
        input.data,
      );
    }
    case "disputes.adminDecision": {
      const input = disputeAdminDecisionSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.decideDispute(ctx, route.disputeId, input.data);
    }
    case "jobs.confirmCompletion":
      return services.confirmCompletion(ctx, route.jobId);
    case "jobs.review": {
      const body = await readJson(request);
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      }
      const input = reviewSchema.safeParse({ ...body, job_id: route.jobId });
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitReview(ctx, route.jobId, {
        rating: input.data.rating,
        tags: input.data.tags,
        comment: input.data.comment,
      });
    }
    case "me.jobs.active":
      return services.listCustomerActiveJobs(ctx);
    case "me.kaelFeedback": {
      const input = customerKaelFeedbackSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitCustomerKaelFeedback(ctx, input.data);
    }
    case "me.kaelMemory":
      return services.getMyKaelMemory(ctx);
    case "me.kaelMemory.delete":
      return services.deleteMyKaelMemory(ctx);
    case "workers.register": {
      const input = workerRegisterSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.registerWorker(ctx, input.data);
    }
    case "workers.me":
      return services.getWorkerProfile(ctx);
    case "workers.kaelMemory":
      return services.getWorkerKaelMemory(ctx);
    case "workers.kaelChat.create": {
      const input = workerKaelChatCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createWorkerKaelChat(ctx, input.data);
    }
    case "workers.kaelChat.list":
      return services.listWorkerKaelChats(ctx);
    case "workers.kaelChat.get":
      return services.getWorkerKaelChat(ctx, route.sessionId);
    case "workers.kaelChat.stream": {
      const input = workerKaelChatTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.streamWorkerKaelChatTurn(ctx, route.sessionId, input.data);
    }
    case "workers.kaelChat.turn": {
      const input = workerKaelChatTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.sendWorkerKaelChatTurn(ctx, route.sessionId, input.data);
    }
    case "workers.kaelFeedback": {
      const input = workerKaelFeedbackSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitWorkerKaelFeedback(ctx, input.data);
    }
    case "workers.kaelTrainingConsent.get":
      return services.getWorkerKaelTrainingConsent(ctx);
    case "workers.kaelTrainingConsent.set": {
      const input = workerKaelTrainingConsentSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.setWorkerKaelTrainingConsent(ctx, input.data);
    }
    case "workers.availability": {
      const input = availabilityToggleSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.updateWorkerAvailability(ctx, input.data);
    }
    case "workers.broadcasts":
      return services.listWorkerBroadcasts(ctx);
    case "workers.jobs":
      return services.listWorkerJobs(ctx);
    case "workers.earnings": {
      const url = new URL(request.url);
      const from = parseIsoParam(url.searchParams.get("from"), "from");
      const to = parseIsoParam(url.searchParams.get("to"), "to");
      if (from && to && from > to) {
        apiFailure("VALIDATION", '"from" phải nhỏ hơn hoặc bằng "to"', 400);
      }
      return services.getWorkerEarnings(ctx, { from, to });
    }
    case "notifications":
      return services.listNotifications(ctx);
    case "notifications.deviceToken": {
      const input = devicePushTokenSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.registerDevicePushToken(ctx, input.data);
    }
    case "notifications.read":
      return services.markNotificationRead(ctx, route.notificationId);
  }
}

async function dispatchPublicRoute(
  route: PublicRoute,
  _request: Request,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "kael.charter":
      return services.getKaelCharter();
  }
}

async function readJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    apiFailure("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn", 413);
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }

  if (new TextEncoder().encode(text).length > MAX_JSON_BODY_BYTES) {
    apiFailure("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn", 413);
  }

  try {
    return JSON.parse(text);
  } catch {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
}

function optionalSafeText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  return trimmed.toLowerCase();
}

function marketCacheInvalidateInput(input: unknown): MarketCacheInvalidateInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  const cacheId = optionalSafeText(record.cache_id, 80);
  const districtCode = optionalSafeText(record.district_code, 80);
  const problemSlug = optionalSafeText(record.problem_slug, 120);
  const serviceType = record.service_type;
  const complexity = record.complexity;

  if (
    serviceType !== undefined &&
    serviceType !== "electrical" &&
    serviceType !== "plumbing" &&
    serviceType !== "cleaning"
  ) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (
    complexity !== undefined &&
    complexity !== "small" &&
    complexity !== "medium" &&
    complexity !== "large"
  ) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (!cacheId && !districtCode && !problemSlug && !serviceType && !complexity) {
    apiFailure("VALIDATION", "Cần ít nhất một bộ lọc cache", 400);
  }

  return {
    ...(cacheId ? { cache_id: cacheId } : {}),
    ...(districtCode ? { district_code: districtCode } : {}),
    ...(problemSlug ? { problem_slug: problemSlug } : {}),
    ...(serviceType ? { service_type: serviceType as ServiceType } : {}),
    ...(complexity ? { complexity: complexity as ComplexityLevel } : {}),
  };
}

function kaelLearningQueueProcessInput(input: unknown): KaelLearningQueueProcessInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  return {
    limit: optionalPositiveInt(record.limit, 1, 100),
    force_realtime: record.force_realtime === true,
  };
}

function kaelBatchResultsProcessInput(input: unknown): KaelBatchResultsProcessInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  return {
    limit: optionalPositiveInt(record.limit, 1, 50),
    force_poll: record.force_poll === true,
  };
}

function kaelLearningMonitorInput(input: unknown): KaelLearningMonitorInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  return {
    limit: optionalPositiveInt(record.limit, 1, 100),
  };
}

function kaelLearningCandidateListInput(url: URL): KaelLearningCandidateListInput {
  const state = learningCandidateStatusParam(url.searchParams.get("state")) ??
    "manual_review";
  return {
    state,
    limit: optionalPositiveInt(url.searchParams.get("limit"), 1, 100),
  };
}

function learningCandidateStatusParam(
  value: string | null,
): LearningCandidateStatus | null {
  if (value === null || value === "") return null;
  const normalized = value.trim().toLowerCase();
  return LEARNING_CANDIDATE_STATUSES.includes(normalized as LearningCandidateStatus)
    ? normalized as LearningCandidateStatus
    : apiFailure("VALIDATION", "Dữ liệu ứng viên learning không hợp lệ", 400);
}

function kaelLearningCandidateReviewInput(
  input: unknown,
  action: "approve" | "reject",
): KaelLearningCandidateReviewInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu review learning không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  if (action === "approve") {
    return {
      review_note: optionalBoundedText(record.review_note, 1000),
    };
  }
  return {
    reason: requiredBoundedText(record.reason, 200),
  };
}

function optionalBoundedText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    apiFailure("VALIDATION", "Dữ liệu review learning không hợp lệ", 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    apiFailure("VALIDATION", "Dữ liệu review learning không hợp lệ", 400);
  }
  return trimmed || undefined;
}

function requiredBoundedText(value: unknown, maxLength: number): string {
  const text = optionalBoundedText(value, maxLength);
  if (!text) apiFailure("VALIDATION", "Dữ liệu review learning không hợp lệ", 400);
  return text;
}

function optionalPositiveInt(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  return number;
}

function workerStatusUpdateSchema(input: unknown): WorkerStatusUpdateInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  const status = record.status;
  const allowed = [
    "worker_on_way",
    "arrived",
    "inspecting",
    "repairing",
    "completed_by_worker",
  ];
  if (typeof status !== "string" || !allowed.includes(status)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  // Phase 2.0 (2026-05-23): worker không nhập final_price ở B7. Reject nếu
  // worker bundle field này trong payload — Kael giữ final-price authority.
  if (record.final_price !== undefined) {
    apiFailure(
      "VALIDATION",
      "Giá cuối do Kael xác định, thợ không được nhập",
      400,
    );
  }

  const result: WorkerStatusUpdateInput = {
    status: status as WorkerStatusUpdate,
  };
  if (typeof record.completion_notes === "string") {
    if (record.completion_notes.length > 2000) {
      apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
    }
    result.completion_notes = record.completion_notes.slice(0, 2000);
  } else if (record.completion_notes !== undefined) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (Array.isArray(record.completion_photo_urls)) {
    const urls = record.completion_photo_urls;
    if (urls.length > 10 || urls.some((value) => !isCompletionPhotoRef(value))) {
      apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
    }
    result.completion_photo_urls = urls;
  } else if (record.completion_photo_urls !== undefined) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (record.access_check_in !== undefined) {
    result.access_check_in = parseWorkerAccessCheckIn(record.access_check_in);
  }
  if (status === "completed_by_worker") {
    const note = result.completion_notes?.trim() ?? "";
    if (note.length < 5) {
      apiFailure(
        "VALIDATION",
        "Cần ghi chú hoàn tất trước khi báo hoàn tất",
        400,
      );
    }
  }
  return result;
}

function parseWorkerAccessCheckIn(
  value: unknown,
): NonNullable<WorkerStatusUpdateInput["access_check_in"]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  const record = value as Record<string, unknown>;
  const mode = record.mode;
  if (mode !== "geofence" && mode !== "manual_photo") {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }

  let photoUrls: string[] | undefined;
  if (record.photo_urls !== undefined) {
    const rawPhotoUrls = record.photo_urls;
    if (!Array.isArray(rawPhotoUrls)) {
      apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
    }
    if (
      rawPhotoUrls.length > 5 ||
      rawPhotoUrls.some((item) => !isAccessCheckInPhotoRef(item))
    ) {
      apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
    }
    photoUrls = rawPhotoUrls as string[];
  }

  const lat = optionalBoundedNumber(record.lat, -90, 90);
  const lng = optionalBoundedNumber(record.lng, -180, 180);
  const accuracy = optionalBoundedNumber(record.accuracy_m, 0, 5000);
  const note = optionalText(record.note, 300);
  const checkedInAt = optionalIsoString(record.checked_in_at);
  if (mode === "geofence" && (lat === undefined || lng === undefined)) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  if (mode === "manual_photo" && (!photoUrls || photoUrls.length === 0)) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }

  return {
    mode,
    ...(lat === undefined ? {} : { lat }),
    ...(lng === undefined ? {} : { lng }),
    ...(accuracy === undefined ? {} : { accuracy_m: accuracy }),
    ...(photoUrls && photoUrls.length > 0 ? { photo_urls: photoUrls } : {}),
    ...(note === undefined ? {} : { note }),
    ...(checkedInAt === undefined ? {} : { checked_in_at: checkedInAt }),
  };
}

function optionalBoundedNumber(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  return value;
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > maxLength) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  return value.trim() || undefined;
}

function optionalIsoString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  return new Date(parsed).toISOString();
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isCompletionPhotoRef(value: unknown): value is string {
  return isHttpUrl(value) || isSupabaseJobMediaStageRef(value, "after");
}

// §32.7 (Codex review PR #66): the check-in gates the customer unit-release handshake,
// so its refs MUST be uploads into the controlled access_check_in stage — no arbitrary
// http(s) URLs and no completion-stage refs. (The completion validator keeps its legacy
// http acceptance; this new flow has no legacy to honor.)
function isAccessCheckInPhotoRef(value: unknown): value is string {
  return isSupabaseJobMediaStageRef(value, "access_check_in");
}

function isSupabaseJobMediaStageRef(value: unknown, stage: string): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const pathParts = url.pathname.split("/").filter(Boolean);
    return url.protocol === "supabase:" &&
      url.hostname === "job-media" &&
      pathParts.length >= 3 &&
      pathParts[1] === stage &&
      !pathParts.some((part) => part === "." || part === "..");
  } catch {
    return false;
  }
}

function parseIsoParam(value: string | null, name: string): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    apiFailure(
      "VALIDATION",
      `Tham số "${name}" không phải định dạng ISO hợp lệ`,
      400,
    );
  }
  return new Date(parsed).toISOString();
}

function normalizePath(pathname: string): string {
  const withoutFunctionsPrefix = pathname.replace(
    /^\/functions\/v1\/mobile-api(?=\/|$)/,
    "",
  );
  const withoutFunctionPrefix = withoutFunctionsPrefix.replace(
    /^\/mobile-api(?=\/|$)/,
    "",
  );
  const clean = withoutFunctionPrefix || "/";
  return clean.endsWith("/") && clean.length > 1 ? clean.slice(0, -1) : clean;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function jsonError(
  code: string,
  error: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return json({ code, error, ...(extra ?? {}) }, status);
}
