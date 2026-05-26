import {
  type AvailabilityToggleInput,
  availabilityToggleSchema,
  type CustomerCancellationRequestInput,
  customerCancellationRequestSchema,
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
} from "../../_shared/domain.ts";
import type {
  BroadcastStatus,
  ComplexityLevel,
  JobStatus,
  MessageSender,
  ScopeChangeStatus,
  ServiceType,
  UserRole,
  WorkerVerificationStatus,
} from "../../_shared/domain.ts";
import type { KaelPublicCharterResponse } from "./kael/system-prompt.ts";

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
  fallback_used: boolean;
};
type KaelChatStatus = "active" | "estimate_ready" | "confirmed" | "abandoned";
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
type AcceptBroadcastResponse = {
  job_id: string;
  status: JobStatus;
  full_address: {
    building: string | null;
    unit: string | null;
    floor: string | null;
    district: string | null;
  };
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
    stage: "before" | "after" | "kael_reference" | "cancellation_evidence" | "scope_change_evidence";
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
    final_price: number | null;
    estimated_earning: number | null;
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
    scheduled_at: string | null;
    kael_problem_identified: string | null;
    kael_complexity: ComplexityLevel | null;
    kael_price_min: number | null;
    kael_price_max: number | null;
    kael_advisory: string | null;
    kael_estimate_card_v3: Record<string, unknown> | null;
    kael_worker_brief_core: Record<string, unknown> | null;
    kael_worker_brief_guidance: Record<string, unknown> | null;
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
    evidence_photo_urls: string[];
    created_at: string | null;
  } | null;
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
  createKaelChat(
    ctx: MobileApiContext,
    input: KaelChatCreateInput,
  ): Promise<KaelChatResponse>;
  getKaelChat(
    ctx: MobileApiContext,
    sessionId: string,
  ): Promise<KaelChatResponse>;
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

      const data = await dispatchRoute(route, request, auth, deps.services);
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
  | { kind: "workers.me"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.kaelMemory"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.availability"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.broadcasts"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.jobs"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.earnings"; method: "GET"; roles: UserRole[] }
  | { kind: "admin.marketCache.invalidate"; method: "POST"; roles: UserRole[] }
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
  if (method === "POST" && path === "/jobs") {
    return {
      kind: "jobs.create",
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
    apiFailure("VALIDATION", "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡", 400);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    apiFailure("VALIDATION", "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡", 400);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    apiFailure("VALIDATION", "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡", 400);
  }
  return trimmed.toLowerCase();
}

function marketCacheInvalidateInput(input: unknown): MarketCacheInvalidateInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡", 400);
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
    apiFailure("VALIDATION", "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡", 400);
  }
  if (
    complexity !== undefined &&
    complexity !== "small" &&
    complexity !== "medium" &&
    complexity !== "large"
  ) {
    apiFailure("VALIDATION", "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡", 400);
  }
  if (!cacheId && !districtCode && !problemSlug && !serviceType && !complexity) {
    apiFailure("VALIDATION", "Cáº§n Ã­t nháº¥t má»™t bá»™ lá»c cache", 400);
  }

  return {
    ...(cacheId ? { cache_id: cacheId } : {}),
    ...(districtCode ? { district_code: districtCode } : {}),
    ...(problemSlug ? { problem_slug: problemSlug } : {}),
    ...(serviceType ? { service_type: serviceType as ServiceType } : {}),
    ...(complexity ? { complexity: complexity as ComplexityLevel } : {}),
  };
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
    if (urls.length > 10 || urls.some((value) => !isHttpUrl(value))) {
      apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
    }
    result.completion_photo_urls = urls;
  } else if (record.completion_photo_urls !== undefined) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  return result;
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
