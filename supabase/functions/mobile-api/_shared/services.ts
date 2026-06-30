import { createClient } from "@supabase/supabase-js";
import type {
  BroadcastStatus,
  ComplexityLevel,
  JobStatus,
  LearningCandidateStatus,
  MessageSender,
  ScopeChangeStatus,
  ServiceType,
  WorkerVerificationStatus,
} from "../../_shared/domain.ts";
import {
  HCMC_DISTRICTS,
  buildJobDisplayCode,
  buildWorkerDisplayCode,
  kaelChatProgressSchema,
  normalizeDistrict,
  normalizeServiceAreaDistrict,
  PLATFORM_FEE_WORKER,
} from "../../_shared/domain.ts";
import {
  type DevicePushTokenInput,
  type CustomerCancellationRequestInput,
  type CustomerKaelFeedbackInput,
  type CustomerKaelMemoryPreferenceUpdateInput,
  type CustomerPaymentMethodSaveInput,
  type DisputeAdminDecisionInput,
  type DisputeCounterStatementInput,
  type DisputeOpenRequestInput,
  type ApartmentAccessProfileInput,
  type JobCreateInput,
  type JobMediaAttachInput,
  type JobMessageSendInput,
  type KaelWorkerClarifyInput,
  type KaelAssistantInput,
  type KaelChatCreateInput,
  type KaelChatMediaUploadInput,
  type KaelChatEvidenceInput,
  type KaelChatTurnInput,
  type WorkerKaelChatCreateInput,
  type WorkerKaelChatTurnInput,
  type WorkerKaelFeedbackInput,
  type WorkerKaelMemoryPreferenceUpdateInput,
  type WorkerKaelTrainingConsentInput,
  type PlacesAutocompleteInput,
  type PlacesResolveInput,
  sanitizeForLLM,
  type WorkerApplicationSubmitInput,
  type WorkerCancellationDecisionInput,
  type WorkerCancellationRequestInput,
  type WorkerRegisterInput,
  type WorkerServiceAreaUpdateInput,
} from "../../_shared/domain.ts";
import {
  apiFailure,
  type KaelBatchResultsProcessInput,
  type KaelBatchResultsProcessResponse,
  type KaelLearningMonitorInput,
  type KaelLearningMonitorResponse,
  type KaelLearningCandidateApproveResponse,
  type KaelLearningCandidateListInput,
  type KaelLearningCandidateListResponse,
  type KaelLearningCandidateRejectResponse,
  type KaelLearningCandidateReviewInput,
  type KaelLearningCandidateSummary,
  type KaelLearningQueueProcessInput,
  type KaelLearningQueueProcessResponse,
  type MarketCacheInvalidateInput,
  type MarketCacheInvalidateResponse,
  type MobileApiContext,
  type CustomerPaymentMethodResponse,
  type KaelChatMediaUploadResponse,
  type CustomerProfileInsightsResponse,
  type PlacesAutocompleteResponse,
  type PlacesResolveResponse,
  type MobileApiServices,
  type VietmapStaticMapInput,
  type WorkerPerformanceInsightsResponse,
  type WorkerPayoutMethodResponse,
  type WorkerPayoutMethodSaveInput,
  type WorkerStatusUpdateInput,
} from "./router.ts";
import {
  buildKaelOptimizationMetricRows,
  readKaelOptimizationFlags,
} from "./kael/cost-tracking.ts";
import {
  validateKaelAutonomyTransition,
  validateWorkflowCommand,
  validateWorkflowTransition,
} from "./workflow-orchestrator.ts";
import {
  AI_SESSION_LIMIT,
  checkKaelChatRateLimit,
  checkRateLimit,
} from "./rate-limit.ts";
import { requireJobAccess, type JobAccessRecord } from "./access.ts";
import { sendPushToUser, sendPushToUsers } from "./push.ts";
import {
  computeScopeChangeEstimate,
  type EdgeAiSecrets,
  type PipelineStageLog,
  type PipelineResult,
  PRICE_DISCLAIMER,
  type ScopeChangeKaelEstimate,
  buildEstimateCardOutput,
  buildKaelAutonomyDecision,
  buildScopeChangeOutputs,
  buildWorkerBriefOutput,
  buildKaelMissingInfoArtifactProposal,
  buildDemandingCustomerResponse,
  buildCustomerCancellationPhase0Outcome,
  buildNeutralDisputeSummary,
  buildWorkerCancellationFallbackOptions,
  assertNeutralDisputeLanguage,
  classifyCustomerCancellationReason,
  classifyWorkerCancellationReason,
  customerCancellationAbuseFromSignals,
  detectDemandingCustomerPatterns,
  determineDisputeSubCase,
  recordCustomerCancellationReview,
  recordWorkerCancellationReview,
  runKaelPipeline,
  sanitizeKaelText,
  sanitizeMemoryObject,
  type EstimatePriceSource,
  type KaelAutonomyDecision,
  type KaelPermissionGateRequest,
  type LearningSkillInput,
  type LearningSkillTrigger,
  getPublicKaelCharter,
  NORMAL_TRANSACTION_SILENT_STATUSES,
  processBatchResults,
  processLearningQueue,
  monitorLearningRules,
  queueLearningForBatch,
  queueLearningSkillTriggers,
  recordLearningRuleApplication,
  recordLearningReviewOutcome,
  recordDemandingCustomerInteraction,
  runKaelAutonomyOrchestrator,
  type ScopeChangeRiskConfig,
  updateKaelProgress,
  type WorkerCancellationAbuseSignal,
  type WorkerCancellationExpectedCategory,
  type WorkerCancellationReasonCode,
  type CustomerCancellationAbuseSignal,
  type CustomerCancellationSubCase,
  type DisputeType,
  evaluatePriceSynthesisAbCase as runPriceSynthesisAbCase,
  type PriceSynthesisAbCaseInput,
  type PriceSynthesisAbEvaluation,
  scrubSensitiveForLLM,
  runCustomerAssistant,
  runWorkerAssist,
  type WorkerAssistAnswer,
  KAEL_ROUTING_CONFIG,
} from "./kael/index.ts";
import { evaluateMessageBoundary } from "./kael/boundary-guard.ts";
import {
  auditKaelGuardrailTrip,
  runKaelSelfCheckPipeline,
} from "./kael/self-check.ts";
import {
  createSseResponse,
  encodeSseEvent,
  encodeSseHeartbeat,
} from "./sse.ts";

type DbError = { code?: string; message?: string };
type DbResult<T> = {
  data: T | null;
  error: DbError | null;
  count?: number | null;
};
type QueryLike = PromiseLike<DbResult<unknown>>;
type ConfirmSearchOptions = {
  autonomyDecision?: KaelAutonomyDecision;
};
type PolicyAutonomyGateInput = {
  amountVnd?: number | null;
  authority: KaelPermissionGateRequest;
  client: DbClient;
  ctx: MobileApiContext;
  decision: KaelAutonomyDecision;
  from: JobStatus;
  jobId: string | null;
  knownEvidenceReferences: readonly string[];
  label: string;
  to: JobStatus;
};
type CustomerCancellationPreview = {
  subCase: CustomerCancellationSubCase;
  shouldGateAutonomy: boolean;
  to: JobStatus;
};
type AddressAccessStage = "area_only" | "building_released" | "unit_released";
type AddressAccessEvidenceMode = "none" | "geofence" | "manual_photo";
type AddressParts = {
  building: string | null;
  unit: string | null;
  floor: string | null;
  district: string | null;
};
type AddressAccessView = {
  release_stage: AddressAccessStage;
  exact_unit_released: boolean;
  check_in_required: boolean;
  identity_check_required: boolean;
  customer_handoff_required: boolean;
  evidence_mode: AddressAccessEvidenceMode;
  access_profile: ApartmentAccessProfileInput;
};
type AddressAccessProjection = {
  fullAddress: AddressParts;
  addressAccess: AddressAccessView;
};
type WorkerAccessCheckInInput = NonNullable<
  WorkerStatusUpdateInput["access_check_in"]
>;

export type CustomerProfileInsightJobRow = {
  id: string;
  status: string;
  service_type: string;
  created_at: string | null;
  completed_at: string | null;
  confirmed_at?: string | null;
  paid_at: string | null;
  reviewed_at: string | null;
  final_price: number | null;
  kael_price_min: number | null;
  kael_price_max: number | null;
};
export type CustomerProfileInsightReviewRow = {
  job_id: string | null;
  rating: number | null;
};
export type CustomerProfileInsightDisputeRow = {
  job_id: string | null;
  status: string | null;
};
export type CustomerProfileInsightInput = {
  accountProfile?: {
    created_at: string | null;
  } | null;
  customerId: string;
  customerProfile: {
    building_name: string | null;
    created_at: string | null;
    district: string | null;
    floor: string | null;
    unit_number: string | null;
  } | null;
  disputes: CustomerProfileInsightDisputeRow[];
  jobs: CustomerProfileInsightJobRow[];
  kaelInteractionCount: number;
  reviews: CustomerProfileInsightReviewRow[];
  savedAddressCount: number;
};
export type WorkerPerformanceInsightBroadcastRow = {
  broadcast_at: string | null;
  responded_at: string | null;
  sent_at: string | null;
  status: string;
};
export type WorkerPerformanceInsightJobRow = {
  arrived_at: string | null;
  completed_at: string | null;
  final_price: number | null;
  paid_at: string | null;
  reviewed_at: string | null;
  scheduled_at: string | null;
  status: string;
};
export type WorkerPerformanceInsightReviewRow = {
  rating: number | null;
};
export type WorkerPerformanceInsightInput = {
  broadcasts: WorkerPerformanceInsightBroadcastRow[];
  jobs: WorkerPerformanceInsightJobRow[];
  reviews: WorkerPerformanceInsightReviewRow[];
  workerId: string;
  workerProfile: {
    is_approved: boolean;
    is_available: boolean;
    is_suspended: boolean;
    rating: number;
    total_jobs: number;
    verification_status: string;
  } | null;
};

type JobWorkerSummary = {
  avatar_url: string | null;
  display_code: string;
  full_name: string;
  id: string;
  rating: number;
  review_count: number;
  total_jobs: number;
};

export type DbClient = {
  from(table: string): Chain;
  rpc(name: string, args?: Record<string, unknown>): QueryLike;
  storage?: {
    from(bucket: string): unknown;
  };
};

type EdgeServiceSecrets = EdgeAiSecrets & {
  supabaseUrl?: string;
  supabaseSecretKey?: string;
  sepayWebhookApiKey?: string;
  sepayQrBaseUrl?: string;
};

const ACTIVE_WORKER_JOB_STATUSES: JobStatus[] = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
];

const CUSTOMER_PROFILE_COMPLETED_STATUSES = new Set([
  "completed_by_worker",
  "confirmed_by_customer",
  "payment_pending",
  "paid",
  "reviewed",
]);
const CUSTOMER_PROFILE_TRANSACTION_STATUSES = new Set([
  "confirmed_by_customer",
  "payment_pending",
  "paid",
  "reviewed",
]);
const CUSTOMER_PROFILE_USAGE_RANK_STEP = 200;
const CUSTOMER_PROFILE_USAGE_RANK_MAX = 5;
const WORKER_PERFORMANCE_TOTAL_BROADCAST_STATUSES = new Set([
  "sent",
  "accepted",
  "declined",
  "expired",
  "cancelled",
  "reassigned",
]);
const WORKER_PERFORMANCE_RESPONSE_STATUSES = new Set(["accepted", "declined"]);
const WORKER_PERFORMANCE_COMPLETED_STATUSES = new Set([
  "completed_by_worker",
  "confirmed_by_customer",
  "payment_pending",
  "paid",
  "reviewed",
]);
const WORKER_PERFORMANCE_PAID_STATUSES = new Set(["paid", "reviewed"]);
const WORKER_PERFORMANCE_ON_TIME_GRACE_MS = 5 * 60 * 1000;

const JOB_CHAT_SEND_STATUSES: JobStatus[] = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
  "confirmed_by_customer",
];

const JOB_DETAIL_SELECT =
  "id, display_code, status, service_type, description, problem_chips, photo_urls, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state, scheduled_at, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_advisory, kael_estimate_card_v3, kael_worker_brief_core, kael_worker_brief_guidance, kael_progress, customer_id, worker_id, final_price, payment_provider, payment_status, payment_code, payment_transfer_content, payment_qr_image_url, payment_expires_at, payment_received_at, payment_amount_received, gross_amount, platform_fee, worker_net, completion_notes, completion_photo_urls, created_at, matched_at, arrived_at, completed_at, confirmed_at, paid_at, reviewed_at";
const SEPAY_VIETQR_PROVIDER = "sepay_vietqr" as const;
const SEPAY_QR_BASE_URL = "https://qr.sepay.vn/img";
const SEPAY_PAYMENT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_WORKER_CANDIDATE_POOL_SIZE = 50;
const STAGING_PROJECT_REF = "xyylanuyflrjzbjzhqfl";
const KAEL_CHAT_SOFT_COST_CAP_USD = 0.5;
const KAEL_CHAT_HARD_COST_CAP_USD = 1;
const KAEL_CHAT_STREAM_POLL_MS = 800;
const KAEL_CHAT_STREAM_MAX_MS = 15_000;
const KAEL_CHAT_STREAM_HEARTBEAT_MS = 10_000;
const VIETMAP_AUTOCOMPLETE_URL = "https://maps.vietmap.vn/api/autocomplete/v4";
const VIETMAP_SEARCH_URL = "https://maps.vietmap.vn/api/search/v4";
const VIETMAP_PLACE_URL = "https://maps.vietmap.vn/api/place/v4";
const VIETMAP_STATIC_MAP_URL = "https://maps.vietmap.vn/api/maps/statics/tm";
const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const HCMC_MAP_FOCUS = "10.776889,106.700806";
const VIETMAP_HCMC_CITY_ID = "12";
const MAPS_PROVIDER_TIMEOUT_MS = 5_000;

type MapsGeoSource = "vietmap" | "google_maps";
type GeocodeResult = { lat: number; lng: number; geoSource: MapsGeoSource };

type KaelChatStatus =
  | "active"
  | "collecting_evidence"
  | "estimate_ready"
  | "confirmed"
  | "abandoned"
  | "unsupported";
type KaelChatNextAction =
  | "await_input"
  | "collect_evidence"
  | "ask_photo"
  | "ask_video"
  | "estimate_ready"
  | "unsupported"
  | "budget_exceeded"
  | "confirmed";
type KaelChatTurnRole = "customer" | "kael" | "system";
type KaelChatContentType =
  | "text"
  | "photo_request"
  | "video_request"
  | "photo_attached"
  | "video_attached"
  | "clarification"
  | "analysis"
  | "estimate"
  | "error";

type Chain = {
  select(columns?: string, options?: unknown): Chain;
  insert(value: unknown): Chain;
  delete(): Chain;
  update(value: unknown): Chain;
  upsert(value: unknown, options?: unknown): Chain;
  eq(column: string, value: unknown): Chain;
  neq(column: string, value: unknown): Chain;
  gt(column: string, value: unknown): Chain;
  gte(column: string, value: unknown): Chain;
  lte(column: string, value: unknown): Chain;
  is(column: string, value: unknown): Chain;
  in(column: string, value: unknown[]): Chain;
  contains(column: string, value: unknown[]): Chain;
  or(filter: string): Chain;
  order(column: string, options?: unknown): Chain;
  range(from: number, to: number): Chain;
  limit(count: number): Chain;
  single(): Chain;
  maybeSingle(): Chain;
  then<TResult1 = DbResult<unknown>, TResult2 = never>(
    onfulfilled?:
      | ((value: DbResult<unknown>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

export function createEdgeServices(secrets: EdgeServiceSecrets): MobileApiServices {
  return {
    listServices,
    placesAutocomplete: (ctx, input) => placesAutocomplete(ctx, input, secrets),
    resolvePlace: (ctx, input) => resolvePlace(ctx, input, secrets),
    getVietmapStaticMap: (ctx, input) => getVietmapStaticMap(ctx, input, secrets),
    createJob: (ctx, input) => createJob(ctx, input, secrets),
    getJob,
    listCustomerActiveJobs,
    createKaelChat: (ctx, input) => createKaelChat(ctx, input, secrets),
    answerKaelAssistant: (ctx, input) =>
      answerKaelAssistant(ctx, input, secrets),
    getKaelChat,
    getKaelChatProgress,
    streamKaelChatTurn: (ctx, sessionId, input) =>
      streamKaelChatTurn(ctx, sessionId, input, secrets),
    sendKaelChatTurn: (ctx, sessionId, input) =>
      sendKaelChatTurn(ctx, sessionId, input, secrets),
    createKaelChatMediaUpload,
    submitKaelChatEvidence: (ctx, sessionId, input) =>
      submitKaelChatEvidence(ctx, sessionId, input, secrets),
    confirmKaelChat: (ctx, sessionId) => confirmKaelChat(ctx, sessionId, secrets),
    confirmSearch,
    cancelJob,
    acceptBroadcast,
    declineBroadcast,
    updateJobStatus,
    requestScopeChange: (ctx, jobId, input) =>
      requestScopeChange(ctx, jobId, input, secrets),
    askKaelForWorker,
    createWorkerKaelChat: (ctx, input) =>
      createWorkerKaelChat(ctx, input, secrets),
    listWorkerKaelChats,
    getWorkerKaelChat,
    sendWorkerKaelChatTurn: (ctx, sessionId, input) =>
      sendWorkerKaelChatTurn(ctx, sessionId, input, secrets),
    streamWorkerKaelChatTurn: (ctx, sessionId, input) =>
      streamWorkerKaelChatTurn(ctx, sessionId, input, secrets),
    submitWorkerKaelFeedback,
    getWorkerKaelTrainingConsent,
    setWorkerKaelTrainingConsent,
    requestCustomerCancellation,
    requestWorkerCancellation,
    openDispute,
    submitDisputeCounterStatement,
    decideDispute,
    attachJobMedia,
    listJobMessages,
    sendJobMessage,
    decideWorkerCancellation,
    decideScopeChange,
    confirmCompletion,
    createPaymentIntent: (ctx, jobId) => createPaymentIntent(ctx, jobId, secrets),
    handleSepayWebhook: (input, headers) =>
      handleSepayWebhook(input, headers, secrets),
    submitReview,
    submitCustomerKaelFeedback,
    submitWorkerApplication: (input) => submitWorkerApplication(input, secrets),
    getKaelCharter,
    registerWorker,
    getMyKaelMemory,
    updateMyCustomerKaelMemoryPreference,
    updateMyWorkerKaelMemoryPreference,
    getCustomerProfileInsights,
    getCustomerPaymentMethod,
    saveCustomerPaymentMethod,
    saveWorkerPayoutMethod,
    getWorkerKaelMemory,
    deleteMyKaelMemory,
    getWorkerProfile,
    getWorkerPerformanceInsights,
    updateWorkerAvailability,
    updateWorkerServiceArea,
    listWorkerBroadcasts,
    listWorkerJobs,
    getWorkerEarnings,
    invalidateMarketCache,
    evaluatePriceSynthesisAbCase: (ctx, input) =>
      evaluatePriceSynthesisAbCaseAdmin(ctx, input, secrets),
    processKaelLearningQueue: (ctx, input) =>
      processKaelLearningQueueAdmin(ctx, input, secrets),
    processKaelBatchResults: (ctx, input) =>
      processKaelBatchResultsAdmin(ctx, input, secrets),
    monitorKaelLearningRules: (ctx, input) =>
      monitorKaelLearningRulesAdmin(ctx, input),
    listKaelLearningCandidates: (ctx, input) =>
      listKaelLearningCandidatesAdmin(ctx, input),
    approveKaelLearningCandidate: (ctx, candidateId, input) =>
      approveKaelLearningCandidateAdmin(ctx, candidateId, input),
    rejectKaelLearningCandidate: (ctx, candidateId, input) =>
      rejectKaelLearningCandidateAdmin(ctx, candidateId, input),
    listNotifications,
    markNotificationRead,
    registerDevicePushToken,
  };
}

async function runPolicyAutonomyGate(input: PolicyAutonomyGateInput) {
  return runKaelAutonomyOrchestrator({
    label: input.label,
    decision: input.decision,
    from: input.from,
    to: input.to,
    authority: input.authority,
    knownEvidenceReferences: input.knownEvidenceReferences,
    source: "policy",
    amountVnd: input.amountVnd ?? null,
    audit: {
      client: input.client,
      jobId: input.jobId,
      actorId: input.ctx.user.id,
      actorRole: input.ctx.role,
      source: "policy",
    },
  });
}

function previewCustomerCancellation(
  job: JobAccessRecord,
  now = new Date(),
): CustomerCancellationPreview | null {
  const status = job.status as JobStatus;
  if (status === "completed_by_worker") {
    return {
      subCase: "after_worker_completed_trigger_dispute",
      shouldGateAutonomy: false,
      to: status,
    };
  }
  if (isFutureTimestamp(job.scheduled_at, now)) {
    return { subCase: "scheduled_job", shouldGateAutonomy: true, to: "cancelled" };
  }
  if (status === "awaiting_customer_confirm") {
    return { subCase: "before_a7", shouldGateAutonomy: true, to: "cancelled" };
  }
  if (status === "broadcasting") {
    return { subCase: "after_a7_before_worker_accept", shouldGateAutonomy: true, to: "cancelled" };
  }
  if (
    status === "worker_matched" ||
    status === "worker_on_way" ||
    status === "arrived" ||
    status === "inspecting" ||
    status === "repairing" ||
    status === "scope_change_pending"
  ) {
    return { subCase: "after_worker_accept", shouldGateAutonomy: true, to: "cancelled" };
  }
  return null;
}

function isFutureTimestamp(value: unknown, now: Date) {
  const text = nullableString(value);
  if (!text) return false;
  const time = Date.parse(text);
  return Number.isFinite(time) && time > now.getTime();
}

async function gateCustomerCancellationBeforeMutation(input: {
  client: DbClient;
  ctx: MobileApiContext;
  job: JobAccessRecord;
  jobId: string;
  preview: CustomerCancellationPreview;
  request: CustomerCancellationRequestInput;
}) {
  if (!input.preview.shouldGateAutonomy) return null;
  const localClassification = classifyCustomerCancellationReason({
    reasonCode: input.request.reason_code,
    reason: input.request.reason_note ?? input.request.reason_code,
  });
  const decision = buildKaelAutonomyDecision({
    action: "process_cancellation",
    policyId: `kael.autonomy.v2.customer_cancel_${input.preview.subCase}`,
    evidence: [
      {
        kind: "customer_input",
        reference_id: input.ctx.user.id,
        summary: "Customer cancellation input was validated before any cancellation mutation.",
      },
      {
        kind: "job_event",
        reference_id: input.jobId,
        summary: "Current job phase predicts the cancellation outcome before the atomic RPC.",
      },
      {
        kind: "policy",
        reference_id: "STRUCTURES.md#cancellation",
        summary: "Kael processes cancellation only after the autonomy gate allows the transition.",
      },
    ],
    confidence: localClassification.adminReviewRequired ? 0.68 : 0.84,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_processed_cancellation",
  });
  const run = await runPolicyAutonomyGate({
    label: "customer_process_cancellation",
    client: input.client,
    ctx: input.ctx,
    jobId: input.jobId,
    decision,
    from: input.job.status as JobStatus,
    to: input.preview.to,
    authority: {
      purpose: "scope_change",
      actor: input.ctx.role,
      jobRelation: "own_customer_job",
      action: "review_scope_change",
      topic: "job_status",
      actorId: input.ctx.user.id,
      jobId: input.jobId,
    },
    knownEvidenceReferences: [input.ctx.user.id, input.jobId, "STRUCTURES.md#cancellation"],
  });
  if (run.gate.result !== "allow") {
    apiFailure("INVALID_STATUS", run.gate.audit.reason_code, 409);
  }
  return { decision, run };
}

async function gateWorkerCancellationBeforeMutation(input: {
  client: DbClient;
  ctx: MobileApiContext;
  job: JobAccessRecord;
  jobId: string;
  request: WorkerCancellationRequestInput;
}) {
  const localClassification = classifyWorkerCancellationReason({
    reason: input.request.reason,
    evidencePhotoUrls: input.request.evidence_photo_urls,
  });
  const decision = buildKaelAutonomyDecision({
    action: "process_cancellation",
    policyId: "kael.autonomy.v2.worker_cancel_to_rematch",
    evidence: [
      {
        kind: "worker_evidence",
        reference_id: input.ctx.user.id,
        summary: "Worker cancellation input was classified before any release or rebroadcast mutation.",
      },
      {
        kind: "job_event",
        reference_id: input.jobId,
        summary: "Current worker assignment is checked before replacement matching.",
      },
      {
        kind: "policy",
        reference_id: "docs/workflow/worker-cancellation.md",
        summary: "Approved worker cancellation may start replacement matching only after the autonomy gate allows it.",
      },
    ],
    confidence: localClassification.autoApprove ? 0.92 : 0.72,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_processed_cancellation",
  });
  const run = await runPolicyAutonomyGate({
    label: "worker_process_cancellation",
    client: input.client,
    ctx: input.ctx,
    jobId: input.jobId,
    decision,
    from: input.job.status as JobStatus,
    to: "broadcasting",
    authority: {
      purpose: "scope_change",
      actor: input.ctx.role,
      jobRelation: "own_worker_job",
      action: "review_scope_change",
      topic: "job_status",
      actorId: input.ctx.user.id,
      jobId: input.jobId,
    },
    knownEvidenceReferences: [input.ctx.user.id, input.jobId, "docs/workflow/worker-cancellation.md"],
  });
  if (run.gate.result !== "allow") {
    apiFailure("INVALID_STATUS", run.gate.audit.reason_code, 409);
  }
  return { decision, localClassification, run };
}

function getKaelCharter() {
  return getPublicKaelCharter();
}

async function listServices(ctx: MobileApiContext) {
  const client = db(ctx);
  const [catResult, probResult, baseResult] = await Promise.all([
    dbQuery<Array<Record<string, unknown>>>(
      client
        .from("service_categories")
        .select("id, service_type, slug, label_vi, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order"),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      client
        .from("service_problems")
        .select(
          "id, slug, label_vi, default_complexity, service_category_id, service_type, sort_order, is_active",
        )
        .eq("is_active", true)
        .order("sort_order"),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      client
        .from("price_baselines")
        .select(
          "service_type, complexity, district_code, price_min, price_max, service_problem_id",
        ),
    ),
  ]);

  if (catResult.error) {
    apiFailure("DB_ERROR", "Không thể tải danh mục dịch vụ", 500);
  }
  if (probResult.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách vấn đề", 500);
  }
  if (baseResult.error) {
    apiFailure("DB_ERROR", "Không thể tải bảng giá nền", 500);
  }

  const categories = catResult.data ?? [];
  const problems = probResult.data ?? [];
  const baselines = baseResult.data ?? [];

  return {
    services: categories.map((cat) => ({
      id: asString(cat.id),
      service_type: cat.service_type as ServiceType,
      label_vi: asString(cat.label_vi),
      problems: problems
        .filter((p) => p.service_category_id === cat.id)
        .map((p) => ({
          id: asString(p.id),
          slug: asString(p.slug),
          label_vi: asString(p.label_vi),
          default_complexity: asComplexity(p.default_complexity),
        })),
      baselines: baselines
        .filter((b) => b.service_type === cat.service_type)
        .map(toCatalogBaseline)
        .filter(uniqueCatalogBaseline),
    })),
  };
}

async function placesAutocomplete(
  ctx: MobileApiContext,
  input: PlacesAutocompleteInput,
  secrets: EdgeAiSecrets,
): Promise<PlacesAutocompleteResponse> {
  void ctx;
  const vietmapApiKey = readVietmapApiKey(secrets);
  if (vietmapApiKey) {
    const result = await vietmapPlacesAutocomplete(input, vietmapApiKey);
    if (!result.fallback_used) return result;
  }

  const googleApiKey = readGoogleMapsApiKey(secrets);
  if (googleApiKey) return googlePlacesAutocomplete(input, googleApiKey);

  return { suggestions: [], fallback_used: true };
}

async function vietmapPlacesAutocomplete(
  input: PlacesAutocompleteInput,
  apiKey: string,
): Promise<PlacesAutocompleteResponse> {
  try {
    const url = buildVietmapUrl(VIETMAP_AUTOCOMPLETE_URL, apiKey, {
      text: input.input,
      focus: HCMC_MAP_FOCUS,
      display_type: "6",
      cityId: VIETMAP_HCMC_CITY_ID,
    });
    const response = await fetchJsonWithTimeout(url, { method: "GET" });
    if (!response.ok) {
      console.warn("mobile-api places autocomplete failed", {
        provider: "vietmap",
        status: response.status,
      });
      return { suggestions: [], fallback_used: true };
    }

    const body = await response.json().catch(() => []) as unknown;
    const rows = Array.isArray(body) ? body : [];
    const suggestions = rows
      .map(vietmapAutocompleteSuggestion)
      .filter((item): item is PlacesAutocompleteResponse["suggestions"][number] =>
        item !== null
      )
      .slice(0, 5);

    return { suggestions, fallback_used: false };
  } catch (error) {
    console.warn("mobile-api places autocomplete threw", {
      provider: "vietmap",
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { suggestions: [], fallback_used: true };
  }
}

async function googlePlacesAutocomplete(
  input: PlacesAutocompleteInput,
  apiKey: string,
): Promise<PlacesAutocompleteResponse> {
  try {
    const response = await fetchJsonWithTimeout(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify({
        input: input.input,
        languageCode: "vi",
        regionCode: "VN",
        includedRegionCodes: ["vn"],
        sessionToken: input.session_token,
        locationBias: {
          rectangle: {
            low: { latitude: 10.65, longitude: 106.55 },
            high: { latitude: 10.91, longitude: 106.85 },
          },
        },
      }),
    });
    if (!response.ok) {
      console.warn("mobile-api places autocomplete failed", {
        provider: "google_maps",
        status: response.status,
      });
      return { suggestions: [], fallback_used: true };
    }

    const body = await response.json().catch(() => ({})) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }>;
    };
    const suggestions = (body.suggestions ?? [])
      .map((suggestion) => {
        const prediction = suggestion.placePrediction;
        const label = prediction?.text?.text?.trim() ?? "";
        const placeId = prediction?.placeId?.trim() ?? "";
        if (!label || !placeId) return null;
        return {
          place_id: placeId,
          label,
          main_text: prediction?.structuredFormat?.mainText?.text?.trim() ??
            label,
          secondary_text:
            prediction?.structuredFormat?.secondaryText?.text?.trim() ?? null,
        };
      })
      .filter((item): item is PlacesAutocompleteResponse["suggestions"][number] =>
        item !== null
      )
      .slice(0, 5);

    return { suggestions, fallback_used: false };
  } catch (error) {
    console.warn("mobile-api places autocomplete threw", {
      provider: "google_maps",
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { suggestions: [], fallback_used: true };
  }
}

async function resolvePlace(
  ctx: MobileApiContext,
  input: PlacesResolveInput,
  secrets: EdgeAiSecrets,
): Promise<PlacesResolveResponse> {
  void ctx;
  const vietmapApiKey = readVietmapApiKey(secrets);
  if (vietmapApiKey) {
    const location = await vietmapPlaceLocation(input.place_id, vietmapApiKey);
    if (location) {
      return {
        fallback_used: false,
        label: input.label ?? null,
        location: { lat: location.lat, lng: location.lng },
        place_id: input.place_id,
        provider: "vietmap",
      };
    }
  }

  return {
    fallback_used: true,
    label: input.label ?? null,
    location: null,
    place_id: input.place_id,
    provider: "fallback",
  };
}

async function getVietmapStaticMap(
  ctx: MobileApiContext,
  input: VietmapStaticMapInput,
  secrets: EdgeAiSecrets,
): Promise<Response> {
  void ctx;
  const vietmapApiKey = readVietmapApiKey(secrets);
  if (!vietmapApiKey) {
    apiFailure("MAPS_PROVIDER_MISSING", "Chưa cấu hình VietMap", 503);
  }

  const form = new FormData();
  form.set("lat", input.lat.toFixed(6));
  form.set("lng", input.lng.toFixed(6));
  form.set("zoom", String(input.zoom));
  form.set("width", "720");
  form.set("height", "360");

  const response = await fetchJsonWithTimeout(
    buildVietmapUrl(VIETMAP_STATIC_MAP_URL, vietmapApiKey, {}),
    { body: form, method: "POST" },
  );
  if (!response.ok) {
    console.warn("mobile-api vietmap static map failed", {
      status: response.status,
    });
    apiFailure("MAPS_PROVIDER_ERROR", "Không thể tải bản đồ VietMap", 502);
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    headers: {
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "private, max-age=300",
      "Content-Type": contentType,
    },
    status: 200,
  });
}

async function createJob(
  ctx: MobileApiContext,
  input: JobCreateInput,
  secrets: EdgeAiSecrets,
) {
  const rateCheck = checkRateLimit(
    `job_create:${ctx.user.id}`,
    AI_SESSION_LIMIT,
  );
  if (!rateCheck.allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }

  const client = db(ctx);
  const canonicalDistrict = normalizeServiceAreaDistrict(
    input.address_district,
  );
  if (!canonicalDistrict) {
    apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  }
  const requestId = crypto.randomUUID();

  // X2 (Plan.md §27.5 — 2026-05-29): idempotent re-POST. If the customer
  // sends the same client_request_id again, return the existing job instead
  // of inserting a duplicate row. Closes F-04 (3 parallel POSTs → 3 jobs).
  if (input.client_request_id) {
    const existingJobId = await findExistingJobByClientRequest(
      client,
      ctx.user.id,
      input.client_request_id,
    );
    if (existingJobId) {
      return buildExistingJobCreateResponse(ctx, existingJobId);
    }
  }

  const inserted = await dbQuery<{ id: string; created_at: string | null; display_code?: string | null }>(
    client
      .from("jobs")
      .insert({
        customer_id: ctx.user.id,
        service_type: input.service_type,
        description: sanitizeForLLM(input.description),
        problem_chips: input.problem_chips,
        photo_urls: input.photo_urls,
        address_building: input.address_building ?? null,
        address_unit: input.address_unit ?? null,
        address_floor: input.address_floor ?? null,
        address_district: canonicalDistrict,
        apartment_access_profile: sanitizeApartmentAccessProfile(
          input.apartment_access_profile,
        ),
        apartment_access_state: buildInitialApartmentAccessState(),
        scheduled_at: input.scheduled_at ?? null,
        status: "analyzing",
        client_request_id: input.client_request_id ?? null,
      })
      .select("id, created_at, display_code")
      .single(),
  );

  // Lost race against a concurrent POST with the same client_request_id ->
  // fall back to the winner's row instead of bubbling a 23505 to the client.
  if (
    inserted.error?.code === "23505" && input.client_request_id
  ) {
    const recoveredId = await findExistingJobByClientRequest(
      client,
      ctx.user.id,
      input.client_request_id,
    );
    if (recoveredId) {
      return buildExistingJobCreateResponse(ctx, recoveredId);
    }
  }

  if (inserted.error || !inserted.data) {
    apiFailure("DB_ERROR", "Không thể tạo yêu cầu", 500);
  }
  const jobId = inserted.data.id;
  await persistApartmentAccessProfileFromMetadata(client, {
    customerId: ctx.user.id,
    jobId,
    addressLabel: input.address_building ?? null,
    district: canonicalDistrict,
    profile: sanitizeApartmentAccessProfile(input.apartment_access_profile),
  });
  await geocodeJobAddressForMatching(client, jobId, {
    addressLabel: input.address_building ?? null,
    district: canonicalDistrict,
  }, secrets);
  await logJobEvent(client, jobId, "job_created", ctx, null, "analyzing");

  let pipeline: PipelineResult;
  try {
    pipeline = await runKaelPipeline(
      {
        serviceType: input.service_type,
        problemChips: input.problem_chips,
        description: input.description,
        district: canonicalDistrict,
        photoUrls: input.photo_urls,
        progressJobId: jobId,
      },
      client,
      sourceTrustSecretsForRequest(secrets, ctx),
    );
  } catch {
    const cleanupOk = await cancelAnalyzingJob(
      client,
      jobId,
      ctx,
      "PIPELINE_THROW",
    );
    if (!cleanupOk) {
      apiFailure("DB_ERROR", "Không thể đóng yêu cầu sau lỗi hệ thống", 500);
    }
    console.warn("mobile-api Kael pipeline threw", {
      jobId,
      reasonCode: "PIPELINE_THROW",
    });
    apiFailure("AI_FAILED", "Hệ thống đang xử lý. Vui lòng thử lại.", 502);
  }

  await logApiCalls(
    client,
    pipeline.stageLogs
      .filter((stage) => stage.provider && stage.model)
      .map((stage) => ({
        job_id: jobId,
        request_id: requestId,
        purpose: apiLogPurposeForPipelineStage(stage.stage),
        provider: stage.provider,
        model: stage.model,
        input_tokens: stage.inputTokens ?? null,
        output_tokens: stage.outputTokens ?? null,
        cost_usd: stage.costUsd ?? null,
        latency_ms: stage.latencyMs,
        success: stage.success,
        error_code: stage.failureReason ?? null,
        safe_metadata: {
          ...(stage.cacheStatus ? { cache_status: stage.cacheStatus } : {}),
          ...(stage.safeMetadata ?? {}),
        },
      })),
  );

  if (!pipeline.success) {
    const cleanupOk = await cancelAnalyzingJob(
      client,
      jobId,
      ctx,
      pipeline.code,
    );
    if (!cleanupOk) {
      apiFailure("DB_ERROR", "Không thể đóng yêu cầu sau lỗi hệ thống", 500);
    }
    if (pipeline.code === "UNSUPPORTED") {
      apiFailure("UNSUPPORTED", pipeline.error, 400);
    }
    if (pipeline.code === "NO_BASELINE") {
      apiFailure("NO_BASELINE", pipeline.error, 502);
    }
    apiFailure("AI_FAILED", "Hệ thống đang xử lý. Vui lòng thử lại.", 502);
  }

  const estimate = pipeline.estimate;
  const estimateCardV3 = buildEstimateCardOutput({
    estimate,
    priceSource: estimatePriceSourceFromStageLogs(pipeline.stageLogs),
    baselineUsed:
      `${input.service_type}:${pipeline.serviceProblemId}:${estimate.complexity}`,
  });
  const now = new Date().toISOString();
  const lockedFinalPrice = estimate.price_max;
  const workerBriefCore = buildWorkerBriefOutput({
    stage: "core",
    serviceType: input.service_type,
    problemSummary: estimate.problem_summary,
    district: canonicalDistrict,
    estimatedEarningMin: Math.round(estimate.price_min * (1 - PLATFORM_FEE_WORKER)),
    estimatedEarningMax: Math.round(lockedFinalPrice * (1 - PLATFORM_FEE_WORKER)),
    knowledgeSafetyGuidance: pipeline.knowledgeContext?.safetyGuidance,
  });
  const autonomyDecision = buildKaelAutonomyDecision({
    action: "start_matching",
    policyId: "kael.autonomy.v2.estimate_to_matching",
    evidence: [
      {
        kind: "artifact",
        reference_id: jobId,
        summary: "Validated Kael estimate, supported service scope, and HCMC district.",
      },
      {
        kind: "policy",
        reference_id: "RULES.md#rule-7",
        summary: "Kael Autonomy v2 allows server-validated matching after estimate.",
      },
    ],
    confidence: estimate.confidence,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_started_matching",
  });
  const autonomyRun = await runKaelAutonomyOrchestrator({
    label: "estimate_to_matching",
    decision: autonomyDecision,
    from: "analyzing",
    to: "broadcasting",
    authority: {
      purpose: "price_synthesis",
      actor: "customer",
      jobRelation: "own_customer_job",
      action: "synthesize_price",
      topic: "price_estimate",
      actorId: ctx.user.id,
      jobId,
    },
    knownEvidenceReferences: [jobId, "RULES.md#rule-7"],
    source: "policy",
    audit: {
      client,
      jobId,
      actorId: ctx.user.id,
      actorRole: ctx.role,
      source: "policy",
    },
  });
  if (autonomyRun.gate.result !== "allow") {
    const transitionError = autonomyRun.gate.audit.safe_metadata.transition_error;
    apiFailure(
      "INVALID_STATUS",
      typeof transitionError === "string"
        ? transitionError
        : "Kael autonomy decision rejected by invariant gate.",
      409,
    );
  }
  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({
        status: "broadcasting",
        kael_problem_identified: estimate.problem_summary,
        kael_complexity: estimate.complexity,
        kael_price_min: estimate.price_min,
        kael_price_max: estimate.price_max,
        kael_advisory: estimate.advisory,
        kael_estimate_card_v3: estimateCardV3,
        kael_worker_brief_core: workerBriefCore,
        final_price: lockedFinalPrice,
        service_problem_id: pipeline.serviceProblemId,
        estimate_ready_at: now,
        broadcast_at: now,
        confirmed_search_at: now,
      })
      .eq("id", jobId)
      .eq("status", "analyzing")
      .select("id")
      .maybeSingle(),
  );

  if (updated.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật kết quả phân tích", 500);
  }
  if (!updated.data) {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái yêu cầu đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }

  await recordPipelineLearningApplications(client, jobId, pipeline);

  await logJobEvent(
    client,
    jobId,
    "estimate_ready",
    ctx,
    "analyzing",
    "broadcasting",
    {
      fallback_used: pipeline.fallbackUsed,
      autonomy_decision: autonomyDecision,
    },
  );

  const broadcast = await createBroadcasts(
    client,
    jobId,
    input.service_type,
    canonicalDistrict,
  );
  if (!broadcast.success) {
    if (broadcast.reasonCode === "DB_ERROR") {
      const rolledBack = await rollbackFailedBroadcastStart(
        client,
        jobId,
        ctx.user.id,
        "analyzing",
      );
      if (!rolledBack) {
        apiFailure(
          "DB_ERROR",
          "Không thể khôi phục yêu cầu sau lỗi gửi thợ",
          500,
        );
      }
      await logJobEvent(
        client,
        jobId,
        "broadcast_start_failed",
        ctx,
        "broadcasting",
        "analyzing",
        { reason: broadcast.reason, autonomy_decision: autonomyDecision },
      );
      apiFailure("DB_ERROR", "Không thể gửi yêu cầu đến thợ", 500);
    }
    await logJobEvent(
      client,
      jobId,
      "no_worker_found",
      ctx,
      "broadcasting",
      null,
      {
        reason: broadcast.reason,
        district: canonicalDistrict,
        service_type: input.service_type,
        autonomy_decision: autonomyDecision,
      },
    );
  }

  await logJobEvent(
    client,
    jobId,
    "kael_started_matching",
    ctx,
    "analyzing",
    "broadcasting",
    {
      broadcast_sent: broadcast.success,
      ...(broadcast.success
        ? { batch_id: broadcast.batchId, worker_count: broadcast.broadcastCount }
        : { reason: broadcast.reason }),
      autonomy_decision: autonomyDecision,
    },
  );

  // Phase 2.3 (2026-05-23): customer notification when Kael finishes analysis.
  await insertUserNotification(client, {
    userId: ctx.user.id,
    jobId,
    eventType: "estimate_ready",
    title: "Kael đang điều phối",
    body: broadcast.success
      ? "Kael đã chốt ước tính và đang gửi yêu cầu đến thợ phù hợp."
      : "Kael đã chốt ước tính và sẽ tiếp tục theo dõi thợ phù hợp.",
    metadata: {
      service_type: input.service_type,
      price_min: estimate.price_min,
      price_max: estimate.price_max,
      autonomy_decision_event: autonomyDecision.resulting_event,
      broadcast_sent: broadcast.success,
    },
  });

  return {
    job_id: jobId,
    display_code: nullableString(inserted.data.display_code) ?? buildJobDisplayCode({
      jobId,
      customerId: ctx.user.id,
      createdAt: inserted.data.created_at,
    }),
    status: "broadcasting" as JobStatus,
    estimate,
    estimate_card_v3: estimateCardV3,
    final_price: lockedFinalPrice,
    fallback_used: pipeline.fallbackUsed,
    broadcast_sent: broadcast.success,
    message: broadcast.success
      ? `Đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ. Đang chờ phản hồi.`
      : broadcast.reason,
  };
}

async function cancelAnalyzingJob(
  client: DbClient,
  jobId: string,
  actor: MobileApiContext,
  reasonCode: string,
): Promise<boolean> {
  const cancelledAt = new Date().toISOString();
  const transition = validateWorkflowTransition({
    event: "kael_failed",
    from: "analyzing",
    to: "cancelled",
  });
  if (!transition.valid) {
    console.warn("mobile-api analyzing job cleanup transition rejected", {
      jobId,
      reasonCode,
      error: transition.error,
    });
    return false;
  }
  const cancelResult = await dbQuery(
    client
      .from("jobs")
      .update({ status: "cancelled", cancelled_at: cancelledAt })
      .eq("id", jobId)
      .eq("status", "analyzing")
      .select("id")
      .maybeSingle(),
  ).catch((error) => ({
    data: null,
    error: {
      code: "CLEANUP_THROW",
      message: error instanceof Error ? error.name : "cleanup failed",
    },
  }));

  if (cancelResult.error) {
    console.warn("mobile-api analyzing job cleanup failed", {
      jobId,
      reasonCode,
      errorCode: cancelResult.error.code,
    });
    return false;
  }
  if (!cancelResult.data) {
    console.warn("mobile-api analyzing job cleanup matched no rows", {
      jobId,
      reasonCode,
    });
    return false;
  }

  await logJobEvent(
    client,
    jobId,
    "kael_failed",
    actor,
    "analyzing",
    "cancelled",
    { reason_code: reasonCode },
  );
  return true;
}

async function recordPipelineLearningApplications(
  client: DbClient,
  jobId: string,
  pipeline: PipelineResult,
) {
  if (!pipeline.success || !pipeline.learningApplications?.length) return;
  await Promise.all(pipeline.learningApplications.map((application) =>
    recordLearningRuleApplication(client, {
      ruleId: application.ruleId,
      ruleVersion: application.ruleVersion,
      skillId: application.skillId,
      jobId,
      actorRole: "system",
      appliedTarget: application.appliedTarget,
      safeMetadata: application.safeMetadata,
    })
  ));
}

async function createKaelChat(
  ctx: MobileApiContext,
  input: KaelChatCreateInput,
  secrets: EdgeAiSecrets,
) {
  if (input.session_id) {
    if (!input.message) return getKaelChat(ctx, input.session_id);
    return sendKaelChatTurn(ctx, input.session_id, {
      message: input.message,
      problem_chips: input.problem_chips,
      photo_urls: input.photo_urls,
      address_label: input.address_label,
      address_district: input.address_district,
      apartment_access_profile: input.apartment_access_profile,
    }, secrets);
  }

  const client = db(ctx);

  // X2 (Plan.md §27.5 — 2026-05-29): idempotent re-POST runs BEFORE the
  // rate limiter so harmless retries with the same client_request_id do not
  // burn the user's per-minute quota. Closes F-04 for Kael chat.
  if (input.client_request_id) {
    const existingSession = await findExistingKaelSessionByClientRequest(
      client,
      ctx.user.id,
      input.client_request_id,
    );
    if (existingSession?.kind === "ready") {
      return getKaelChat(ctx, existingSession.sessionId);
    }
    if (existingSession?.kind === "pending") {
      apiFailure(
        "SESSION_PENDING",
        "Phiên Kael đang được tạo. Vui lòng thử lại sau.",
        409,
      );
    }
  }

  // X2 (Plan.md §27.5 — 2026-05-29): DB-backed rate limit (5/min, 20/hour
  // per user). The in-process token bucket would not survive Edge worker
  // churn, so we delegate to a security-definer RPC. Closes F-23.
  const rate = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("check_kael_chat_rate", { p_user_id: ctx.user.id }),
  );
  if (!rate.error) {
    const row = rate.data?.[0];
    if (row && asBoolean(row.allowed) === false) {
      const reason = nullableString(row.reason);
      console.warn("kael_chat rate limited", {
        userId: ctx.user.id,
        reason,
        minute_count: row.minute_count,
        hour_count: row.hour_count,
      });
      apiFailure(
        "RATE_LIMITED",
        reason === "hour"
          ? "Bạn đã đạt giới hạn 20 phiên Kael trong 1 giờ. Vui lòng thử lại sau."
          : "Bạn đang gửi quá nhanh. Vui lòng thử lại sau ít phút.",
        429,
      );
    }
  } else {
    // Don't fail the request if the limiter itself broke — log + fall back to
    // the in-process best-effort bucket so we still rate limit warm workers.
    console.warn("kael_chat DB rate limit fallback", {
      errorCode: rate.error.code,
    });
    const fallback = checkKaelChatRateLimit(ctx.user.id);
    if (!fallback.allowed) {
      apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
    }
  }

  const shouldDeferAnalysis = input.defer_analysis === true;
  const metadata = compactMetadata({
    problem_chips: input.problem_chips,
    address_label: input.address_label ?? null,
    address_district: input.address_district ?? null,
    apartment_access_profile: sanitizeApartmentAccessProfile(
      input.apartment_access_profile,
    ),
    photo_urls: input.photo_urls,
    demanding_customer_qa_count: input.message ? 1 : undefined,
    agentic_flow: shouldDeferAnalysis
      ? {
        evidence_decision: "pending",
        gate: "evidence",
        status: "collecting_evidence",
      }
      : undefined,
  });
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .insert({
        customer_id: ctx.user.id,
        service_type: input.service_type,
        status: shouldDeferAnalysis ? "collecting_evidence" : "active",
        safe_metadata: metadata,
        client_request_id: input.client_request_id ?? null,
      })
      .select(
        "id, job_id, customer_id, service_type, status, started_at, estimate_ready_at, total_turns, total_cost_usd, safe_metadata, created_at",
      )
      .single(),
  );
  // Lost race against a concurrent create with the same client_request_id ->
  // fall back to the winner instead of bubbling 23505 to the mobile client.
  if (
    sessionResult.error?.code === "23505" && input.client_request_id
  ) {
    const recovered = await findExistingKaelSessionByClientRequest(
      client,
      ctx.user.id,
      input.client_request_id,
    );
    if (recovered?.kind === "ready") return getKaelChat(ctx, recovered.sessionId);
    if (recovered?.kind === "pending") {
      apiFailure(
        "SESSION_PENDING",
        "Phiên Kael đang được tạo. Vui lòng thử lại sau.",
        409,
      );
    }
  }
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("DB_ERROR", "Không thể tạo phiên Kael", 500);
  }

  if (input.message) {
    const message = sanitizeForLLM(input.message);
    const sessionId = asString(sessionResult.data.id);
    // X5 (Plan.md §27.8 — 2026-05-29): F-22. Scrub PII (phone/CCCD/address/
    // building/unit) BEFORE persisting to kael_chat_turns.text_content so raw
    // PII never lands in the DB. The in-memory `message` (also sanitized) is
    // still used for boundary detection + analysis; the pipeline scrubs again
    // before any LLM call.
    await insertKaelTurn(client, {
      session_id: sessionId,
      turn_index: 1,
      role: "customer",
      content_type: "text",
      text_content: scrubSensitiveForLLM(message),
      media_refs: input.photo_urls,
      safe_metadata: {},
    });
    await updateKaelSession(client, sessionId, {
      total_turns: 1,
      safe_metadata: metadata,
    });
    // X1 (Plan.md §27.4 — 2026-05-29): apply boundary guard FIRST so
    // out-of-scope / injection / mismatch messages are declined before the
    // demanding-customer empathy path can intercept and produce a
    // misleading "wait_time_concern" style reply.
    const boundaryHandled = await maybeApplyKaelBoundaryGuard(
      client,
      sessionId,
      message,
      input.service_type,
      { actorId: ctx.user.id, jobId: null },
    );
    if (!boundaryHandled) {
      if (!shouldDeferAnalysis) {
        const handledDemandingCustomer =
          await maybeHandleDemandingCustomerKaelChatTurn(
            client,
            {
              sessionId,
              actorId: ctx.user.id,
              jobId: null,
              status: "active",
              metadata,
              message,
              qaCount: 1,
            },
          );
        if (!handledDemandingCustomer) {
          await advanceKaelChatEstimate(
            ctx,
            sessionId,
            {
              ...input,
              message,
            },
            secrets,
          );
        }
      }
    }
  }

  return getKaelChat(ctx, asString(sessionResult.data.id));
}

// X2 (Plan.md §27.5 — 2026-05-29): idempotent Kael chat session helpers.
type ExistingKaelSessionByClientRequest =
  | { kind: "ready"; sessionId: string }
  | { kind: "pending" }
  | null;

async function findExistingKaelSessionByClientRequest(
  client: DbClient,
  customerId: string,
  clientRequestId: string,
): Promise<ExistingKaelSessionByClientRequest> {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, job_id, status, estimate_ready_at, total_turns")
      .eq("customer_id", customerId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return null;
  const sessionId = asString(result.data.id);
  if (!sessionId) return null;
  const hasMaterializedTurn = (nullableNumber(result.data.total_turns) ?? 0) > 0;
  const hasJob = nullableString(result.data.job_id) !== null;
  const hasEstimate = nullableString(result.data.estimate_ready_at) !== null;
  if (!hasMaterializedTurn && !hasJob && !hasEstimate) {
    return { kind: "pending" };
  }
  return { kind: "ready", sessionId };
}

// X2 (Plan.md §27.5 — 2026-05-29): idempotent job creation helpers.
async function findExistingJobByClientRequest(
  client: DbClient,
  customerId: string,
  clientRequestId: string,
): Promise<string | null> {
  const result = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .select("id")
      .eq("customer_id", customerId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return null;
  return result.data.id;
}

async function buildExistingJobCreateResponse(
  ctx: MobileApiContext,
  jobId: string,
) {
  const client = db(ctx);
  const job = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select(
        "id, display_code, status, service_type, customer_id, created_at, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_advisory, kael_estimate_card_v3, final_price",
      )
      .eq("id", jobId)
      .single(),
  );
  if (job.error || !job.data) {
    apiFailure("DB_ERROR", "Không thể tải lại yêu cầu đã tạo", 500);
  }
  const cardV3 = asRecord(job.data.kael_estimate_card_v3);
  const cardEstimate = asRecord(cardV3.estimate);
  const complexity = asComplexityOrNull(job.data.kael_complexity) ??
    asComplexityOrNull(cardEstimate.complexity);
  const priceMin = positiveNumberFrom(job.data.kael_price_min) ??
    positiveNumberFrom(cardEstimate.price_min);
  const priceMax = positiveNumberFrom(job.data.kael_price_max) ??
    positiveNumberFrom(cardEstimate.price_max);
  if (!complexity || priceMin === null || priceMax === null || priceMax < priceMin) {
    apiFailure(
      "JOB_PENDING",
      "Yêu cầu đang được Kael phân tích. Vui lòng thử lại sau.",
      409,
    );
  }
  const estimate = {
    service_type: asServiceType(job.data.service_type),
    problem_category: nullableString(cardEstimate.problem_category) ?? "",
    problem_summary: nullableString(job.data.kael_problem_identified) ?? "",
    complexity,
    price_min: priceMin,
    price_max: priceMax,
    confidence: asNumber(cardEstimate.confidence),
    advisory: nullableString(job.data.kael_advisory),
    disclaimer: PRICE_DISCLAIMER,
  };
  return {
    job_id: asString(job.data.id),
    display_code: nullableString(job.data.display_code) ?? buildJobDisplayCode({
      jobId: asString(job.data.id),
      customerId: nullableString(job.data.customer_id),
      createdAt: nullableString(job.data.created_at),
    }),
    status: asJobStatus(job.data.status),
    estimate,
    estimate_card_v3: Object.keys(cardV3).length > 0
      ? (cardV3 as Record<string, unknown>)
      : undefined,
    final_price: nullableNumber(job.data.final_price),
    fallback_used: false,
  };
}

// X1 (Plan.md §27.4 — 2026-05-29): shared boundary entry point used by both
// createKaelChat and sendKaelChatTurn. Returns true when the message was
// declined (caller skips downstream processing); false otherwise.
async function answerKaelAssistant(
  ctx: MobileApiContext,
  input: KaelAssistantInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  let job: Record<string, unknown> | null = null;

  if (input.job_id) {
    job = await requireJobAccess(client, input.job_id, ctx, {
      select:
        "id, status, customer_id, worker_id, service_type, description, address_district, kael_problem_identified, kael_complexity, kael_advisory, payment_status",
    });
  }

  return runCustomerAssistant({
    client,
    job: job
      ? {
        id: asString(job.id),
        status: nullableString(job.status),
        service_type: nullableString(job.service_type),
        description: nullableString(job.description),
        address_district: nullableString(job.address_district),
        kael_problem_identified: nullableString(job.kael_problem_identified),
        kael_complexity: nullableString(job.kael_complexity),
        kael_advisory: nullableString(job.kael_advisory),
        payment_status: nullableString(job.payment_status),
      }
      : null,
    language: input.language,
    message: input.message,
    secrets,
    surface: input.surface,
  });
}

async function maybeApplyKaelBoundaryGuard(
  client: DbClient,
  sessionId: string,
  message: string,
  serviceType: ServiceType,
  auditContext: {
    readonly actorId: string | null;
    readonly jobId: string | null;
  } = { actorId: null, jobId: null },
): Promise<boolean> {
  const boundary = evaluateMessageBoundary(message, serviceType, {
    semanticInjectionClassifierEnabled: true,
  });
  if (boundary.ok) return false;
  console.warn("kael_chat boundary decline", {
    sessionId,
    reason: boundary.reason,
    signalCount: boundary.detectedSignals.length,
  });
  await auditGuardrailTripBestEffort(client, {
    jobId: auditContext.jobId,
    actorId: auditContext.actorId,
    actorRole: "customer",
    surface: "kael_chat_boundary",
    reason: boundary.reason,
    source: "boundary_guard",
    safeMetadata: {
      session_id: sessionId,
      service_type: serviceType,
      boundary_signals: boundary.detectedSignals,
    },
  });
  await appendKaelSystemTurn(client, sessionId, {
    contentType: "error",
    text: boundary.declineText,
    nextStatus: "unsupported",
    metadata: {
      boundary_reason: boundary.reason,
      boundary_signals: boundary.detectedSignals,
      ...(boundary.suggestedService
        ? { suggested_service: boundary.suggestedService }
        : {}),
    },
  });
  return true;
}

async function getKaelChat(ctx: MobileApiContext, sessionId: string) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, job_id, customer_id, service_type, status, started_at, estimate_ready_at, total_turns, total_cost_usd, safe_metadata, created_at",
      )
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  assertKaelSessionOwnership(sessionResult.data, ctx);

  const turnsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_chat_turns")
      .select(
        "id, session_id, turn_index, role, content_type, text_content, media_refs, safe_metadata, created_at",
      )
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true }),
  );
  if (turnsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải lịch sử Kael", 500);
  }

  const turns = (turnsResult.data ?? []).map(serializeKaelTurn);
  const latestEstimate = [...turns]
    .reverse()
    .find((turn) => turn.content_type === "estimate")?.estimate ?? null;

  return {
    session: serializeKaelSession(sessionResult.data, latestEstimate, turns),
    turns,
  };
}

async function getKaelChatProgress(
  ctx: MobileApiContext,
  sessionId: string,
) {
  return readKaelChatProgressSnapshot(ctx, sessionId);
}

async function readKaelChatProgressSnapshot(
  ctx: MobileApiContext,
  sessionId: string,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, customer_id, kael_progress")
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  assertKaelSessionOwnership(sessionResult.data, ctx);

  return {
    session_id: sessionId,
    progress: parseKaelProgressSnapshot(sessionResult.data.kael_progress, sessionId),
  };
}

function parseKaelProgressSnapshot(raw: unknown, contextId: string) {
  const rawProgress = nullableRecord(raw);
  const parsedProgress = rawProgress
    ? kaelChatProgressSchema.safeParse(rawProgress)
    : null;
  if (parsedProgress && !parsedProgress.success) {
    console.warn("mobile-api Kael progress invalid", { contextId });
  }
  return parsedProgress?.success
    ? {
      ...parsedProgress.data,
      failure_reason: parsedProgress.data.failure_reason ?? null,
    }
    : null;
}

async function streamKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: KaelChatTurnInput,
  secrets: EdgeAiSecrets,
) {
  // Preflight ownership before returning a 200 event stream so unauthorized
  // callers still receive the normal JSON auth/error path.
  await getKaelChat(ctx, sessionId);

  const encoder = new TextEncoder();
  let stopped = false;
  let lastProgressSignature: string | null = null;
  let lastHeartbeatAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (stopped) return;
        controller.enqueue(encoder.encode(chunk));
      };
      const emit = (event: string, data: unknown) => {
        write(encodeSseEvent({ event, data }));
      };
      const close = () => {
        if (stopped) return;
        stopped = true;
        controller.close();
      };
      const emitProgressIfChanged = async () => {
        const snapshot = await readKaelChatProgressSnapshot(ctx, sessionId);
        const progress = snapshot.progress;
        if (!progress) return;
        const signature = `${progress.current_stage}:${progress.status}:${progress.progress}:${progress.updated_at}`;
        if (signature === lastProgressSignature) return;
        lastProgressSignature = signature;
        emit("stage", {
          stage: progress.current_stage,
          status: progress.status,
          progress: progress.progress,
          failure_reason: progress.failure_reason ?? null,
          updated_at: progress.updated_at,
        });
      };

      const resultPromise = sendKaelChatTurn(ctx, sessionId, input, secrets)
        .then(async (result) => {
          await emitProgressIfChanged();
          // Token events remain disabled until provider-client/callAI exposes a
          // real streaming mode; the authoritative object is always final.
          emit("result", result);
          close();
        })
        .catch((err) => {
          emit("error", kaelChatStreamErrorPayload(err));
          close();
        });

      void (async () => {
        const startedAt = Date.now();
        while (!stopped && Date.now() - startedAt < KAEL_CHAT_STREAM_MAX_MS) {
          await emitProgressIfChanged();
          const now = Date.now();
          if (now - lastHeartbeatAt >= KAEL_CHAT_STREAM_HEARTBEAT_MS) {
            write(encodeSseHeartbeat());
            lastHeartbeatAt = now;
          }
          await sleep(KAEL_CHAT_STREAM_POLL_MS);
        }
        await resultPromise;
      })().catch((err) => {
        emit("error", kaelChatStreamErrorPayload(err));
        close();
      });
    },
    cancel() {
      stopped = true;
    },
  });

  return createSseResponse(stream);
}

async function createKaelChatMediaUpload(
  ctx: MobileApiContext,
  input: KaelChatMediaUploadInput,
): Promise<KaelChatMediaUploadResponse> {
  const mimeType = normalizeKaelChatMediaMime(input.mime_type);
  if (!mimeType) {
    apiFailure("UNSUPPORTED_MEDIA", "Loại media chưa hỗ trợ", 400);
  }
  const objectPath = `${ctx.user.id}/kael-chat/${
    safeKaelChatObjectName(input.file_name, mimeType)
  }`;
  const storageRoot = db(ctx).storage;
  if (!storageRoot) {
    apiFailure("MEDIA_UPLOAD_UNAVAILABLE", "Không thể chuẩn bị kho media", 500);
  }
  const storage = storageRoot.from(KAEL_CHAT_MEDIA_BUCKET) as unknown as {
    createSignedUploadUrl(
      path: string,
      options?: { upsert?: boolean },
    ): Promise<{
      data: { signedUrl?: string; token?: string; path?: string } | null;
      error: unknown;
    }>;
  };
  const { data, error } = await storage.createSignedUploadUrl(objectPath, {
    upsert: false,
  });
  if (error || !data?.signedUrl || !data?.token) {
    apiFailure("MEDIA_UPLOAD_UNAVAILABLE", "Không thể chuẩn bị kho media", 500);
  }
  return {
    bucket_id: KAEL_CHAT_MEDIA_BUCKET,
    object_path: objectPath,
    media_ref: kaelChatStorageRef(objectPath),
    token: data.token,
    signed_upload_url: data.signedUrl,
    expires_in_seconds: 60 * 60 * 2,
  };
}

async function submitKaelChatEvidence(
  ctx: MobileApiContext,
  sessionId: string,
  input: KaelChatEvidenceInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, job_id, customer_id, service_type, status, total_turns, safe_metadata",
      )
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }

  const session = sessionResult.data;
  assertKaelSessionOwnership(session, ctx);
  const status = asKaelChatStatus(session.status);
  if (status !== "collecting_evidence") {
    apiFailure("INVALID_STATUS", "Phiên Kael chưa chờ bằng chứng", 409);
  }

  const previousTurns = asNumber(session.total_turns);
  const previousMetadata = asRecord(session.safe_metadata);
  const previousFlow = asRecord(previousMetadata.agentic_flow);
  const photoUrls = input.photo_urls;
  const mediaRefs = input.media_refs ?? [];
  const mergedPhotoUrls = mergeLimitedRefs(
    asStringArray(previousMetadata.photo_urls),
    photoUrls,
    5,
  );
  const mergedMediaRefs = mergeLimitedRefs(
    asStringArray(previousMetadata.media_refs),
    mediaRefs,
    5,
  );
  const signedMediaUrls = await signedKaelChatMediaUrls(
    client,
    ctx.user.id,
    mediaRefs,
  );
  const analysisPhotoUrls = mergeLimitedRefs(mergedPhotoUrls, signedMediaUrls, 5);
  const skipReason = input.skip_reason
    ? scrubSensitiveForLLM(sanitizeForLLM(input.skip_reason))
    : null;
  const evidenceText = input.decision === "confirmed"
    ? "Đã gửi bằng chứng hiện trạng."
    : skipReason
      ? `Bỏ qua bằng chứng: ${skipReason}`
      : "Bỏ qua bằng chứng.";
  const metadata = compactMetadata({
    ...previousMetadata,
    problem_chips: input.problem_chips ??
      asStringArray(previousMetadata.problem_chips),
    photo_urls: mergedPhotoUrls,
    media_refs: mergedMediaRefs,
    agentic_flow: {
      ...previousFlow,
      evidence_count: photoUrls.length + mediaRefs.length,
      evidence_decision: input.decision,
      evidence_submitted_at: new Date().toISOString(),
      gate: "evidence",
      skip_reason: skipReason ?? undefined,
      status: "ready_for_analysis",
    },
  });

  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: previousTurns + 1,
    role: "customer",
    content_type: photoUrls.length + mediaRefs.length > 0 ? "photo_attached" : "text",
    text_content: evidenceText,
    media_refs: mergeLimitedRefs(photoUrls, mediaRefs, 5),
    safe_metadata: {
      decision: input.decision,
      evidence_count: photoUrls.length + mediaRefs.length,
    },
  });
  await updateKaelSession(client, sessionId, {
    total_turns: previousTurns + 1,
    status: "active",
    safe_metadata: metadata,
  });

  const firstTurnResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_chat_turns")
      .select("text_content")
      .eq("session_id", sessionId)
      .eq("role", "customer")
      .order("turn_index", { ascending: true })
      .limit(1),
  );
  const firstMessage = nullableString(firstTurnResult.data?.[0]?.text_content);
  const analysisMessage = sanitizeForLLM(
    input.message ?? firstMessage ?? evidenceText,
  );

  const boundaryHandled = await maybeApplyKaelBoundaryGuard(
    client,
    sessionId,
    analysisMessage,
    asServiceType(session.service_type),
    { actorId: ctx.user.id, jobId: nullableString(session.job_id) },
  );
  if (boundaryHandled) return getKaelChat(ctx, sessionId);

  await advanceKaelChatEstimate(ctx, sessionId, {
    service_type: asServiceType(session.service_type),
    message: analysisMessage,
    problem_chips: asStringArray(metadata.problem_chips),
    photo_urls: analysisPhotoUrls,
    address_district: nullableString(metadata.address_district) ?? undefined,
  }, secrets);

  return getKaelChat(ctx, sessionId);
}

async function streamWorkerKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: WorkerKaelChatTurnInput,
  secrets: EdgeAiSecrets,
) {
  await readWorkerKaelChatProgressSnapshot(ctx, sessionId);

  const encoder = new TextEncoder();
  let stopped = false;
  let lastProgressSignature: string | null = null;
  let lastHeartbeatAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (stopped) return;
        controller.enqueue(encoder.encode(chunk));
      };
      const emit = (event: string, data: unknown) => {
        write(encodeSseEvent({ event, data }));
      };
      const close = () => {
        if (stopped) return;
        stopped = true;
        controller.close();
      };
      const emitProgressIfChanged = async () => {
        const snapshot = await readWorkerKaelChatProgressSnapshot(ctx, sessionId);
        const progress = snapshot.progress;
        if (!progress) return;
        const signature = `${progress.current_stage}:${progress.status}:${progress.progress}:${progress.updated_at}`;
        if (signature === lastProgressSignature) return;
        lastProgressSignature = signature;
        emit("stage", {
          stage: progress.current_stage,
          status: progress.status,
          progress: progress.progress,
          failure_reason: progress.failure_reason ?? null,
          updated_at: progress.updated_at,
        });
      };

      const resultPromise = sendWorkerKaelChatTurn(ctx, sessionId, input, secrets)
        .then(async (result) => {
          await emitProgressIfChanged();
          // Token events stay disabled until callAI exposes real provider token
          // streaming for worker_assist. The final result remains authoritative.
          emit("result", result);
          close();
        })
        .catch((err) => {
          emit("error", kaelChatStreamErrorPayload(err));
          close();
        });

      void (async () => {
        const startedAt = Date.now();
        while (!stopped && Date.now() - startedAt < KAEL_CHAT_STREAM_MAX_MS) {
          await emitProgressIfChanged();
          const now = Date.now();
          if (now - lastHeartbeatAt >= KAEL_CHAT_STREAM_HEARTBEAT_MS) {
            write(encodeSseHeartbeat());
            lastHeartbeatAt = now;
          }
          await sleep(KAEL_CHAT_STREAM_POLL_MS);
        }
        await resultPromise;
      })().catch((err) => {
        emit("error", kaelChatStreamErrorPayload(err));
        close();
      });
    },
    cancel() {
      stopped = true;
    },
  });

  return createSseResponse(stream);
}

async function readWorkerKaelChatProgressSnapshot(
  ctx: MobileApiContext,
  sessionId: string,
) {
  const client = db(ctx);
  const session = await readWorkerKaelSession(client, ctx, sessionId);
  return {
    session_id: sessionId,
    progress: serializeWorkerKaelSession(session).progress,
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function kaelChatStreamErrorPayload(err: unknown) {
  const code = typeof (err as { code?: unknown })?.code === "string"
    ? (err as { code: string }).code
    : "STREAM_ERROR";
  return {
    code,
    message:
      "Kael ch\u01b0a th\u1ec3 ph\u00e1t lu\u1ed3ng c\u1eadp nh\u1eadt. B\u1ea1n th\u1eed l\u1ea1i sau \u00edt ph\u00fat.",
  };
}

async function sendKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: KaelChatTurnInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, job_id, customer_id, service_type, status, total_turns, safe_metadata",
      )
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  const session = sessionResult.data;
  assertKaelSessionOwnership(session, ctx);
  const status = asKaelChatStatus(session.status);
  if (
    status === "confirmed" || status === "abandoned" ||
    status === "unsupported"
  ) {
    apiFailure("INVALID_STATUS", "Phiên Kael này không còn nhận tin nhắn", 409);
  }

  const previousTurns = asNumber(session.total_turns);
  const previousMetadata = asRecord(session.safe_metadata);
  const qaCount = asNumber(previousMetadata.demanding_customer_qa_count) + 1;
  const metadata = compactMetadata({
    ...previousMetadata,
    problem_chips: input.problem_chips ??
      asStringArray(previousMetadata.problem_chips),
    address_label: input.address_label ??
      nullableString(previousMetadata.address_label),
    address_district: input.address_district ??
      nullableString(previousMetadata.address_district),
    apartment_access_profile: mergeApartmentAccessProfiles(
      previousMetadata.apartment_access_profile,
      input.apartment_access_profile,
    ),
    photo_urls: mergeLimitedRefs(
      asStringArray(previousMetadata.photo_urls),
      input.photo_urls,
      5,
    ),
    demanding_customer_qa_count: qaCount,
  });
  const message = sanitizeForLLM(input.message);
  // X5 (Plan.md §27.8 — 2026-05-29): F-22. Scrub PII before persisting.
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: previousTurns + 1,
    role: "customer",
    content_type: input.photo_urls.length > 0 ? "photo_attached" : "text",
    text_content: scrubSensitiveForLLM(message),
    media_refs: input.photo_urls,
    safe_metadata: {},
  });
  await updateKaelSession(client, sessionId, {
    total_turns: previousTurns + 1,
    status: "active",
    safe_metadata: metadata,
  });

  // X1 (Plan.md §27.4 — 2026-05-29): boundary guard BEFORE demanding-customer
  // intercept, otherwise off-topic / injection / mismatch messages could
  // bypass decline via empathy template.
  const boundaryHandled = await maybeApplyKaelBoundaryGuard(
    client,
    sessionId,
    message,
    asServiceType(session.service_type),
    { actorId: ctx.user.id, jobId: nullableString(session.job_id) },
  );
  if (boundaryHandled) return getKaelChat(ctx, sessionId);

  const handledDemandingCustomer = await maybeHandleDemandingCustomerKaelChatTurn(
    client,
    {
      sessionId,
      actorId: ctx.user.id,
      jobId: nullableString(session.job_id),
      status,
      metadata,
      message,
      qaCount,
    },
  );
  if (handledDemandingCustomer) return getKaelChat(ctx, sessionId);

  await advanceKaelChatEstimate(ctx, sessionId, {
    service_type: asServiceType(session.service_type),
    message,
    problem_chips: asStringArray(metadata.problem_chips),
    photo_urls: asStringArray(metadata.photo_urls),
    address_district: nullableString(metadata.address_district) ?? undefined,
  }, secrets);

  return getKaelChat(ctx, sessionId);
}

async function confirmKaelChat(
  ctx: MobileApiContext,
  sessionId: string,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("confirm_kael_chat_atomic", {
      p_session_id: sessionId,
      p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  if (!asBoolean(row.ok)) {
    const errorCode = nullableString(row.error_code);
    let existingJobId = nullableString(row.job_id);
    // X2 (Plan.md §27.5 — 2026-05-29): F-11 safety-net. The RPC normally
    // returns the recovered job_id on ALREADY_CONFIRMED, but if it doesn't
    // (e.g. session marked confirmed before the row update propagated), fall
    // back to a direct session lookup so double-confirm still resolves to
    // 200-with-current-state instead of bubbling 409 to the user.
    if (errorCode === "ALREADY_CONFIRMED" && !existingJobId) {
      const sessionLookup = await dbQuery<{ job_id: string | null }>(
        client
          .from("kael_chat_sessions")
          .select("job_id")
          .eq("id", sessionId)
          .eq("customer_id", ctx.user.id)
          .maybeSingle(),
      );
      existingJobId = nullableString(sessionLookup.data?.job_id ?? null);
    }
    if (errorCode === "ALREADY_CONFIRMED" && existingJobId) {
      const currentState = await readConfirmedKaelChatState(ctx, existingJobId);
      if (currentState.status === "awaiting_customer_confirm") {
        return {
          session_id: sessionId,
          ...(await confirmSearch(ctx, existingJobId, {
            autonomyDecision: buildKaelChatMatchingDecision(sessionId, existingJobId),
          })),
        };
      }
      return {
        session_id: sessionId,
        ...currentState,
      };
    }
    mapConfirmKaelChatError(errorCode);
  }

  const jobId = asString(row.job_id);
  if (!jobId) apiFailure("DB_ERROR", "Phiên Kael chưa tạo được yêu cầu", 500);
  await geocodeConfirmedKaelJob(
    client,
    sessionId,
    jobId,
    ctx.user.id,
    nullableString(row.district_code),
    secrets,
  );
  const confirmed = await confirmSearch(ctx, jobId, {
    autonomyDecision: buildKaelChatMatchingDecision(sessionId, jobId),
  });
  return {
    session_id: sessionId,
    ...confirmed,
  };
}

function buildKaelChatMatchingDecision(
  sessionId: string,
  jobId: string,
): KaelAutonomyDecision {
  return buildKaelAutonomyDecision({
    action: "start_matching",
    policyId: "kael.autonomy.v2.chat_estimate_to_matching",
    evidence: [
      {
        kind: "artifact",
        reference_id: sessionId,
        summary: "Validated Kael chat estimate and customer intake.",
      },
      {
        kind: "artifact",
        reference_id: jobId,
        summary: "Server-created job has locked Kael estimate and district.",
      },
      {
        kind: "policy",
        reference_id: "RULES.md#rule-7",
        summary: "Kael Autonomy v2 allows server-validated matching after estimate.",
      },
    ],
    confidence: 0.86,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_started_matching",
  });
}

async function readConfirmedKaelChatState(
  ctx: MobileApiContext,
  jobId: string,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id",
  });
  const status = job.status as JobStatus;
  const broadcastSent = status === "broadcasting"
    ? await hasActiveBroadcast(client, jobId, new Date().toISOString())
    : false;

  return {
    job_id: jobId,
    status,
    broadcast_sent: broadcastSent,
    worker: null,
    message: "Phiên Kael đã được xác nhận. Đang đồng bộ trạng thái hiện tại.",
  };
}

async function maybeHandleDemandingCustomerKaelChatTurn(
  client: DbClient,
  input: {
    sessionId: string;
    actorId: string;
    jobId: string | null;
    status: KaelChatStatus;
    metadata: Record<string, unknown>;
    message: string;
    qaCount: number;
  },
) {
  const alreadyHardStopped = input.metadata.demanding_customer_hard_escalation === true;
  const detection = detectDemandingCustomerPatterns({
    message: input.message,
    qaCount: input.qaCount,
    cancelCount: asNumber(input.metadata.demanding_customer_cancel_count),
    // LLM-assist (2026-06-04): prior-turn intake-diagnosis sentiment fills a keyword
    // gap (soft only). Keyword detection above stays the primary, deterministic path.
    llmSentiment: asKaelStoredSentiment(input.metadata.last_customer_sentiment),
  });
  if (!alreadyHardStopped && detection.expectedNuance === "none") return false;

  const effectiveDetection = alreadyHardStopped && detection.escalationLevel !== "hard"
    ? {
      ...detection,
      nuance: detection.nuance === "none" ? "pressure" as const : detection.nuance,
      expectedNuance: detection.expectedNuance === "none" ? "pressure" as const : detection.expectedNuance,
      pressureScore: Math.max(detection.pressureScore, 1),
      escalationLevel: "hard" as const,
    }
    : detection;
  const response = buildDemandingCustomerResponse(effectiveDetection);

  await recordDemandingCustomerInteraction(client, {
    jobId: input.jobId,
    actorId: input.actorId,
    actorRole: "customer",
    message: input.message,
    detection: effectiveDetection,
    response,
  });
  await appendKaelSystemTurn(client, input.sessionId, {
    contentType: "clarification",
    text: response.responseText,
    nextStatus: response.stopAiLoop
      ? "active"
      : input.status === "estimate_ready"
      ? "estimate_ready"
      : "active",
    metadata: {
      demanding_customer: demandingCustomerTurnMetadata(effectiveDetection, response),
    },
    sessionMetadata: demandingCustomerSessionMetadata(
      input.metadata,
      effectiveDetection,
      response,
    ),
  });
  return true;
}

async function advanceKaelChatEstimate(
  ctx: MobileApiContext,
  sessionId: string,
  input: Required<Pick<KaelChatCreateInput, "service_type">> & {
    message?: string;
    problem_chips?: string[];
    photo_urls?: string[];
    address_district?: string;
  },
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const progressTarget = { table: "kael_chat_sessions" as const, id: sessionId };
  const llmClarificationEnabled =
    readKaelOptimizationFlags().KAEL_OPT_LLM_CLARIFICATION_ENABLED;
  const currentCostUsd = await getKaelChatCostUsd(client, sessionId);
  if (currentCostUsd >= KAEL_CHAT_HARD_COST_CAP_USD) {
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "error",
      text:
        "Kael tạm dừng phân tích thêm cho phiên này để giữ ngân sách AI an toàn. Bạn có thể đặt thợ từ ước tính đã có hoặc tạo phiên mới nếu cần.",
      nextStatus: "active",
      metadata: {
        budget_exceeded: true,
        hard_cap_usd: KAEL_CHAT_HARD_COST_CAP_USD,
        total_cost_usd: currentCostUsd,
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "intent_classification",
      status: "failed",
      progress: 0,
      failureReason: "budget_exceeded",
    });
    return;
  }

  const district = normalizeServiceAreaDistrict(input.address_district);
  if (!district) {
    const question =
      "\u0042\u1ea1n cho Kael bi\u1ebft qu\u1eadn \u1edf TP.HCM \u0111\u1ec3 \u01b0\u1edbc t\u00ednh \u0111\u00fang khu v\u1ef1c v\u00e0 t\u00ecm th\u1ee3 ph\u00f9 h\u1ee3p.";
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "clarification",
      text: question,
      nextStatus: "active",
      metadata: {
        artifact_proposal: buildKaelMissingInfoArtifactProposal({
          missingFields: ["address_district"],
          question,
        }),
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "clarification",
      status: "completed",
      progress: 1,
    });
    return;
  }

  const message = sanitizeForLLM(input.message ?? "");
  const problemChips = input.problem_chips?.filter(Boolean) ?? [];
  // When smart clarification is on, let intake-diagnosis ask a CONTEXTUAL question
  // instead of this generic length-heuristic prompt (STRUCTURES.md A4).
  if (!llmClarificationEnabled && message.length < 10 && problemChips.length === 0) {
    const question =
      "\u0042\u1ea1n m\u00f4 t\u1ea3 r\u00f5 h\u01a1n v\u1ea5n \u0111\u1ec1 \u0111ang g\u1eb7p: v\u1ecb tr\u00ed, d\u1ea5u hi\u1ec7u v\u00e0 m\u1ee9c \u0111\u1ed9 \u1ea3nh h\u01b0\u1edfng trong c\u0103n h\u1ed9.";
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "clarification",
      text: question,
      nextStatus: "active",
      metadata: {
        artifact_proposal: buildKaelMissingInfoArtifactProposal({
          missingFields: ["description"],
          question,
        }),
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "clarification",
      status: "completed",
      progress: 1,
    });
    return;
  }

  // X1 (Plan.md §27.4 — 2026-05-29): boundary guard rejects
  // out-of-scope / prompt-injection / service-mismatch BEFORE any provider
  // call so cost stays zero for declined turns and Kael never emits an
  // estimate that would violate RULES.md #6 (service scope) or #8 (no
  // fake/off-topic data).
  const boundary = evaluateMessageBoundary(message, input.service_type, {
    semanticInjectionClassifierEnabled: true,
  });
  if (!boundary.ok) {
    console.warn("kael_chat boundary decline", {
      sessionId,
      reason: boundary.reason,
      signalCount: boundary.detectedSignals.length,
    });
    await auditGuardrailTripBestEffort(client, {
      jobId: null,
      actorId: ctx.user.id,
      actorRole: "customer",
      surface: "kael_chat_boundary",
      reason: boundary.reason,
      source: "boundary_guard",
      safeMetadata: {
        session_id: sessionId,
        service_type: input.service_type,
        boundary_signals: boundary.detectedSignals,
      },
    });
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "error",
      text: boundary.declineText,
      nextStatus: "unsupported",
      metadata: {
        boundary_reason: boundary.reason,
        boundary_signals: boundary.detectedSignals,
        ...(boundary.suggestedService
          ? { suggested_service: boundary.suggestedService }
          : {}),
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "intent_classification",
      status: "failed",
      progress: 1,
      failureReason: boundary.reason,
    });
    return;
  }

  let conversationContext: string | undefined;
  let priorClarificationCount = 0;
  if (llmClarificationEnabled) {
    const convo = await buildKaelConversationContext(client, sessionId);
    conversationContext = convo.context;
    priorClarificationCount = convo.clarificationCount;
  }

  const requestId = crypto.randomUUID();
  let pipeline: PipelineResult;
  try {
    await updateKaelProgress(client, progressTarget, {
      stage: "intent_classification",
      status: "queued",
      progress: 0,
    });
    pipeline = await runKaelPipeline(
      {
        serviceType: input.service_type,
        problemChips: problemChips.length > 0 ? problemChips : [input.service_type],
        description: message,
        district,
        photoUrls: input.photo_urls ?? [],
        intakeDiagnosisEnabled: llmClarificationEnabled,
        conversationContext,
        clarificationCount: priorClarificationCount,
        progressTarget,
      },
      client,
      sourceTrustSecretsForRequest(secrets, ctx),
    );
  } catch {
    await updateKaelProgress(client, progressTarget, {
      stage: "intent_classification",
      status: "failed",
      progress: 0,
      failureReason: "pipeline_error",
    });
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "error",
      text: "Kael chưa thể phân tích lúc này. Bạn thử gửi lại sau ít phút.",
      nextStatus: "active",
    });
    return;
  }

  await logApiCalls(
    client,
    pipeline.stageLogs
      .filter((stage) => stage.provider && stage.model)
      .map((stage) => ({
        job_id: null,
        request_id: requestId,
        purpose: apiLogPurposeForPipelineStage(stage.stage),
        provider: stage.provider,
        model: stage.model,
        input_tokens: stage.inputTokens ?? null,
        output_tokens: stage.outputTokens ?? null,
        cost_usd: stage.costUsd ?? null,
        latency_ms: stage.latencyMs,
        success: stage.success,
        error_code: stage.failureReason ?? null,
        safe_metadata: {
          surface: "kael_chat",
          session_id: sessionId,
          ...(stage.cacheStatus ? { cache_status: stage.cacheStatus } : {}),
          ...(stage.safeMetadata ?? {}),
        },
      })),
  );

  if (!pipeline.success) {
    // Smart clarification (2026-06-04): intake-diagnosis asked for ONE specific
    // missing detail. Self-check the AI question before showing it (RULES.md #3);
    // fall back to a safe template if it fails screening — never raw AI text.
    if (pipeline.code === "NEEDS_CLARIFICATION") {
      const checked = runKaelSelfCheckPipeline({
        text: pipeline.clarification?.question ?? "",
        actor: "customer",
        language: "vi",
        semanticGuardEnabled: true,
        fallbackText:
          "Bạn mô tả rõ hơn vấn đề đang gặp: vị trí, dấu hiệu và mức độ ảnh hưởng trong căn hộ.",
      });
      if (checked.used_fallback || !checked.allowed) {
        await auditGuardrailTripBestEffort(client, {
          jobId: null,
          actorId: ctx.user.id,
          actorRole: "customer",
          surface: "kael_chat_clarification",
          reason: checked.reason ?? "self_check",
          guardrailLabel: checked.guardrailLabel ?? null,
          source: checked.reason === "semantic_guardrail"
            ? "semantic_self_check"
            : "self_check",
          safeMetadata: {
            session_id: sessionId,
            clarification_source: "ai",
          },
        });
      }
      const missingSlots = pipeline.clarification?.missingSlots ?? [];
      const sentiment = pipeline.clarification?.customerSentiment;
      await appendKaelSystemTurn(client, sessionId, {
        contentType: "clarification",
        text: checked.text,
        nextStatus: "active",
        metadata: {
          artifact_proposal: buildKaelMissingInfoArtifactProposal({
            missingFields: missingSlots.length > 0 ? missingSlots : ["description"],
            question: checked.text,
            confidence: 0.4,
            artifactType: "ai_notes",
          }),
          clarification_source: checked.used_fallback ? "fallback" : "ai",
          ...(sentiment ? { customer_sentiment: sentiment } : {}),
        },
        ...(sentiment
          ? { sessionMetadata: { last_customer_sentiment: sentiment } }
          : {}),
      });
      await updateKaelProgress(client, progressTarget, {
        stage: "clarification",
        status: "completed",
        progress: 1,
      });
      return;
    }
    if (pipeline.code === "SERVICE_MISMATCH") {
      const suggested = pipeline.suggestedService;
      const mismatchText = suggested
        ? `Mô tả của bạn nghiêng về dịch vụ ${kaelServiceLabelVi(suggested)}. Bạn quay lại chọn đúng dịch vụ để Kael ước tính chính xác.`
        : "Mô tả của bạn không khớp với dịch vụ đang chọn. Bạn quay lại chọn đúng dịch vụ phù hợp để Kael ước tính.";
      await appendKaelSystemTurn(client, sessionId, {
        contentType: "error",
        text: mismatchText,
        nextStatus: "unsupported",
        metadata: {
          boundary_reason: "service_mismatch_llm",
          ...(suggested ? { suggested_service: suggested } : {}),
        },
      });
      await updateKaelProgress(client, progressTarget, {
        stage: "intent_classification",
        status: "failed",
        progress: 1,
        failureReason: "service_mismatch",
      });
      return;
    }
    const clarificationText = pipeline.code === "UNSUPPORTED"
      ? pipeline.error
      : "Kael chưa đủ dữ liệu an toàn để ước tính. Bạn mô tả thêm hoặc gửi ảnh rõ hơn.";
    await appendKaelSystemTurn(client, sessionId, {
      contentType: pipeline.code === "UNSUPPORTED" ? "error" : "clarification",
      text: clarificationText,
      nextStatus: "active",
      metadata: pipeline.code === "UNSUPPORTED"
        ? undefined
        : {
          artifact_proposal: buildKaelMissingInfoArtifactProposal({
            missingFields: ["description_or_photo"],
            question: clarificationText,
            confidence: 0.35,
            artifactType: "ai_notes",
          }),
        },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: pipeline.code === "UNSUPPORTED" ? "intent_classification" : "clarification",
      status: pipeline.code === "UNSUPPORTED" ? "failed" : "completed",
      progress: 1,
      failureReason: pipeline.code === "UNSUPPORTED" ? "unsupported" : undefined,
    });
    return;
  }

  const costUsd = pipeline.stageLogs.reduce(
    (sum, stage) => sum + (stage.costUsd ?? 0),
    0,
  );
  const estimate = pipeline.estimate;
  const estimateCardV3 = buildEstimateCardOutput({
    estimate,
    priceSource: estimatePriceSourceFromStageLogs(pipeline.stageLogs),
    baselineUsed:
      `${input.service_type}:${pipeline.serviceProblemId}:${estimate.complexity}`,
  });
  await appendKaelSystemTurn(client, sessionId, {
    contentType: "estimate",
    text: formatKaelEstimateText(estimate),
    nextStatus: "estimate_ready",
    estimate,
    costUsd,
    metadata: {
      estimate,
      estimate_card_v3: estimateCardV3,
      artifact_proposal: estimateCardV3.artifact_proposal,
      fallback_used: pipeline.fallbackUsed,
      service_problem_id: pipeline.serviceProblemId,
      photo_count: input.photo_urls?.length ?? 0,
      budget_soft_cap_reached:
        currentCostUsd + costUsd >= KAEL_CHAT_SOFT_COST_CAP_USD,
    },
    ...(pipeline.customerSentiment
      ? { sessionMetadata: { last_customer_sentiment: pipeline.customerSentiment } }
      : {}),
  });
}

// Smart clarification (2026-06-04): build a compact, PII-scrubbed conversation
// context from recent turns and count prior Kael clarification questions so the
// pipeline can cap re-asks (STRUCTURES.md A4 "ask 0-2 questions").
async function buildKaelConversationContext(
  client: DbClient,
  sessionId: string,
): Promise<{ context: string | undefined; clarificationCount: number }> {
  const turnsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_chat_turns")
      .select("turn_index, role, content_type, text_content")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true }),
  );
  const rows = turnsResult.data ?? [];
  const clarificationCount = rows.filter((row) =>
    asString(row.content_type) === "clarification" &&
    asKaelTurnRole(row.role) !== "customer"
  ).length;
  const recent = rows
    .map((row) => ({
      role: asKaelTurnRole(row.role),
      text: nullableString(row.text_content),
    }))
    .filter((turn): turn is { role: KaelChatTurnRole; text: string } =>
      Boolean(turn.text)
    )
    .slice(-8)
    .map((turn) => `${turn.role === "customer" ? "khách" : "kael"}: ${turn.text}`);
  return {
    context: recent.length > 0 ? recent.join("\n") : undefined,
    clarificationCount,
  };
}

function kaelServiceLabelVi(service: string): string {
  return service === "electrical"
    ? "sửa điện"
    : service === "plumbing"
    ? "sửa nước"
    : "vệ sinh nhà";
}

function asKaelStoredSentiment(
  value: unknown,
): "neutral" | "detail_oriented" | "pressure" | undefined {
  return value === "neutral" || value === "detail_oriented" || value === "pressure"
    ? value
    : undefined;
}

async function getKaelChatCostUsd(
  client: DbClient,
  sessionId: string,
): Promise<number> {
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, total_cost_usd")
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  return asNumber(sessionResult.data.total_cost_usd);
}

async function appendKaelSystemTurn(
  client: DbClient,
  sessionId: string,
  input: {
    contentType: "clarification" | "estimate" | "error";
    text: string;
    nextStatus: "active" | "estimate_ready" | "unsupported";
    estimate?: unknown;
    costUsd?: number;
    metadata?: Record<string, unknown>;
    sessionMetadata?: Record<string, unknown>;
  },
) {
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, total_turns, total_cost_usd, safe_metadata")
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  const nextIndex = asNumber(sessionResult.data.total_turns) + 1;
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: nextIndex,
    role: "kael",
    content_type: input.contentType,
    text_content: input.text,
    media_refs: [],
    safe_metadata: input.metadata ?? {},
    cost_usd: input.costUsd ?? null,
  });
  const sessionUpdate: Record<string, unknown> = {
    total_turns: nextIndex,
    total_cost_usd: asNumber(sessionResult.data.total_cost_usd) +
      (input.costUsd ?? 0),
    status: input.nextStatus,
  };
  if (input.nextStatus === "estimate_ready") {
    sessionUpdate.estimate_ready_at = new Date().toISOString();
  }
  if (input.sessionMetadata) {
    sessionUpdate.safe_metadata = compactMetadata({
      ...asRecord(sessionResult.data.safe_metadata),
      ...input.sessionMetadata,
    });
  }
  await updateKaelSession(client, sessionId, sessionUpdate);
}

async function insertKaelTurn(
  client: DbClient,
  value: Record<string, unknown>,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_turns")
      .insert(value)
      .select("id")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể lưu lượt chat Kael", 500);
  }
  return result.data;
}

async function updateKaelSession(
  client: DbClient,
  sessionId: string,
  value: Record<string, unknown>,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .update(value)
      .eq("id", sessionId)
      .select("id")
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể cập nhật phiên Kael", 500);
  }
}

async function getJob(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select: JOB_DETAIL_SELECT,
  });
  const broadcastState = job.status === "broadcasting"
    ? await getJobBroadcastState(client, jobId)
    : null;
  const currentScopeChange = job.status === "scope_change_pending"
    ? await getCurrentScopeChange(client, jobId)
    : null;
  const addressProjection = projectAddressAccess(job, ctx.role);
  const worker = await getJobWorkerSummary(client, nullableString(job.worker_id));

  return {
    job: {
      id: asString(job.id),
      display_code: nullableString(job.display_code) ?? buildJobDisplayCode({
        jobId: asString(job.id),
        customerId: nullableString(job.customer_id),
        createdAt: nullableString(job.created_at),
      }),
      status: asJobStatus(job.status),
      service_type: asServiceType(job.service_type),
      description: asString(job.description),
      problem_chips: asStringArray(job.problem_chips),
      photo_urls: asStringArray(job.photo_urls),
      address_building: addressProjection.fullAddress.building,
      address_unit: addressProjection.fullAddress.unit,
      address_floor: addressProjection.fullAddress.floor,
      address_district: addressProjection.fullAddress.district,
      address_access: addressProjection.addressAccess,
      scheduled_at: nullableString(job.scheduled_at),
      kael_problem_identified: nullableString(job.kael_problem_identified),
      kael_complexity: nullableComplexity(job.kael_complexity),
      kael_price_min: nullableNumber(job.kael_price_min),
      kael_price_max: nullableNumber(job.kael_price_max),
      kael_advisory: nullableString(job.kael_advisory),
      kael_estimate_card_v3: nullableRecord(job.kael_estimate_card_v3),
      kael_worker_brief_core: nullableRecord(job.kael_worker_brief_core),
      kael_worker_brief_guidance: nullableRecord(job.kael_worker_brief_guidance),
      kael_progress: parseKaelProgressSnapshot(job.kael_progress, jobId),
      final_price: nullableNumber(job.final_price),
      payment_provider: nullableString(job.payment_provider),
      payment_status: asPaymentStatus(job.payment_status),
      payment_code: nullableString(job.payment_code),
      payment_transfer_content: nullableString(job.payment_transfer_content),
      payment_qr_image_url: nullableString(job.payment_qr_image_url),
      payment_expires_at: nullableString(job.payment_expires_at),
      payment_received_at: nullableString(job.payment_received_at),
      payment_amount_received: nullableNumber(job.payment_amount_received),
      gross_amount: nullableNumber(job.gross_amount),
      platform_fee: nullableNumber(job.platform_fee),
      worker_net: nullableNumber(job.worker_net),
      completion_notes: nullableString(job.completion_notes),
      completion_photo_urls: asStringArray(job.completion_photo_urls),
      created_at: asString(job.created_at),
      matched_at: nullableString(job.matched_at),
      arrived_at: nullableString(job.arrived_at),
      completed_at: nullableString(job.completed_at),
      confirmed_at: nullableString(job.confirmed_at),
      paid_at: nullableString(job.paid_at),
      reviewed_at: nullableString(job.reviewed_at),
    },
    worker,
    broadcast_state: broadcastState,
    current_scope_change: currentScopeChange,
  };
}

async function getJobWorkerSummary(
  client: DbClient,
  workerId: string | null,
): Promise<JobWorkerSummary | null> {
  if (!workerId) return null;

  const accountProfile = await dbQuery<Record<string, unknown>>(
    client
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", workerId)
      .maybeSingle(),
  );
  if (accountProfile.error) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 t\u1ea3i h\u1ed3 s\u01a1 th\u1ee3", 500);
  }

  const workerProfile = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_profiles")
      .select("rating, total_jobs")
      .eq("id", workerId)
      .maybeSingle(),
  );
  if (workerProfile.error) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 t\u1ea3i h\u1ed3 s\u01a1 th\u1ee3", 500);
  }

  const reviewCount = await dbQuery(
    client
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("worker_id", workerId),
  );
  if (reviewCount.error) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 t\u1ea3i \u0111\u00e1nh gi\u00e1 th\u1ee3", 500);
  }

  if (!accountProfile.data && !workerProfile.data) return null;

  return {
    id: workerId,
    display_code: buildWorkerDisplayCode(workerId),
    full_name: nullableString(accountProfile.data?.full_name) ?? "Th\u1ee3 NestScout",
    avatar_url: nullableString(accountProfile.data?.avatar_url),
    rating: workerProfile.data ? asNumber(workerProfile.data.rating) : 0,
    review_count: reviewCount.count ?? 0,
    total_jobs: workerProfile.data ? asNumber(workerProfile.data.total_jobs) : 0,
  };
}

// X4 (Plan.md §27.7 — 2026-05-29): F-17 fix. Customer mobile must resume an
// active job from the backend after a refresh / cold start instead of showing
// "Chưa có yêu cầu". Returns the customer's most-recent non-terminal job (same
// shape as GET /jobs/:id) or null when none is active.
const CUSTOMER_ACTIVE_JOB_STATUSES: JobStatus[] = [
  "awaiting_customer_confirm",
  "broadcasting",
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
  "confirmed_by_customer",
  "payment_pending",
];

async function listCustomerActiveJobs(ctx: MobileApiContext) {
  const client = db(ctx);
  const result = await dbQuery<Array<{ id: string }>>(
    client
      .from("jobs")
      .select("id")
      .eq("customer_id", ctx.user.id)
      .in("status", CUSTOMER_ACTIVE_JOB_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải yêu cầu đang hoạt động", 500);
  }
  const row = result.data?.[0];
  if (!row) return { active_job: null };
  const detail = await getJob(ctx, row.id);
  return { active_job: detail };
}

async function confirmSearch(
  ctx: MobileApiContext,
  jobId: string,
  options: ConfirmSearchOptions = {},
) {
  const client = db(ctx);
  const now = new Date().toISOString();
  let rollbackStatus: JobStatus | null = null;
  const autonomyDecision = options.autonomyDecision;
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select:
      "id, status, customer_id, worker_id, service_type, address_district, kael_problem_identified, kael_price_min, kael_price_max, final_price",
  });

  // Phase 2.0 (2026-05-23): lock jobs.final_price = kael_price_max as initial
  // Kael baseline (only if not already locked, e.g. retry). Worker không có
  // authority để override; chỉ A11 Kael scope decision re-locks từ Kael compute mới.
  const kaelPriceMax = nullableNumber(job.kael_price_max);
  const lockedFinalPrice = nullableNumber(job.final_price) ?? kaelPriceMax;

  const district = normalizeServiceAreaDistrict(
    nullableString(job.address_district) ?? "",
  );
  if (!district) {
    apiFailure(
      "VALIDATION",
      "Địa chỉ cần có quận TP.HCM rõ ràng",
      400,
    );
  }

  if (job.status === "broadcasting") {
    await expireStaleBroadcasts(client, jobId, now);
    if (await hasActiveBroadcast(client, jobId, now)) {
      apiFailure(
        "BROADCAST_ACTIVE",
        "Yêu cầu đang được gửi đến thợ. Vui lòng chờ phản hồi hiện tại.",
        409,
      );
    }
    if (!(await acquireBroadcastRetryLease(client, jobId, ctx.user.id, now))) {
      apiFailure(
        "BROADCAST_ACTIVE",
        "Yêu cầu đang được gửi đến thợ. Vui lòng chờ phản hồi hiện tại.",
        409,
      );
    }
    await logJobEvent(
      client,
      jobId,
      "customer_retried_search",
      ctx,
      "broadcasting",
      "broadcasting",
    );
  } else {
    if (lockedFinalPrice === null || lockedFinalPrice <= 0) {
      apiFailure(
        "KAEL_PRICE_MISSING",
        "Kael chưa chốt được giá tạm tính nên chưa thể tìm thợ",
        409,
      );
    }
    const transition = autonomyDecision
      ? validateKaelAutonomyTransition({
        decision: autonomyDecision,
        from: job.status as JobStatus,
        to: "broadcasting",
      })
      : validateWorkflowTransition({
        event: "customer_confirmed_ticket",
        from: job.status as JobStatus,
        to: "broadcasting",
      });
    if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
    rollbackStatus = job.status as JobStatus;
    const workerBriefCore = buildWorkerBriefOutput({
      stage: "core",
      serviceType: asServiceType(job.service_type),
      problemSummary:
        nullableString(job.kael_problem_identified) ?? "Yêu cầu cần thợ kiểm tra",
      district: nullableString(job.address_district),
      estimatedEarningMin: nullableNumber(job.kael_price_min) === null
        ? null
        : Math.round(nullableNumber(job.kael_price_min)! * (1 - PLATFORM_FEE_WORKER)),
      estimatedEarningMax: lockedFinalPrice === null
        ? null
        : Math.round(lockedFinalPrice * (1 - PLATFORM_FEE_WORKER)),
    });

    const updated = await dbQuery<{ id: string }>(
      client
        .from("jobs")
        .update({
          status: "broadcasting",
          broadcast_at: now,
          confirmed_search_at: now,
          final_price: lockedFinalPrice,
          kael_worker_brief_core: workerBriefCore,
        })
        .eq("id", jobId)
        .eq("customer_id", ctx.user.id)
        .eq("status", job.status)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error) apiFailure("DB_ERROR", "Không thể bắt đầu tìm thợ", 500);
    if (!updated.data) {
      apiFailure(
        "STATUS_CHANGED",
        "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
        409,
      );
    }

    await logJobEvent(
      client,
      jobId,
      autonomyDecision ? "kael_started_matching" : "customer_confirmed_search",
      ctx,
      job.status as JobStatus,
      "broadcasting",
      autonomyDecision ? { autonomy_decision: autonomyDecision } : {},
    );
  }

  const broadcast = await createBroadcasts(
    client,
    jobId,
    job.service_type as ServiceType,
    district,
  );
  if (!broadcast.success) {
    if (broadcast.reasonCode === "DB_ERROR") {
      if (rollbackStatus) {
        const rolledBack = await rollbackFailedBroadcastStart(
          client,
          jobId,
          ctx.user.id,
          rollbackStatus,
        );
        if (!rolledBack) {
          apiFailure(
            "DB_ERROR",
            "Không thể khôi phục yêu cầu sau lỗi gửi thợ",
            500,
          );
        }
        await logJobEvent(
          client,
          jobId,
          "broadcast_start_failed",
          ctx,
          "broadcasting",
          rollbackStatus,
          {
            reason: broadcast.reason,
            ...(autonomyDecision ? { autonomy_decision: autonomyDecision } : {}),
          },
        );
      }
      apiFailure("DB_ERROR", "Không thể gửi yêu cầu đến thợ", 500);
    }
    await logJobEvent(
      client,
      jobId,
      "no_worker_found",
      ctx,
      "broadcasting",
      null,
      {
        reason: broadcast.reason,
        district,
        service_type: job.service_type,
        ...(autonomyDecision ? { autonomy_decision: autonomyDecision } : {}),
      },
    );
    // Phase 2.3 (2026-05-23): notify customer when no eligible worker accepted.
    await insertUserNotification(client, {
      userId: ctx.user.id,
      jobId,
      eventType: "no_worker_found",
      title: "Chưa có thợ phù hợp",
      body: "Kael sẽ tiếp tục theo dõi và báo lại khi có thợ.",
      metadata: { district, service_type: asString(job.service_type) },
    });
    return {
      job_id: jobId,
      status: "broadcasting" as JobStatus,
      broadcast_sent: false,
      worker: null,
      message: broadcast.reason,
    };
  }

  await logJobEvent(
    client,
    jobId,
    "broadcast_sent",
    ctx,
    "broadcasting",
    null,
    {
      batch_id: broadcast.batchId,
      worker_count: broadcast.broadcastCount,
      ...(autonomyDecision ? { autonomy_decision: autonomyDecision } : {}),
    },
  );

  return {
    job_id: jobId,
    status: "broadcasting" as JobStatus,
    broadcast_sent: true,
    worker: null,
    message:
      `Đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ. Đang chờ phản hồi.`,
  };
}

async function rollbackFailedBroadcastStart(
  client: DbClient,
  jobId: string,
  customerId: string,
  previousStatus: JobStatus,
): Promise<boolean> {
  const result = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({
        status: previousStatus,
        broadcast_at: null,
        confirmed_search_at: null,
      })
      .eq("id", jobId)
      .eq("customer_id", customerId)
      .eq("status", "broadcasting")
      .select("id")
      .maybeSingle(),
  );
  return !result.error && Boolean(result.data);
}

async function cancelJob(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id",
  });
  const transition = validateWorkflowTransition({
    event: "cancel_requested",
    from: job.status as JobStatus,
    to: "cancelled",
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("cancel_job_before_accept_atomic", {
      p_job_id: jobId,
      p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể hủy yêu cầu", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể hủy yêu cầu", 500);
  if (!row.ok) mapCancelError(nullableString(row.error_code));

  await logJobEvent(
    client,
    jobId,
    "customer_cancelled_before_accept",
    ctx,
    job.status as JobStatus,
    "cancelled",
  );
  return { job_id: jobId, status: row.job_status as JobStatus };
}

async function requestCustomerCancellation(
  ctx: MobileApiContext,
  jobId: string,
  input: CustomerCancellationRequestInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id, worker_id, scheduled_at",
  });
  const readExistingCancellation = async (jobStatus: JobStatus) => {
    const existing = await dbQuery<Record<string, unknown>>(
      client
        .from("customer_cancellation_records")
        .select(
          "id, status, job_id, sub_case, reason_code, reason_category, worker_id, admin_review_required, phase0_no_monetary_penalty, worker_goodwill, abuse_signals, created_at",
        )
        .eq("job_id", jobId)
        .eq("customer_id", ctx.user.id)
        .in("status", ["requested", "dispute_pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (existing.error || !existing.data) return null;

    const subCase = asCustomerCancellationSubCase(existing.data.sub_case);
    const reasonCode = nullableString(existing.data.reason_code) ?? input.reason_code;
    return {
      cancellation_id: asString(existing.data.id),
      job_id: jobId,
      status: "requested" as const,
      job_status: jobStatus,
      sub_case: subCase,
      reason_code: reasonCode,
      reason_category: nullableString(existing.data.reason_category) ?? "needs_admin_review",
      admin_review_required: asBoolean(existing.data.admin_review_required),
      phase0_no_monetary_penalty: asBoolean(existing.data.phase0_no_monetary_penalty),
      worker_goodwill: nullableRecord(existing.data.worker_goodwill) ??
        buildCustomerCancellationPhase0Outcome({
          subCase,
          reasonCode,
          workerId: nullableString(existing.data.worker_id),
        }).workerGoodwill,
      abuse_signals: asCustomerCancellationAbuseSignals(existing.data.abuse_signals),
      message: "Yêu cầu hủy đang được xử lý.",
      created_at: asString(existing.data.created_at),
    };
  };
  const command = validateWorkflowCommand({
    event: "customer_cancellation_requested",
    status: job.status as JobStatus,
  });
  if (!command.valid) {
    const existing = await readExistingCancellation(job.status as JobStatus);
    if (existing) return existing;
    apiFailure("INVALID_STATUS", command.error, 409);
  }
  const existingCancellation = await readExistingCancellation(job.status as JobStatus);
  if (existingCancellation) return existingCancellation;

  const cancellationPreview = previewCustomerCancellation(job);
  if (!cancellationPreview) {
    apiFailure("INVALID_STATUS", "Cannot determine safe cancellation flow", 409);
  }
  const preAutonomy = await gateCustomerCancellationBeforeMutation({
    client,
    ctx,
    job,
    jobId,
    preview: cancellationPreview,
    request: input,
  });

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("request_customer_cancellation_atomic", {
      p_job_id: jobId,
      p_customer_id: ctx.user.id,
      p_reason_code: input.reason_code,
      p_reason_note: input.reason_note ?? null,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy", 500);
  if (!row.ok) {
    const errorCode = nullableString(row.error_code);
    if (errorCode === "ALREADY_REQUESTED") {
      const existing = await readExistingCancellation(asJobStatus(row.job_status ?? job.status));
      if (existing) return existing;
    }
    mapCustomerCancellationError(errorCode);
  }

  const cancellationId = asString(row.cancellation_id);
  const subCase = asCustomerCancellationSubCase(row.sub_case);
  const reasonCode = nullableString(row.reason_code) ?? input.reason_code;
  const localClassification = classifyCustomerCancellationReason({
    reasonCode,
    reason: input.reason_note ?? reasonCode,
  });
  const reasonCategory = nullableString(row.reason_category) ??
    localClassification.category;
  const abuseSignals = asCustomerCancellationAbuseSignals(row.abuse_signals);
  const abuse = customerCancellationAbuseFromSignals(abuseSignals);
  const adminReviewRequired = asBoolean(row.admin_review_required) ||
    localClassification.adminReviewRequired ||
    abuse.adminReviewRequired ||
    subCase === "after_worker_completed_trigger_dispute";
  const workerIdFromRow = nullableString(row.worker_id_out);
  const phase0Outcome = buildCustomerCancellationPhase0Outcome({
    subCase,
    reasonCode,
    workerId: workerIdFromRow,
  });
  const workerGoodwill = nullableRecord(row.worker_goodwill) ??
    phase0Outcome.workerGoodwill;
  const jobStatus = row.job_status as JobStatus | undefined;
  const resultingJobStatus = jobStatus ?? "cancelled";
  const autonomyDecision = preAutonomy?.decision ?? null;
  const autonomyRun = preAutonomy?.run ?? null;

  await logJobEvent(
    client,
    jobId,
    "customer_requested_cancellation",
    ctx,
    null,
    jobStatus ?? null,
    {
      cancellation_id: cancellationId,
      sub_case: subCase,
      reason_code: reasonCode,
      reason_category: reasonCategory,
      abuse_signals: abuseSignals,
      admin_review_required: adminReviewRequired,
      phase0_no_monetary_penalty: true,
      worker_goodwill: workerGoodwill,
      ...(autonomyDecision
        ? {
          autonomy_decision: autonomyDecision,
          autonomy_gate_result: autonomyRun?.gate.result ?? null,
          autonomy_transition_valid: autonomyRun?.gate.result === "allow",
          ...(autonomyRun?.gate.result !== "allow"
            ? { autonomy_transition_error: autonomyRun?.gate.audit.reason_code ?? "AUTONOMY_GATE_NOT_RUN" }
            : {}),
        }
        : {}),
    },
  );
  if (autonomyDecision && autonomyRun?.gate.result === "allow") {
    await logJobEvent(
      client,
      jobId,
      "kael_processed_cancellation",
      ctx,
      job.status as JobStatus,
      resultingJobStatus,
      {
        cancellation_id: cancellationId,
        sub_case: subCase,
        autonomy_decision: autonomyDecision,
      },
    );
  }

  const participants = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select("customer_id, worker_id")
      .eq("id", jobId)
      .maybeSingle(),
  );
  const customerId = nullableString(participants.data?.customer_id) ?? ctx.user.id;
  const workerId = workerIdFromRow ?? nullableString(participants.data?.worker_id);

  await recordCustomerCancellationReview(client, {
    jobId,
    customerId,
    workerId,
    cancellationId,
    reason: input.reason_note ?? reasonCode,
    subCase,
    classification: {
      ...localClassification,
      reasonCode: localClassification.reasonCode,
      category: reasonCategory as typeof localClassification.category,
      adminReviewRequired,
    },
    abuse,
    phase0Outcome,
  }).catch(() => {
    console.warn("mobile-api customer cancellation review write failed", {
      jobId,
      cancellationId,
    });
  });

  if (workerId && (subCase === "after_worker_accept" || subCase === "scheduled_job")) {
    await notifyWorkerCustomerCancellation(client, jobId, workerId, subCase);
  }

  return {
    cancellation_id: cancellationId,
    job_id: jobId,
    status: "requested" as const,
    job_status: resultingJobStatus,
    sub_case: subCase,
    reason_code: reasonCode,
    reason_category: reasonCategory,
    admin_review_required: adminReviewRequired,
    phase0_no_monetary_penalty: true,
    worker_goodwill: workerGoodwill,
    abuse_signals: abuseSignals,
    message: subCase === "after_worker_completed_trigger_dispute"
      ? "Đã ghi nhận hủy sau hoàn tất để chuyển sang kiểm tra tranh chấp."
      : "Đã ghi nhận yêu cầu hủy. Phase 0 không tự tính phí hủy.",
    created_at: asString(row.created_at_ts),
  };
}

async function openDispute(
  ctx: MobileApiContext,
  jobId: string,
  input: DisputeOpenRequestInput,
) {
  const client = db(ctx);
  const localDecision = determineDisputeSubCase({
    disputeType: input.dispute_type as DisputeType,
    jobStatus: "unknown",
  });
  const neutralSummary = buildNeutralDisputeSummary({
    disputeType: input.dispute_type as DisputeType,
    initiatedBy: ctx.role,
    initiatorStatement: input.initiator_statement,
    evidenceCounts: {
      chatMessages: 0,
      photoUrls: input.evidence_photo_urls.length,
      statusEvents: 0,
      scopeChanges: 0,
      kaelArtifacts: 0,
    },
  });
  const neutrality = assertNeutralDisputeLanguage(neutralSummary);
  if (!neutrality.ok) {
    apiFailure("KAEL_NEUTRALITY_GUARD", "Kael chỉ tóm tắt trung lập cho admin", 500);
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("open_dispute_atomic", {
      p_job_id: jobId,
      p_initiated_by_id: ctx.user.id,
      p_initiated_by: ctx.role,
      p_dispute_type: input.dispute_type,
      p_initiator_statement: input.initiator_statement,
      p_evidence_photo_urls: input.evidence_photo_urls,
      p_kael_neutral_summary: neutralSummary,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể mở kiểm tra tranh chấp", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể mở kiểm tra tranh chấp", 500);
  if (!row.ok) mapDisputeOpenError(nullableString(row.error_code));

  const disputeId = asString(row.dispute_id);
  const evidenceSnapshotId = asString(row.evidence_snapshot_id);
  const status = nullableString(row.dispute_status) ?? "open";
  const priority = asDisputePriority(row.priority) ?? localDecision.priority;
  const evidenceLockedAt = asString(row.evidence_locked_at);
  const createdAt = asString(row.created_at_ts);

  await logJobEvent(
    client,
    jobId,
    "dispute_opened",
    ctx,
    null,
    null,
    {
      dispute_id: disputeId,
      dispute_type: input.dispute_type,
      evidence_snapshot_id: evidenceSnapshotId,
      priority,
      kael_neutral: true,
      sub_case: localDecision.subCase,
      deferred_phase0: localDecision.deferred,
    },
  );

  return {
    dispute_id: disputeId,
    job_id: jobId,
    status,
    dispute_type: input.dispute_type,
    evidence_snapshot_id: evidenceSnapshotId,
    admin_review_required: asBoolean(row.admin_review_required) ||
      localDecision.adminReviewRequired,
    priority,
    evidence_locked_at: evidenceLockedAt,
    message: localDecision.deferred
      ? "Kael đã khóa bằng chứng và chuyển admin xem xét; thanh toán được hoãn trong Phase 0."
      : "Kael đã khóa bằng chứng và chuyển admin xem xét trung lập.",
    created_at: createdAt,
  };
}

async function submitDisputeCounterStatement(
  ctx: MobileApiContext,
  disputeId: string,
  input: DisputeCounterStatementInput,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("submit_counter_statement_atomic", {
      p_dispute_id: disputeId,
      p_actor_id: ctx.user.id,
      p_statement: input.statement,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể gửi phản hồi tranh chấp", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi phản hồi tranh chấp", 500);
  if (!row.ok) mapDisputeCounterError(nullableString(row.error_code));

  return {
    dispute_id: asString(row.dispute_id) || disputeId,
    status: nullableString(row.dispute_status) ?? "admin_review",
    counter_party_statement_submitted: true,
    updated_at: asString(row.updated_at_ts),
  };
}

async function decideDispute(
  ctx: MobileApiContext,
  disputeId: string,
  input: DisputeAdminDecisionInput,
) {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được quyết định tranh chấp", 403);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("admin_decide_dispute_atomic", {
      p_dispute_id: disputeId,
      p_admin_id: ctx.user.id,
      p_outcome: input.outcome,
      p_refund_amount: input.refund_amount ?? null,
      p_worker_credit_amount: input.worker_credit_amount ?? null,
      p_customer_trust_impact: input.customer_trust_impact,
      p_worker_action: input.worker_action,
      p_reasoning: input.reasoning,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể ghi quyết định tranh chấp", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể ghi quyết định tranh chấp", 500);
  if (!row.ok) mapDisputeDecisionError(nullableString(row.error_code));

  return {
    dispute_id: asString(row.dispute_id) || disputeId,
    status: nullableString(row.dispute_status) ?? "admin_decided",
    outcome: input.outcome,
    decided_at: asString(row.decided_at_ts),
  };
}

async function acceptBroadcast(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("accept_broadcast_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
  if (!row.ok) {
    if (row.error_code === "EXPIRED") {
      await logJobEvent(client, jobId, "broadcast_expired", ctx, null, null, {
        reason: "EXPIRED via RPC",
      });
    }
    mapAcceptError(nullableString(row.error_code));
  }
  const transition = validateWorkflowTransition({
    event: "worker_accepted",
    from: "broadcasting",
    to: asJobStatus(row.job_status),
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  await logJobEvent(
    client,
    jobId,
    "worker_accepted",
    ctx,
    "broadcasting",
    "worker_matched",
  );
  await notifyCustomerWorkerMatched(client, jobId, ctx.user.id);
  await persistWorkerBriefGuidanceAfterAccept(client, jobId, row);
  const addressProjection = projectAddressAccess(row, ctx.role, {
    forcedStage: "building_released",
  });
  return {
    job_id: jobId,
    status: row.job_status as JobStatus,
    full_address: addressProjection.fullAddress,
    address_access: addressProjection.addressAccess,
  };
}

async function persistWorkerBriefGuidanceAfterAccept(
  client: DbClient,
  jobId: string,
  acceptedRow: Record<string, unknown>,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select(
        "id, status, service_type, kael_problem_identified, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state, kael_price_min, kael_price_max, final_price",
      )
      .eq("id", jobId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return;

  const job = result.data;
  const finalPrice = nullableNumber(job.final_price) ??
    nullableNumber(job.kael_price_max);
  const priceMin = nullableNumber(job.kael_price_min);
  const addressProjection = projectAddressAccess(
    {
      ...job,
      address_building: nullableString(acceptedRow.address_building) ??
        nullableString(job.address_building),
      address_floor: nullableString(acceptedRow.address_floor) ??
        nullableString(job.address_floor),
      address_unit: nullableString(acceptedRow.address_unit) ??
        nullableString(job.address_unit),
      address_district: nullableString(acceptedRow.address_district) ??
        nullableString(job.address_district),
    },
    "worker",
    { forcedStage: "building_released" },
  );
  const guidance = buildWorkerBriefOutput({
    stage: "guidance",
    serviceType: asServiceType(job.service_type),
    problemSummary:
      nullableString(job.kael_problem_identified) ??
        "\u0059\u00eau c\u1ea7u c\u1ea7n th\u1ee3 ki\u1ec3m tra",
    district: nullableString(job.address_district),
    fullAddress: addressProjection.fullAddress,
    estimatedEarningMin: priceMin === null
      ? null
      : Math.round(priceMin * (1 - PLATFORM_FEE_WORKER)),
    estimatedEarningMax: finalPrice === null
      ? null
      : Math.round(finalPrice * (1 - PLATFORM_FEE_WORKER)),
  });

  await dbQuery(
    client
      .from("jobs")
      .update({ kael_worker_brief_guidance: guidance })
      .eq("id", jobId),
  ).catch(() => {
    console.warn("mobile-api worker brief guidance persist failed", { jobId });
  });
}

async function declineBroadcast(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("job_broadcasts")
      .select("id, status, expires_at, jobs(status)")
      .eq("job_id", jobId)
      .eq("worker_id", ctx.user.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Yêu cầu này không dành cho bạn", 404);
  }
  if (result.data.status !== "sent") {
    apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
  }
  const parentJob = relatedJob(result.data.jobs);
  if (!parentJob || parentJob.status !== "broadcasting") {
    apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
  }

  const now = new Date().toISOString();
  const expiresAt = nullableString(result.data.expires_at);
  if (expiresAt && expiresAt <= now) {
    const expired = await dbQuery<{ id: string }>(
      client
        .from("job_broadcasts")
        .update({ status: "expired", responded_at: now })
        .eq("id", result.data.id)
        .eq("status", "sent")
        .select("id")
        .maybeSingle(),
    );
    if (expired.error) {
      apiFailure("DB_ERROR", "Không thể cập nhật broadcast hết hạn", 500);
    }
    if (!expired.data) {
      apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
    }
    await logJobEvent(client, jobId, "broadcast_expired", ctx, null, null);
    apiFailure("EXPIRED", "Yêu cầu đã hết hạn", 410);
  }

  const update = await dbQuery<{ id: string }>(
    client
      .from("job_broadcasts")
      .update({ status: "declined", responded_at: now })
      .eq("id", result.data.id)
      .eq("status", "sent")
      .select("id")
      .maybeSingle(),
  );
  if (update.error) apiFailure("DB_ERROR", "Lỗi khi từ chối", 500);
  if (!update.data) {
    apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
  }
  await logJobEvent(client, jobId, "worker_declined", ctx, null, null);
  await queueKaelLearningEvent(client, 'post-decline', {
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    job_id: jobId,
    worker_id: ctx.user.id,
    decline_reason: "broadcast_declined",
    feedback_present: false,
  });
  return { job_id: jobId, declined: true as const };
}

async function updateJobStatus(
  ctx: MobileApiContext,
  jobId: string,
  input: WorkerStatusUpdateInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select: "id, status, customer_id, worker_id, final_price, completion_notes, completion_photo_urls, apartment_access_profile, apartment_access_state, address_building, address_unit, address_floor, address_district",
  });
  if (job.status === "scope_change_pending") {
    apiFailure(
      "SCOPE_CHANGE_PENDING",
      "Không thể cập nhật trạng thái khi Kael đang xét thay đổi phạm vi",
      409,
    );
  }
  const transition = validateWorkflowTransition({
    event: input.status === "completed_by_worker" ? "worker_completed" : "worker_status_advanced",
    from: job.status as JobStatus,
    to: input.status,
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: input.status };
  let completionEvidenceForDecision: {
    completion_notes?: string;
    completion_photo_urls?: string[];
  } | null = null;
  let accessReleaseMetadata: Record<string, unknown> | null = null;
  if (transition.timestampColumn) update[transition.timestampColumn] = now;
  if (input.access_check_in) {
    if (input.status !== "arrived") {
      apiFailure("VALIDATION", "D\u1eef li\u1ec7u check-in kh\u00f4ng h\u1ee3p l\u1ec7", 400);
    }
    const accessState = buildUnitReleaseAccessState(
      job.apartment_access_state,
      input.access_check_in,
      now,
    );
    update.apartment_access_state = accessState;
    accessReleaseMetadata = {
      apartment_access_release: true,
      release_stage: "unit_released",
      evidence_mode: input.access_check_in.mode,
    };
  }
  if (input.status === "completed_by_worker") {
    // Phase 2.0 (2026-05-23): jobs.final_price source = Kael (set by A7
    // autonomy decision or latest A11 scope decision). Worker payload không có final_price; preserve
    // existing jobs.final_price từ Kael-locked baseline.
    const completionNotes = (input.completion_notes ?? nullableString(job.completion_notes) ?? "").trim();
    const completionPhotoUrls = mergeLimitedRefs(
      asStringArray(job.completion_photo_urls),
      input.completion_photo_urls ?? [],
      10,
    );
    if (completionNotes.length < 5 || completionPhotoUrls.length === 0) {
      apiFailure(
        "VALIDATION",
        "Cần ghi chú và ảnh hoàn tất trước khi báo hoàn tất",
        400,
      );
    }
    completionEvidenceForDecision = {
      completion_notes: completionNotes,
      completion_photo_urls: completionPhotoUrls,
    };
    update.completion_notes = completionNotes;
    update.completion_photo_urls = completionPhotoUrls;
  }

  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update(update)
      .eq("id", jobId)
      .eq("worker_id", ctx.user.id)
      .eq("status", job.status)
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  }
  if (!updated.data) {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  await logJobEvent(
    client,
    jobId,
    "worker_status_update",
    ctx,
    job.status as JobStatus,
    input.status,
    accessReleaseMetadata ?? {},
  );
  let finalStatus: JobStatus = input.status;
  if (input.status === "completed_by_worker") {
    const completionDecision = buildKaelCompletionDecision(
      jobId,
      completionEvidenceForDecision ?? input,
      nullableNumber(job.final_price),
    );
    if (completionDecision) {
      const completionRun = await runPolicyAutonomyGate({
        label: "worker_evidence_confirm_completion",
        client,
        ctx,
        jobId,
        decision: completionDecision,
        from: "completed_by_worker",
        to: "confirmed_by_customer",
        amountVnd: nullableNumber(job.final_price),
        authority: {
          purpose: "scope_change",
          actor: ctx.role,
          jobRelation: "own_worker_job",
          action: "review_scope_change",
          topic: "job_status",
          actorId: ctx.user.id,
          jobId,
        },
        knownEvidenceReferences: [jobId, "STRUCTURES.md#completion"],
      });
      if (completionRun.gate.result === "allow") {
        const confirmedAt = new Date().toISOString();
        const confirmed = await dbQuery<{ id: string }>(
          client
            .from("jobs")
            .update({ status: "confirmed_by_customer", confirmed_at: confirmedAt })
            .eq("id", jobId)
            .eq("worker_id", ctx.user.id)
            .eq("status", "completed_by_worker")
            .select("id")
            .maybeSingle(),
        );
        if (!confirmed.error && confirmed.data) {
          finalStatus = "confirmed_by_customer";
          await logJobEvent(
            client,
            jobId,
            "kael_confirmed_completion",
            ctx,
            "completed_by_worker",
            "confirmed_by_customer",
            { autonomy_decision: completionDecision },
          );
          await notifyKaelConfirmedCompletion(
            client,
            jobId,
            nullableString(job.customer_id),
            ctx.user.id,
            nullableNumber(job.final_price),
            completionDecision,
          );
        }
      } else {
        await logJobEvent(
          client,
          jobId,
          "kael_completion_decision_rejected",
          ctx,
          "completed_by_worker",
          "completed_by_worker",
          {
            autonomy_decision: completionDecision,
            autonomy_gate_result: completionRun.gate.result,
            autonomy_transition_error: completionRun.gate.audit.reason_code,
          },
        );
      }
    }
  }
  if (input.status !== "completed_by_worker" || finalStatus === "completed_by_worker") {
    await notifyCustomerJobStatus(
      client,
      jobId,
      nullableString(job.customer_id),
      input.status,
    );
  }
  if (input.status === "completed_by_worker") {
    await queueKaelLearningEvent(client, 'post-B7', {
      actor_id: ctx.user.id,
      actor_role: ctx.role,
      job_id: jobId,
      customer_id: nullableString(job.customer_id) ?? undefined,
      worker_id: ctx.user.id,
      scope_change_requested: false,
      worker_report: {
        has_photos: (completionEvidenceForDecision?.completion_photo_urls ?? input.completion_photo_urls ?? []).length > 0,
      },
    });
  }
  return {
    job_id: jobId,
    from_status: job.status as JobStatus,
    to_status: finalStatus,
    updated_at: now,
  };
}

function buildKaelCompletionDecision(
  jobId: string,
  input: {
    completion_notes?: string;
    completion_photo_urls?: string[];
  },
  finalPrice: number | null,
): KaelAutonomyDecision | null {
  const photoCount = input.completion_photo_urls?.length ?? 0;
  const noteLength = input.completion_notes?.trim().length ?? 0;
  if (finalPrice === null || finalPrice <= 0) return null;
  if (photoCount === 0 && noteLength < 12) return null;
  return buildKaelAutonomyDecision({
    action: "confirm_completion",
    policyId: "kael.autonomy.v2.worker_evidence_completion",
    evidence: [
      {
        kind: "worker_evidence",
        reference_id: jobId,
        summary: `Worker submitted completion evidence: ${photoCount} photo(s), note length ${noteLength}.`,
      },
      {
        kind: "system_check",
        reference_id: jobId,
        summary: "Final price is already Kael-locked before completion confirmation.",
      },
      {
        kind: "policy",
        reference_id: "STRUCTURES.md#completion",
        summary: "Kael may confirm completion from validated worker evidence.",
      },
    ],
    confidence: photoCount > 0 ? 0.86 : 0.74,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_confirmed_completion",
  });
}

async function requestScopeChange(ctx: MobileApiContext, jobId: string, input: {
  new_description: string;
  reason: string;
  photo_urls?: string[];
}, secrets: EdgeAiSecrets) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select:
      "id, status, customer_id, worker_id, service_type, description, address_district, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max",
  });
  const originalPriceMax = nullableNumber(job.kael_price_max);
  const transition = validateWorkflowTransition({
    event: "scope_change_requested",
    from: job.status as JobStatus,
    to: "scope_change_pending",
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
  if (originalPriceMax === null || originalPriceMax <= 0) {
    apiFailure(
      "KAEL_PRICE_MISSING",
      "Kael chưa có giá gốc hợp lệ để tính phạm vi phát sinh",
      409,
    );
  }

  const jobScopeProgressTarget = { table: "jobs" as const, id: jobId };
  await updateKaelProgress(client, jobScopeProgressTarget, {
    stage: "scope_reviewing",
    status: "running",
    progress: 0.24,
  });

  let estimate: Awaited<ReturnType<typeof computeScopeChangeEstimate>>;
  try {
    estimate = await computeScopeChangeEstimate({
      serviceType: asServiceType(job.service_type),
      district: nullableString(job.address_district),
      originalDescription: nullableString(job.description) ?? "",
      originalProblemSummary: nullableString(job.kael_problem_identified),
      originalComplexity: asComplexityOrNull(job.kael_complexity),
      originalPriceMin: nullableNumber(job.kael_price_min),
      originalPriceMax,
      workerReportedDescription: input.new_description,
      workerReason: input.reason,
    }, secrets);
  } catch (error) {
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_reviewing",
      status: "failed",
      progress: 0.24,
      failureReason: "scope_review_failed",
    });
    throw error;
  }
  await updateKaelProgress(client, jobScopeProgressTarget, {
    stage: "scope_estimating",
    status: "running",
    progress: 0.68,
  });
  if (estimate.price_max <= 0 || estimate.price_max < estimate.price_min) {
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.68,
      failureReason: "scope_estimate_invalid",
    });
    apiFailure(
      "KAEL_PRICE_MISSING",
      "Kael chưa thể tính giá phát sinh hợp lệ",
      409,
    );
  }
  const workerScopeChangeRate = await getWorkerScopeChangeRate(client, ctx.user.id);
  const scopeChangeOutputs = buildScopeChangeOutputs({
    serviceType: asServiceType(job.service_type),
    originalPriceMax,
    newPriceMin: estimate.price_min,
    newPriceMax: estimate.price_max,
    newComplexity: estimate.complexity_assessment,
    hasPhotos: (input.photo_urls ?? []).length > 0,
    workerDescription: input.new_description,
    workerReason: input.reason,
    workerScopeChangeRate,
    riskConfig: scopeChangeRiskConfig(
      originalPriceMax,
      asComplexityOrNull(job.kael_complexity),
    ),
  });
  const enrichedEstimate: ScopeChangeKaelEstimate = {
    ...estimate,
    anti_fraud: scopeChangeOutputs.anti_fraud,
    worker_challenge: scopeChangeOutputs.worker_challenge,
    customer_card: scopeChangeOutputs.customer_card,
  };
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("request_scope_change_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
      p_new_description: input.new_description,
      p_reason: input.reason,
      p_evidence_photo_urls: input.photo_urls ?? [],
      p_kael_computed_min: enrichedEstimate.price_min,
      p_kael_computed_max: enrichedEstimate.price_max,
      p_kael_review: enrichedEstimate,
    }),
  );
  if (result.error) {
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.72,
      failureReason: "scope_request_rpc_failed",
    });
    apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.72,
      failureReason: "scope_request_missing_row",
    });
    apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500);
  }
  if (!row.ok) {
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.72,
      failureReason: nullableString(row.error_code) ?? "scope_request_rejected",
    });
    mapScopeRequestError(nullableString(row.error_code));
  }
  const scopeChangeId = asString(row.scope_change_id);
  const scopeProgressTarget = { table: "scope_change_requests" as const, id: scopeChangeId };
  await updateKaelProgress(client, scopeProgressTarget, {
    stage: "scope_estimating",
    status: "completed",
    progress: 1,
  });
  await updateKaelProgress(client, jobScopeProgressTarget, {
    stage: "scope_estimating",
    status: "completed",
    progress: 1,
  });
  await logJobEvent(
    client,
    jobId,
    "kael_scope_review_computed",
    ctx,
    null,
    null,
    {
      fallback_used: estimate.fallback_used,
      confidence: estimate.confidence,
      computed_min: estimate.price_min,
      computed_max: estimate.price_max,
      anti_fraud_score: scopeChangeOutputs.anti_fraud.score,
      challenge_required: scopeChangeOutputs.anti_fraud.challenge_required,
    },
  );
  await logScopeChangeEstimateApiCall(client, jobId, enrichedEstimate);
  await logJobEvent(
    client,
    jobId,
    "worker_requested_scope_change",
    ctx,
    null,
    "scope_change_pending",
    {
      scope_change_id: scopeChangeId,
    },
  );
  const customerId = nullableString(job.customer_id);
  const autoDecision = await tryAutoApproveScopeChange(client, ctx, {
    customerId,
    estimate,
    jobId,
    scopeChangeId,
    scopeChangeOutputs,
  });
  if (autoDecision) {
    await notifyCustomerScopeChangeDecided(client, jobId, customerId, scopeChangeId, "approve");
    await notifyWorkerScopeDecision(client, jobId, scopeChangeId, "approve");
  } else {
    await notifyCustomerScopeChangeRequested(
      client,
      jobId,
      customerId,
      scopeChangeId,
    );
    await logJobEvent(
      client,
      jobId,
      "scope_change_notified",
      ctx,
      "scope_change_pending",
      "scope_change_pending",
      { scope_change_id: scopeChangeId },
    );
  }
  await queueKaelLearningEvent(client, 'post-B6', {
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    job_id: jobId,
    customer_id: nullableString(job.customer_id) ?? undefined,
    worker_id: ctx.user.id,
    service_type: asServiceType(job.service_type),
    problem_slug: nullableString(job.kael_problem_identified) ?? undefined,
    district_code: nullableString(job.address_district) ?? undefined,
    complexity: enrichedEstimate.complexity_assessment,
    baseline_min: nullableNumber(job.kael_price_min) ?? undefined,
    baseline_max: originalPriceMax,
    scope_change_requested: true,
    worker_report: {
      has_photos: (input.photo_urls ?? []).length > 0,
      reported_complexity: enrichedEstimate.complexity_assessment,
      challenge_required: scopeChangeOutputs.anti_fraud.challenge_required,
    },
  });
  return {
    scope_change_id: scopeChangeId,
    job_id: jobId,
    status: autoDecision?.status ?? (row.scope_status as ScopeChangeStatus),
    created_at: asString(row.created_at_ts),
    kael_estimate: {
      price_min: estimate.price_min,
      price_max: estimate.price_max,
      confidence: estimate.confidence,
      problem_summary: estimate.problem_summary,
      advisory: estimate.advisory ?? null,
      complexity_assessment: estimate.complexity_assessment,
      disclaimer: estimate.disclaimer,
      fallback_used: estimate.fallback_used,
    },
    anti_fraud: scopeChangeOutputs.anti_fraud,
    worker_challenge: scopeChangeOutputs.worker_challenge,
    customer_card: scopeChangeOutputs.customer_card,
  };
}

async function askKaelForWorker(
  ctx: MobileApiContext,
  jobId: string,
  input: KaelWorkerClarifyInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select:
      "id, status, customer_id, worker_id, service_type, description, address_building, address_unit, address_floor, address_district, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_worker_brief_core, kael_worker_brief_guidance",
  });
  if (!ACTIVE_WORKER_JOB_STATUSES.includes(job.status as JobStatus)) {
    apiFailure(
      "INVALID_STATUS",
      "Kael chỉ hỗ trợ thêm sau khi thợ đã nhận hoặc đang xử lý việc",
      409,
    );
  }

  const countResult = await dbQuery<null>(
    client
      .from("kael_worker_qa_log")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("worker_id", ctx.user.id),
  );
  if (countResult.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra số lần hỏi Kael", 500);
  }
  const usedQuestions = countResult.count ?? 0;
  if (usedQuestions >= 3) {
    apiFailure(
      "KAEL_QA_LIMIT_REACHED",
      "Mỗi việc chỉ có thể hỏi Kael thêm tối đa 3 lần",
      429,
    );
  }

  const safeQuestion = sanitizeKaelText(input.question, 1000);
  const answer = buildWorkerKaelAnswer(safeQuestion, job);
  const inserted = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_qa_log")
      .insert({
        job_id: jobId,
        worker_id: ctx.user.id,
        question: safeQuestion,
        answer,
      })
      .select("id, created_at")
      .single(),
  );
  if (inserted.error || !inserted.data) {
    apiFailure("DB_ERROR", "Không thể lưu câu hỏi Kael", 500);
  }

  return {
    qa_id: asString(inserted.data.id),
    job_id: jobId,
    remaining_questions: Math.max(0, 3 - usedQuestions - 1),
    answer,
  };
}

function buildWorkerKaelAnswer(
  question: string,
  job: Record<string, unknown>,
) {
  const problem = sanitizeKaelText(
    nullableString(job.kael_problem_identified) ??
      nullableString(job.description) ??
      "Yêu cầu cần kiểm tra",
    180,
  );
  const district = sanitizeKaelText(nullableString(job.address_district) ?? "TP.HCM", 100);
  const questionSummary = sanitizeKaelText(question, 180);
  return {
    schema_version: "worker_qa_answer.v1" as const,
    text: sanitizeKaelText(
      `Kael ghi nhận câu hỏi: ${questionSummary}. Với việc này, hãy kiểm tra đúng phạm vi "${problem}" tại khu vực ${district}, giải thích ngắn gọn bằng chứng thực tế và gửi scope-change nếu có phần phát sinh.`,
      500,
    ),
    safety_notes: [
      "Không bắt đầu phần phát sinh khi Kael chưa quyết định hoặc chưa có override hợp lệ.",
      "Không tự báo giá mới ngoài flow Kael trong app.",
    ],
  };
}

async function createWorkerKaelChat(
  ctx: MobileApiContext,
  input: WorkerKaelChatCreateInput,
  _secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  await requireWorkerKaelChatJob(client, ctx, input.job_id);

  if (input.client_request_id) {
    const existing = await findExistingWorkerKaelSessionByClientRequest(
      client,
      ctx.user.id,
      input.job_id,
      input.client_request_id,
    );
    if (existing) return getWorkerKaelChat(ctx, existing);
  }

  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_sessions")
      .insert({
        worker_id: ctx.user.id,
        job_id: input.job_id,
        status: "active",
        client_request_id: input.client_request_id ?? null,
        safe_metadata: compactMetadata({
          source: "worker_kael_chat",
          language: input.language,
        }),
      })
      .select(WORKER_KAEL_SESSION_SELECT)
      .single(),
  );
  if (
    sessionResult.error?.code === "23505" && input.client_request_id
  ) {
    const recovered = await findExistingWorkerKaelSessionByClientRequest(
      client,
      ctx.user.id,
      input.job_id,
      input.client_request_id,
    );
    if (recovered) return getWorkerKaelChat(ctx, recovered);
  }
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 t\u1ea1o phi\u00ean Kael cho th\u1ee3", 500);
  }

  const sessionId = asString(sessionResult.data.id);
  return getWorkerKaelChat(ctx, sessionId);
}

async function listWorkerKaelChats(ctx: MobileApiContext) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_worker_chat_sessions")
      .select(WORKER_KAEL_SESSION_SELECT)
      .eq("worker_id", ctx.user.id)
      .order("updated_at", { ascending: false })
      .limit(20),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 t\u1ea3i danh s\u00e1ch chat Kael", 500);
  }
  return {
    sessions: (result.data ?? []).map(serializeWorkerKaelSession),
  };
}

async function getWorkerKaelChat(
  ctx: MobileApiContext,
  sessionId: string,
) {
  const client = db(ctx);
  const session = await readWorkerKaelSession(client, ctx, sessionId);
  const turnsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_worker_chat_turns")
      .select(WORKER_KAEL_TURN_SELECT)
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true }),
  );
  if (turnsResult.error) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 t\u1ea3i l\u1ecbch s\u1eed Kael", 500);
  }
  return {
    session: serializeWorkerKaelSession(session),
    turns: (turnsResult.data ?? []).map(serializeWorkerKaelTurn),
  };
}

async function sendWorkerKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: WorkerKaelChatTurnInput,
  secrets: EdgeAiSecrets,
  options: { prefetchedJob?: Record<string, unknown>; skipRateLimit?: boolean } = {},
) {
  const client = db(ctx);
  const session = await readWorkerKaelSession(client, ctx, sessionId);
  if (asWorkerKaelChatStatus(session.status) !== "active") {
    apiFailure("INVALID_STATUS", "Phi\u00ean Kael n\u00e0y kh\u00f4ng c\u00f2n nh\u1eadn tin nh\u1eafn", 409);
  }
  if (input.client_request_id) {
    const existingTurn = await findExistingWorkerKaelTurnByClientRequest(
      client,
      sessionId,
      input.client_request_id,
    );
    if (existingTurn) return getWorkerKaelChat(ctx, sessionId);
  }
  if (!options.skipRateLimit) {
    await enforceWorkerKaelChatRateLimit(client, ctx);
  }
  enforceWorkerKaelChatCostBudget(session);

  const job = options.prefetchedJob ??
    await requireWorkerKaelChatJob(client, ctx, asString(session.job_id));
  await updateKaelProgress(client, {
    table: "kael_worker_chat_sessions",
    id: sessionId,
  }, {
    stage: "worker_assist",
    status: "running",
    progress: 0.2,
  });

  const previousTurns = asNumber(session.total_turns);
  const safeMessage = scrubSensitiveForLLM(sanitizeForLLM(input.message));
  await insertWorkerKaelTurn(client, {
    session_id: sessionId,
    job_id: asString(session.job_id),
    turn_index: previousTurns + 1,
    role: "worker",
    content_type: input.media_refs.length > 0 ? "photo_attached" : "text",
    text_content: safeMessage,
    media_refs: input.media_refs,
    client_request_id: input.client_request_id ?? null,
    safe_metadata: {},
  });

  const recentTurns = await readWorkerKaelRecentTurns(client, sessionId);
  let answer: WorkerAssistAnswer;
  try {
    answer = await runWorkerAssist({
      job: {
        id: asString(job.id),
        status: nullableString(job.status),
        service_type: nullableString(job.service_type),
        description: nullableString(job.description),
        address_district: nullableString(job.address_district),
        kael_problem_identified: nullableString(job.kael_problem_identified),
        kael_complexity: nullableString(job.kael_complexity),
        kael_worker_brief_core: nullableRecord(job.kael_worker_brief_core),
        kael_worker_brief_guidance: nullableRecord(job.kael_worker_brief_guidance),
      },
      question: safeMessage,
      language: input.language,
      mediaRefs: input.media_refs,
      previousTurns: recentTurns,
      secrets,
    });
  } catch (err) {
    await updateKaelProgress(client, {
      table: "kael_worker_chat_sessions",
      id: sessionId,
    }, {
      stage: "worker_assist",
      status: "failed",
      progress: 1,
      failureReason: "worker_assist_failed",
    });
    throw err;
  }

  await updateKaelProgress(client, {
    table: "kael_worker_chat_sessions",
    id: sessionId,
  }, {
    stage: "worker_assist",
    status: "running",
    progress: 0.8,
  });

  if (answer.guardrail_reason && isWorkerAssistGuardrailReason(answer.guardrail_reason)) {
    await auditGuardrailTripBestEffort(client, {
      jobId: asString(session.job_id),
      actorId: ctx.user.id,
      actorRole: "worker",
      surface: "worker_kael_chat",
      reason: answer.guardrail_reason,
      guardrailLabel: answer.guardrail_reason,
      source: answer.guardrail_reason === "MONEY_OR_STATUS_MUTATION"
        ? "boundary_guard"
        : "semantic_self_check",
      safeMetadata: {
        session_id: sessionId,
      },
    });
  }

  await appendWorkerKaelAnswerTurn(client, session, answer);
  await updateKaelProgress(client, {
    table: "kael_worker_chat_sessions",
    id: sessionId,
  }, {
    stage: "worker_assist",
    status: "completed",
    progress: 1,
  });
  return getWorkerKaelChat(ctx, sessionId);
}

const WORKER_KAEL_SESSION_SELECT =
  "id, job_id, worker_id, status, started_at, closed_at, total_turns, total_cost_usd, kael_progress, safe_metadata, created_at, updated_at";
const WORKER_KAEL_TURN_SELECT =
  "id, session_id, job_id, turn_index, role, content_type, text_content, media_refs, created_at";

async function requireWorkerKaelChatJob(
  client: DbClient,
  ctx: MobileApiContext,
  jobId: string,
) {
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    statuses: ACTIVE_WORKER_JOB_STATUSES,
    select:
      "id, status, customer_id, worker_id, service_type, description, address_district, kael_problem_identified, kael_complexity, kael_worker_brief_core, kael_worker_brief_guidance",
  });
  return job;
}

async function findExistingWorkerKaelSessionByClientRequest(
  client: DbClient,
  workerId: string,
  jobId: string,
  clientRequestId: string,
): Promise<string | null> {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_sessions")
      .select("id")
      .eq("worker_id", workerId)
      .eq("job_id", jobId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return null;
  return asString(result.data.id);
}

async function findExistingWorkerKaelTurnByClientRequest(
  client: DbClient,
  sessionId: string,
  clientRequestId: string,
): Promise<string | null> {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_turns")
      .select("id")
      .eq("session_id", sessionId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return null;
  return asString(result.data.id);
}

function enforceWorkerKaelChatCostBudget(session: Record<string, unknown>) {
  const currentCost = asNumber(session.total_cost_usd);
  const cap = KAEL_ROUTING_CONFIG.worker_assist.costCeilingUsd;
  if (currentCost >= cap) {
    apiFailure(
      "COST_CAP_HIT",
      "Kael \u0111ang t\u1ea1m d\u1eebng \u0111\u1ec3 b\u1ea3o v\u1ec7 gi\u1edbi h\u1ea1n s\u1eed d\u1ee5ng. Vui l\u00f2ng th\u1eed l\u1ea1i sau.",
      429,
    );
  }
}

async function enforceWorkerKaelChatRateLimit(
  client: DbClient,
  ctx: MobileApiContext,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("check_kael_worker_chat_rate", { p_worker_id: ctx.user.id }),
  );
  if (result.error) {
    console.warn("worker Kael chat rate limit unavailable", {
      errorCode: result.error.code,
    });
    apiFailure(
      "RATE_LIMIT_UNAVAILABLE",
      "Kael \u0111ang b\u1ea3o v\u1ec7 gi\u1edbi h\u1ea1n s\u1eed d\u1ee5ng. Vui l\u00f2ng th\u1eed l\u1ea1i sau \u00edt ph\u00fat.",
      429,
    );
  }
  const row = result.data?.[0];
  if (row && asBoolean(row.allowed) === false) {
    const reason = nullableString(row.reason);
    apiFailure(
      "RATE_LIMITED",
      reason === "hour"
        ? "B\u1ea1n \u0111\u00e3 \u0111\u1ea1t gi\u1edbi h\u1ea1n Kael trong 1 gi\u1edd. Vui l\u00f2ng th\u1eed l\u1ea1i sau."
        : "B\u1ea1n \u0111ang g\u1eedi qu\u00e1 nhanh. Vui l\u00f2ng th\u1eed l\u1ea1i sau \u00edt ph\u00fat.",
      429,
    );
  }
}

async function readWorkerKaelSession(
  client: DbClient,
  ctx: MobileApiContext,
  sessionId: string,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_sessions")
      .select(WORKER_KAEL_SESSION_SELECT)
      .eq("id", sessionId)
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Kh\u00f4ng t\u00ecm th\u1ea5y phi\u00ean Kael", 404);
  }
  if (ctx.role === "worker" && nullableString(result.data.worker_id) !== ctx.user.id) {
    apiFailure("NOT_FOUND", "Kh\u00f4ng t\u00ecm th\u1ea5y phi\u00ean Kael", 404);
  }
  return result.data;
}

async function insertWorkerKaelTurn(
  client: DbClient,
  value: Record<string, unknown>,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_turns")
      .insert(value)
      .select("id")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 l\u01b0u l\u01b0\u1ee3t chat Kael", 500);
  }
  return result.data;
}

async function appendWorkerKaelAnswerTurn(
  client: DbClient,
  session: Record<string, unknown>,
  answer: WorkerAssistAnswer,
) {
  const sessionId = asString(session.id);
  const nextIndex = asNumber(session.total_turns) + 2;
  await insertWorkerKaelTurn(client, {
    session_id: sessionId,
    job_id: asString(session.job_id),
    turn_index: nextIndex,
    role: "kael",
    content_type: answer.redirect_scope_change ? "guidance" : "text",
    text_content: answer.text,
    media_refs: [],
    safe_metadata: compactMetadata({
      schema_version: answer.schema_version,
      safety_notes: answer.safety_notes,
      redirect_scope_change: answer.redirect_scope_change,
      fallback_used: answer.fallback_used,
      guardrail_reason: answer.guardrail_reason ?? null,
    }),
    ai_provider: answer.provider ?? null,
    ai_model: answer.model ?? null,
    latency_ms: answer.latency_ms ?? null,
    cost_usd: answer.cost_usd ?? 0,
  });

  const update = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_sessions")
      .update({
        total_turns: nextIndex,
        total_cost_usd: asNumber(session.total_cost_usd) + (answer.cost_usd ?? 0),
        status: answer.fallback_used ? "active" : "active",
        safe_metadata: compactMetadata({
          ...asRecord(session.safe_metadata),
          latest_redirect_scope_change: answer.redirect_scope_change,
          latest_fallback_used: answer.fallback_used,
        }),
      })
      .eq("id", sessionId)
      .select("id")
      .maybeSingle(),
  );
  if (update.error || !update.data) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt phi\u00ean Kael", 500);
  }
}

async function readWorkerKaelRecentTurns(
  client: DbClient,
  sessionId: string,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_worker_chat_turns")
      .select("role, text_content")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: false })
      .limit(8),
  );
  if (result.error) return [];
  return (result.data ?? [])
    .reverse()
    .map((row) => ({
      role: asWorkerKaelTurnRole(row.role),
      text: nullableString(row.text_content),
    }));
}

function serializeWorkerKaelSession(row: Record<string, unknown>) {
  const rawProgress = nullableRecord(row.kael_progress);
  const parsedProgress = rawProgress
    ? kaelChatProgressSchema.safeParse(rawProgress)
    : null;
  return {
    id: asString(row.id),
    job_id: asString(row.job_id),
    status: asWorkerKaelChatStatus(row.status),
    started_at: asString(row.started_at),
    closed_at: nullableString(row.closed_at),
    total_turns: asNumber(row.total_turns),
    progress: parsedProgress?.success
      ? {
        ...parsedProgress.data,
        failure_reason: parsedProgress.data.failure_reason ?? null,
      }
      : null,
  };
}

function serializeWorkerKaelTurn(row: Record<string, unknown>) {
  return {
    id: asString(row.id),
    session_id: asString(row.session_id),
    turn_index: asNumber(row.turn_index),
    role: asWorkerKaelTurnRole(row.role),
    content_type: asWorkerKaelContentType(row.content_type),
    text_content: nullableString(row.text_content),
    media_refs: asStringArray(row.media_refs),
    created_at: asString(row.created_at),
  };
}

function asWorkerKaelChatStatus(
  value: unknown,
): "active" | "closed" | "escalated" | "error" {
  return value === "closed" || value === "escalated" || value === "error"
    ? value
    : "active";
}

function asWorkerKaelTurnRole(value: unknown): "worker" | "kael" | "system" {
  return value === "worker" || value === "system" ? value : "kael";
}

function asWorkerKaelContentType(
  value: unknown,
): "text" | "photo_attached" | "guidance" | "error" | "clarification" | "photo_request" {
  if (
    value === "clarification" || value === "guidance" ||
    value === "photo_request" || value === "photo_attached" ||
    value === "error"
  ) {
    return value;
  }
  return "text";
}

async function submitWorkerKaelFeedback(
  ctx: MobileApiContext,
  input: WorkerKaelFeedbackInput,
) {
  const client = db(ctx);
  const rawMessage = sanitizeForLLM(input.message).slice(0, 1200);
  const scrubbedMessage = scrubSensitiveForLLM(rawMessage).slice(0, 1200);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_kael_feedback")
      .insert({
        worker_id: ctx.user.id,
        source: input.source,
        language: input.language,
        raw_message: rawMessage,
        scrubbed_message: scrubbedMessage || "[scrubbed]",
        status: "new",
        safe_metadata: {
          kael_feedback_version: "worker.v1",
        },
      })
      .select("id, created_at")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 l\u01b0u ph\u1ea3n h\u1ed3i Kael", 500);
  }
  return {
    feedback_id: asString(result.data.id),
    status: "new" as const,
    created_at: asString(result.data.created_at),
  };
}

async function getWorkerKaelTrainingConsent(ctx: MobileApiContext) {
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("worker_kael_training_consent")
      .select("worker_id, training_consent, updated_at")
      .eq("worker_id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 t\u1ea3i tu\u1ef3 ch\u1ecdn Kael", 500);
  }
  return {
    worker_id: ctx.user.id,
    training_consent: result.data ? asBoolean(result.data.training_consent) : false,
    updated_at: result.data ? nullableString(result.data.updated_at) : null,
  };
}

async function setWorkerKaelTrainingConsent(
  ctx: MobileApiContext,
  input: WorkerKaelTrainingConsentInput,
) {
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("worker_kael_training_consent")
      .upsert({
        worker_id: ctx.user.id,
        training_consent: input.training_consent,
        source: input.source,
        language: input.language,
        safe_metadata: {
          kael_training_consent_version: "worker.v1",
        },
      })
      .select("worker_id, training_consent, updated_at")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 l\u01b0u tu\u1ef3 ch\u1ecdn Kael", 500);
  }
  return {
    worker_id: asString(result.data.worker_id),
    training_consent: asBoolean(result.data.training_consent),
    updated_at: nullableString(result.data.updated_at),
  };
}

async function tryAutoApproveScopeChange(
  client: DbClient,
  ctx: MobileApiContext,
  input: {
    customerId: string | null;
    estimate: ScopeChangeKaelEstimate;
    jobId: string;
    scopeChangeId: string;
    scopeChangeOutputs: ReturnType<typeof buildScopeChangeOutputs>;
  },
): Promise<{ status: ScopeChangeStatus; decidedAt: string | null } | null> {
  const risk = input.scopeChangeOutputs.anti_fraud;
  if (!input.customerId) return null;
  if (risk.challenge_required || risk.admin_flag_required) return null;
  if (input.estimate.confidence < 0.55) return null;

  const autonomyDecision = buildKaelAutonomyDecision({
    action: "decide_scope_change",
    policyId: "kael.autonomy.v2.scope_change_auto_approve",
    evidence: [
      {
        kind: "artifact",
        reference_id: input.scopeChangeId,
        summary: "Worker submitted scope-change artifact with Kael-computed price.",
      },
      {
        kind: "system_check",
        reference_id: input.jobId,
        summary: "Anti-fraud and margin policy did not require challenge or admin review.",
      },
      {
        kind: "policy",
        reference_id: "STRUCTURES.md#A11",
        summary: "Kael may decide scope change when backend policy has enough evidence.",
      },
    ],
    confidence: input.estimate.confidence,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_decided_scope_change",
  });
  const autonomyRun = await runPolicyAutonomyGate({
    label: "scope_change_auto_approve",
    client,
    ctx,
    jobId: input.jobId,
    decision: autonomyDecision,
    from: "scope_change_pending",
    to: "repairing",
    amountVnd: input.estimate.price_max,
    authority: {
      purpose: "scope_change",
      actor: ctx.role,
      jobRelation: "own_worker_job",
      action: "review_scope_change",
      topic: "scope_change",
      actorId: ctx.user.id,
      jobId: input.jobId,
    },
    knownEvidenceReferences: [input.scopeChangeId, input.jobId, "STRUCTURES.md#A11"],
  });
  if (autonomyRun.gate.result !== "allow") {
    await logJobEvent(
      client,
      input.jobId,
      "kael_scope_auto_decision_rejected",
      ctx,
      "scope_change_pending",
      "scope_change_pending",
      {
        scope_change_id: input.scopeChangeId,
        autonomy_decision: autonomyDecision,
        autonomy_gate_result: autonomyRun.gate.result,
        error: autonomyRun.gate.audit.reason_code,
      },
    );
    return null;
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("decide_scope_change_atomic", {
      p_scope_change_id: input.scopeChangeId,
      p_customer_id: input.customerId,
      p_decision: "approve",
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row || !row.ok) {
    console.warn("mobile-api scope-change auto decision fell back to customer review", {
      jobId: input.jobId,
      errorCode: nullableString(row?.error_code),
    });
    return null;
  }

  await logJobEvent(
    client,
    input.jobId,
    "scope_change_final_price_locked",
    ctx,
    "scope_change_pending",
    "repairing",
    { scope_change_id: input.scopeChangeId, autonomy_decision: autonomyDecision },
  );
  await logJobEvent(
    client,
    input.jobId,
    "kael_decided_scope_change",
    ctx,
    "scope_change_pending",
    "repairing",
    { scope_change_id: input.scopeChangeId, autonomy_decision: autonomyDecision, automatic: true },
  );

  return {
    status: row.scope_status as ScopeChangeStatus,
    decidedAt: nullableString(row.decided_at_ts),
  };
}

// Phase 2.0 (2026-05-23): persist Kael's computed scope-change estimate +
// log the API call. Stored in scope_change_requests.kael_review (full payload)
// and scope_change_requests.kael_computed_min/max + price_min/max (numeric
// authoritative source). Customer A11 modal reads kael_computed_*.
async function logScopeChangeEstimateApiCall(
  client: DbClient,
  jobId: string,
  estimate: ScopeChangeKaelEstimate,
) {
  const provider = estimate.provider;
  const model = estimate.model;
  if (!provider || !model) return;
  await logApiCalls(client, [{
    job_id: jobId,
    request_id: crypto.randomUUID(),
    purpose: "scope_change",
    provider,
    model,
    input_tokens: null,
    output_tokens: null,
    cost_usd: estimate.cost_usd,
    latency_ms: estimate.latency_ms ?? 0,
    success: !estimate.fallback_used,
    error_code: estimate.failure_reason ?? null,
  }]);
}

async function getWorkerScopeChangeRate(
  client: DbClient,
  workerId: string,
): Promise<number> {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_scope_change_stats")
      .select("scope_change_rate")
      .eq("worker_id", workerId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return 0;
  const rate = nullableNumber(result.data.scope_change_rate) ?? 0;
  return Math.max(0, Math.min(1, rate));
}


async function requestWorkerCancellation(
  ctx: MobileApiContext,
  jobId: string,
  input: WorkerCancellationRequestInput,
) {
  const client = db(ctx);
  const readExistingCancellation = async (jobStatus: JobStatus) => {
    const existing = await dbQuery<Record<string, unknown>>(
      client
        .from("worker_cancellation_requests")
        .select(
          "id, status, created_at, reason_code, reason_category, admin_review_required, fallback_options, abuse_signals",
        )
        .eq("job_id", jobId)
        .eq("worker_id", ctx.user.id)
        .in("status", ["requested", "reviewing_by_kael", "approved"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (existing.error || !existing.data) return null;

    return {
      cancellation_id: asString(existing.data.id),
      job_id: jobId,
      status: nullableString(existing.data.status) ?? "reviewing_by_kael",
      job_status: jobStatus,
      broadcast_sent: false,
      message: "Yêu cầu hủy việc đang được xử lý.",
      created_at: asString(existing.data.created_at),
      reason_code: asWorkerCancellationReasonCode(existing.data.reason_code) ?? "changed_mind",
      reason_category: asWorkerCancellationCategory(existing.data.reason_category) ?? "suspicious",
      admin_review_required: asBoolean(existing.data.admin_review_required),
      abuse_signals: asWorkerCancellationAbuseSignals(existing.data.abuse_signals),
      fallback_options: asWorkerCancellationFallbackOptions(existing.data.fallback_options),
    };
  };
  let job: Awaited<ReturnType<typeof requireJobAccess>>;
  try {
    job = await requireJobAccess(client, jobId, ctx, {
      requiredRole: "worker",
    });
  } catch (error: unknown) {
    const errorCode = typeof error === "object" && error !== null
      ? nullableString((error as { code?: unknown }).code)
      : null;
    if (ctx.role === "worker" && errorCode === "NOT_FOUND") {
      const existing = await readExistingCancellation("broadcasting");
      if (existing?.status === "approved") return existing;
    }
    throw error;
  }
  const command = validateWorkflowCommand({
    event: "worker_cancellation_requested",
    status: job.status as JobStatus,
  });
  if (!command.valid) apiFailure("INVALID_STATUS", command.error, 409);
  const existingCancellation = await readExistingCancellation(job.status as JobStatus);
  if (existingCancellation) return existingCancellation;
  const preAutonomy = await gateWorkerCancellationBeforeMutation({
    client,
    ctx,
    job,
    jobId,
    request: input,
  });

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("request_worker_cancellation_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
      p_reason: input.reason,
      p_evidence_photo_urls: input.evidence_photo_urls,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy việc", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy việc", 500);
  if (!row.ok) {
    const errorCode = nullableString(row.error_code);
    if (errorCode === "ALREADY_REQUESTED") {
      const existing = await readExistingCancellation(asJobStatus(row.job_status ?? job.status));
      if (existing) return existing;
    }
    mapWorkerCancellationRequestError(errorCode);
  }

  const cancellationId = asString(row.cancellation_id);
  const cancellationStatus = asString(row.cancellation_status);
  const jobStatus = row.job_status as JobStatus | undefined;
  const localClassification = preAutonomy.localClassification;
  const reasonCategory = asWorkerCancellationCategory(row.reason_category) ??
    localClassification.category;
  const reasonCode = asWorkerCancellationReasonCode(row.reason_code) ??
    localClassification.reasonCode;
  const adminReviewRequired = asBoolean(row.admin_review_required) ||
    reasonCategory !== "legit_auto_approve";
  const abuseSignals = asWorkerCancellationAbuseSignals(row.abuse_signals);
  const fallbackOptions = asWorkerCancellationFallbackOptions(row.fallback_options);
  const classification = {
    ...localClassification,
    category: reasonCategory,
    reasonCode,
    adminReviewRequired,
    autoApprove: !adminReviewRequired && reasonCategory === "legit_auto_approve",
  };
  const autonomyDecision = cancellationStatus === "approved" ? preAutonomy.decision : null;
  const autonomyRun = cancellationStatus === "approved" ? preAutonomy.run : null;
  const redFlagPatch: Record<string, boolean> = adminReviewRequired || abuseSignals.length > 0
    ? { worker_cancellation_abuse_review: true }
    : {};
  const abuse = {
    cancellationRate: 0,
    signals: abuseSignals,
    adminReviewRequired: adminReviewRequired || abuseSignals.length > 0,
    queuePriority: adminReviewRequired || abuseSignals.length > 0
      ? "medium" as const
      : "none" as const,
    suspensionAction: adminReviewRequired || abuseSignals.length > 0
      ? "admin_review_required" as const
      : "none" as const,
    redFlagPatch,
  };
  let broadcastSent = false;
  let message = cancellationStatus === "approved"
    ? "Đã hủy việc và đang tìm thợ thay thế."
    : "Đã gửi yêu cầu hủy việc.";

  if (cancellationStatus === "approved") {
    const district = normalizeServiceAreaDistrict(nullableString(row.district_code) ?? "");
    if (district) {
      const previousRecipients = await listBroadcastRecipientWorkerIds(client, jobId);
      if (!previousRecipients.success) {
        message = previousRecipients.reason;
      } else {
        const cancelledWorkerId = nullableString(row.worker_id_out) ?? ctx.user.id;
        const excludeWorkerIds = Array.from(new Set([
          cancelledWorkerId,
          ...previousRecipients.workerIds,
        ]));
        const broadcast = await createBroadcasts(
          client,
          jobId,
          row.service_type_out as ServiceType,
          district,
          { excludeWorkerIds },
        );
        broadcastSent = broadcast.success;
        message = broadcast.success
          ? `Đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ thay thế.`
          : broadcast.reason;
      }
    } else {
      message = "Đã hủy việc nhưng địa chỉ cần có quận TP.HCM rõ ràng để tìm thợ thay thế.";
    }
    await notifyCustomerWorkerReplacementSearch(
      client,
      jobId,
      nullableString(job.customer_id),
      broadcastSent,
    );
  }

  await logJobEvent(
    client,
    jobId,
    "worker_requested_cancellation",
    ctx,
    null,
    null,
    {
      cancellation_id: cancellationId,
      cancellation_status: cancellationStatus,
      broadcast_sent: broadcastSent,
      reason_code: reasonCode,
      reason_category: reasonCategory,
      abuse_signals: abuseSignals,
      admin_review_required: abuse.adminReviewRequired,
      ...(autonomyDecision
        ? {
          autonomy_decision: autonomyDecision,
          autonomy_gate_result: autonomyRun?.gate.result ?? null,
          autonomy_transition_valid: autonomyRun?.gate.result === "allow",
          ...(autonomyRun?.gate.result !== "allow"
            ? { autonomy_transition_error: autonomyRun?.gate.audit.reason_code ?? "AUTONOMY_GATE_NOT_RUN" }
            : {}),
        }
        : {}),
    },
  );
  if (autonomyDecision && autonomyRun?.gate.result === "allow") {
    await logJobEvent(
      client,
      jobId,
      "kael_processed_cancellation",
      ctx,
      job.status as JobStatus,
      (jobStatus ?? job.status) as JobStatus,
      {
        cancellation_id: cancellationId,
        broadcast_sent: broadcastSent,
        autonomy_decision: autonomyDecision,
      },
    );
  }
  if (cancellationStatus === "approved") {
    await recordWorkerCancellationReview(client, {
      jobId,
      workerId: nullableString(row.worker_id_out) ?? ctx.user.id,
      cancellationId,
      reason: input.reason,
      classification,
      abuse,
      subCase: "explicit_cancel",
    }).catch(() => {
      console.warn("mobile-api worker cancellation review write failed", {
        jobId,
        cancellationId,
      });
    });
  }
  return {
    cancellation_id: cancellationId,
    job_id: jobId,
    status: cancellationStatus,
    job_status: jobStatus ?? (job.status as JobStatus),
    broadcast_sent: broadcastSent,
    message,
    created_at: asString(row.created_at_ts),
    reason_code: reasonCode,
    reason_category: reasonCategory,
    admin_review_required: abuse.adminReviewRequired,
    abuse_signals: abuseSignals,
    fallback_options: fallbackOptions,
  };
}

async function attachJobMedia(
  ctx: MobileApiContext,
  jobId: string,
  input: JobMediaAttachInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select:
      "id, status, service_type, customer_id, worker_id, photo_urls, completion_photo_urls",
  });
  const status = job.status as JobStatus;
  const customerId = nullableString(job.customer_id);
  const workerId = nullableString(job.worker_id);
  const isCustomer = customerId === ctx.user.id;
  const isWorker = workerId === ctx.user.id;
  const isAdmin = ctx.role === "admin";
  if (!isCustomer && !isWorker && !isAdmin) {
    apiFailure("FORBIDDEN", "Bạn không có quyền gắn media cho yêu cầu này", 403);
  }

  for (const asset of input.assets) {
    const command = validateWorkflowCommand({
      event: "job_media_attached",
      status,
      mediaStage: asset.stage,
    });
    if (!command.valid) apiFailure("INVALID_STATUS", command.error, 409);
  }

  const serviceType = asServiceType(job.service_type);
  const rows = input.assets.map((asset) => {
    validateJobMediaPath(jobId, asset.stage, asset.object_path);
    if (!canAttachJobMediaStage(asset.stage, isCustomer, isWorker, isAdmin)) {
      apiFailure("FORBIDDEN", "Vai trò hiện tại không được gắn media ở bước này", 403);
    }
    return {
      job_id: jobId,
      owner_id: ctx.user.id,
      service_type: serviceType,
      stage: asset.stage,
      bucket_id: "job-media",
      object_path: asset.object_path,
      mime_type: asset.mime_type ?? null,
      file_size_bytes: asset.file_size_bytes ?? null,
      safe_metadata: {},
    };
  });

  const objectPaths = Array.from(new Set(rows.map((row) => row.object_path)));
  const existingAssets = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_media_assets")
      .select("object_path")
      .eq("job_id", jobId)
      .in("object_path", objectPaths),
  );
  if (existingAssets.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra media đã gắn", 500);
  }
  const existingObjectPaths = new Set(
    (existingAssets.data ?? []).map((asset) => nullableString(asset.object_path)).filter(Boolean),
  );
  const nextObjectPaths = new Set<string>();
  const rowsToInsert = rows.filter((row) => {
    if (existingObjectPaths.has(row.object_path) || nextObjectPaths.has(row.object_path)) {
      return false;
    }
    nextObjectPaths.add(row.object_path);
    return true;
  });
  const responseObjectPaths = new Set<string>();
  const responseRows = rows.filter((row) => {
    if (responseObjectPaths.has(row.object_path)) return false;
    responseObjectPaths.add(row.object_path);
    return true;
  });
  if (rowsToInsert.length > 0) {
    const inserted = await dbQuery(
      client.from("job_media_assets").insert(rowsToInsert).select("id"),
    );
    if (inserted.error) {
      apiFailure("DB_ERROR", "Không thể lưu thông tin media", 500);
    }
  }
  const beforeRefs = rows
    .filter((row) => row.stage === "before" || (row.stage === "kael_reference" && isCustomer))
    .map((row) => storageRef(row.object_path));
  const afterRefs = rows
    .filter((row) => row.stage === "after")
    .map((row) => storageRef(row.object_path));
  let photoUrls = asStringArray(job.photo_urls);

  if (beforeRefs.length > 0) {
    photoUrls = mergeLimitedRefs(photoUrls, beforeRefs, 5);
    const updated = await dbQuery(
      client
        .from("jobs")
        .update({ photo_urls: photoUrls })
        .eq("id", jobId)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error || !updated.data) {
      apiFailure("DB_ERROR", "Không thể cập nhật media yêu cầu", 500);
    }
  }

  if (afterRefs.length > 0) {
    const completionPhotoUrls = mergeLimitedRefs(
      asStringArray(job.completion_photo_urls),
      afterRefs,
      10,
    );
    const updated = await dbQuery(
      client
        .from("jobs")
        .update({ completion_photo_urls: completionPhotoUrls })
        .eq("id", jobId)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error || !updated.data) {
      apiFailure("DB_ERROR", "Không thể cập nhật media hoàn tất", 500);
    }
  }

  if (rowsToInsert.length > 0) {
    await logJobEvent(
      client,
      jobId,
      "job_media_attached",
      ctx,
      status,
      status,
      {
        count: rowsToInsert.length,
        stages: Array.from(new Set(rowsToInsert.map((row) => row.stage))),
      },
    );
  }

  return {
    job_id: jobId,
    photo_urls: photoUrls,
    media: responseRows.map((row) => ({
      bucket_id: "job-media" as const,
      object_path: row.object_path,
      storage_ref: storageRef(row.object_path),
      stage: row.stage,
    })),
  };
}

async function listJobMessages(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx, {
    select: "id, status, customer_id, worker_id",
  });
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("chat_messages")
      .select("id, job_id, sender_id, sender_role, content, is_read, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(100),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải tin nhắn", 500);
  }
  await markJobMessagesRead(client, jobId, ctx.user.id);
  return {
    job_id: jobId,
    messages: (result.data ?? []).map(serializeJobMessage).reverse(),
  };
}

async function sendJobMessage(
  ctx: MobileApiContext,
  jobId: string,
  input: JobMessageSendInput,
) {
  if (ctx.role !== "customer" && ctx.role !== "worker") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền gửi tin nhắn", 403);
  }
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select: "id, status, customer_id, worker_id",
  });
  if (!JOB_CHAT_SEND_STATUSES.includes(job.status as JobStatus)) {
    apiFailure(
      "INVALID_STATUS",
      "Chưa thể gửi tin nhắn ở trạng thái yêu cầu hiện tại",
      409,
    );
  }
  const content = input.content.trim();
  if (!content) apiFailure("VALIDATION", "Nội dung tin nhắn không hợp lệ", 400);
  const contactGuard = evaluateJobChatContactGuard(content);
  const storedContent = contactGuard.flagged ? contactGuard.redactedContent : content;

  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("chat_messages")
      .insert({
        job_id: jobId,
        sender_id: ctx.user.id,
        sender_role: ctx.role,
        content: storedContent,
      })
      .select("id, job_id, sender_id, sender_role, content, is_read, created_at")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể gửi tin nhắn", 500);
  }
  const message = serializeJobMessage(result.data);
  await maybeHandleJobChatContactGuard(client, job, ctx, contactGuard);
  if (!contactGuard.flagged) {
    await maybeHandleDemandingCustomerJobChat(client, job, ctx, content);
  }
  await notifyJobMessageRecipient(client, job, ctx, message.id);
  return { message };
}

type JobChatContactGuard = {
  flagged: boolean;
  redactedContent: string;
  signals: string[];
};

const JOB_CHAT_CONTACT_REDACTED =
  "Kael đã ẩn nội dung có dấu hiệu xin liên hệ hoặc thanh toán ngoài app.";

const JOB_CHAT_CONTACT_PATTERNS: { id: string; pattern: RegExp }[] = [
  { id: "phone", pattern: /\b(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/i },
  { id: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { id: "sdt", pattern: /\b(?:sdt|số điện thoại|so dien thoai)\b/i },
  { id: "zalo", pattern: /\b(?:zalo|za lo)\b/i },
  { id: "call_direct", pattern: /\b(?:gọi em|goi em|gọi anh|goi anh|gọi riêng|goi rieng|số riêng|so rieng)\b/i },
  { id: "cash", pattern: /\b(?:tiền mặt|tien mat|cash)\b/i },
  { id: "off_app", pattern: /\b(?:khỏi qua app|khoi qua app|không qua app|khong qua app|ngoài app|ngoai app|trực tiếp|truc tiep|ra ngoài app|ra ngoai app)\b/i },
];

function evaluateJobChatContactGuard(content: string): JobChatContactGuard {
  const normalized = normalizeGuardText(content);
  const signals = JOB_CHAT_CONTACT_PATTERNS
    .filter((entry) => entry.pattern.test(content) || entry.pattern.test(normalized))
    .map((entry) => entry.id);
  return {
    flagged: signals.length > 0,
    redactedContent: JOB_CHAT_CONTACT_REDACTED,
    signals,
  };
}

function normalizeGuardText(content: string) {
  return content
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

async function maybeHandleJobChatContactGuard(
  client: DbClient,
  job: Record<string, unknown>,
  ctx: MobileApiContext,
  guard: JobChatContactGuard,
) {
  if (!guard.flagged) return;
  await insertKaelJobMessage(
    client,
    asString(job.id),
    ctx.role === "worker"
      ? "Kael giữ liên hệ, bằng chứng và thanh toán trong app để bảo vệ cả khách và thợ. Nếu phát sinh phạm vi, hãy gửi scope-change trong phòng việc."
      : "Kael giữ liên hệ, bằng chứng và thanh toán trong app để bảo vệ giao dịch. Nếu cần trao đổi thêm, hãy nhắn ngay tại phòng việc này.",
  );
  if (ctx.role !== "worker") return;
  await recordWorkerDisintermediationRisk(client, {
    jobId: asString(job.id),
    signals: guard.signals,
    workerId: ctx.user.id,
  });
}

async function recordWorkerDisintermediationRisk(
  client: DbClient,
  input: { jobId: string; signals: string[]; workerId: string },
) {
  const observedAt = new Date().toISOString();
  const existing = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_kael_memory")
      .select("red_flags, reliability_signals, safe_metadata")
      .eq("worker_id", input.workerId)
      .maybeSingle(),
  );
  const redFlags = nullableRecord(existing.data?.red_flags) ?? {};
  const reliabilitySignals = nullableRecord(existing.data?.reliability_signals) ?? {};
  const safeMetadata = nullableRecord(existing.data?.safe_metadata) ?? {};
  const previousCount = asNumber(redFlags.disintermediation_risk_count);
  await dbQuery(
    client.from("worker_kael_memory").upsert({
      worker_id: input.workerId,
      red_flags: {
        ...redFlags,
        disintermediation_contact_leak: true,
        disintermediation_risk_count: previousCount + 1,
        last_disintermediation_at: observedAt,
        last_disintermediation_job_id: input.jobId,
        last_disintermediation_signals: input.signals,
      },
      reliability_signals: {
        ...reliabilitySignals,
        app_channel_guard_triggered: true,
      },
      safe_metadata: {
        ...safeMetadata,
        last_disintermediation_guard: {
          job_id: input.jobId,
          observed_at: observedAt,
          signals: input.signals,
        },
      },
      last_observed_at: observedAt,
    }),
  );
  await dbQuery(
    client.from("kael_admin_queue").insert({
      job_id: input.jobId,
      actor_id: input.workerId,
      actor_role: "worker",
      queue_type: "disintermediation_risk",
      priority: "medium",
      status: "open",
      escalation_level: "soft",
      reason_code: "worker_contact_or_off_app_solicitation",
      response_summary: "worker_chat_contact_guard_triggered",
      safe_metadata: {
        guard: "chat_contact_redaction",
        signals: input.signals,
      },
    }),
  );
}

async function maybeHandleDemandingCustomerJobChat(
  client: DbClient,
  job: Record<string, unknown>,
  ctx: MobileApiContext,
  message: string,
) {
  if (ctx.role !== "customer") return;
  const detection = detectDemandingCustomerPatterns({
    message,
    qaCount: 1,
    cancelCount: 0,
  });
  if (detection.expectedNuance === "none") return;

  const response = buildDemandingCustomerResponse(detection);
  await recordDemandingCustomerInteraction(client, {
    jobId: asString(job.id),
    actorId: ctx.user.id,
    actorRole: "customer",
    message,
    detection,
    response,
  });
  await insertKaelJobMessage(client, asString(job.id), response.responseText);
}

async function insertKaelJobMessage(
  client: DbClient,
  jobId: string,
  content: string,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("chat_messages")
      .insert({
        job_id: jobId,
        sender_id: null,
        sender_role: "kael",
        content,
      })
      .select("id, job_id, sender_id, sender_role, content, is_read, created_at")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể lưu phản hồi Kael", 500);
  }
  return result.data;
}

async function markJobMessagesRead(
  client: DbClient,
  jobId: string,
  readerId: string,
) {
  const result = await dbQuery(
    client
      .from("chat_messages")
      .update({ is_read: true })
      .eq("job_id", jobId)
      .neq("sender_id", readerId)
      .eq("is_read", false)
      .select("id"),
  );
  if (result.error) {
    console.warn("mobile-api chat read update failed", {
      jobId,
      errorCode: result.error.code,
    });
  }
}

async function decideWorkerCancellation(
  ctx: MobileApiContext,
  cancellationId: string,
  input: WorkerCancellationDecisionInput,
): ReturnType<MobileApiServices["decideWorkerCancellation"]> {
  void ctx;
  void cancellationId;
  void input;
  apiFailure(
    "DEPRECATED",
    "Yêu cầu hủy việc của thợ đã được xử lý tự động ở endpoint hủy việc",
    410,
  );
  throw new Error("Unreachable after worker cancellation deprecation failure");
}

async function decideScopeChange(
  ctx: MobileApiContext,
  scopeChangeId: string,
  input: { decision: "approve" | "reject" },
) {
  const client = db(ctx);
  const nextJobStatus = scopeDecisionToJobStatus(input.decision);
  const scopeRow = await dbQuery<Record<string, unknown>>(
    client
      .from("scope_changes")
      .select("job_id")
      .eq("id", scopeChangeId)
      .maybeSingle(),
  );
  const scopeJobId = nullableString(scopeRow.data?.job_id);
  const autonomyDecision = buildKaelAutonomyDecision({
    action: "decide_scope_change",
    policyId: `kael.autonomy.v2.scope_change_${input.decision}`,
    evidence: [
      {
        kind: "artifact",
        reference_id: scopeChangeId,
        summary: "Scope change request submitted for atomic Kael policy decision.",
      },
      {
        kind: "customer_input",
        reference_id: scopeChangeId,
        summary: input.decision === "approve"
          ? "Customer accepted Kael scope decision."
          : "Customer appealed or rejected the reported scope change.",
      },
      {
        kind: "system_check",
        reference_id: scopeJobId ?? scopeChangeId,
        summary: "Scope-change ownership and current job transition are checked by the atomic RPC.",
      },
      {
        kind: "policy",
        reference_id: "STRUCTURES.md#A11",
        summary: "Scope changes require Kael policy decision, evidence, and appeal path.",
      },
    ],
    confidence: input.decision === "approve" ? 0.72 : 0.55,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_decided_scope_change",
  });
  const autonomyRun = await runPolicyAutonomyGate({
    label: `scope_change_customer_${input.decision}`,
    client,
    ctx,
    jobId: scopeJobId,
    decision: autonomyDecision,
    from: "scope_change_pending",
    to: nextJobStatus,
    authority: {
      purpose: "scope_change",
      actor: ctx.role,
      jobRelation: "own_customer_job",
      action: "review_scope_change",
      topic: "scope_change",
      actorId: ctx.user.id,
      jobId: scopeJobId,
    },
    knownEvidenceReferences: [scopeChangeId, scopeJobId ?? scopeChangeId, "STRUCTURES.md#A11"],
  });
  if (autonomyRun.gate.result !== "allow") {
    apiFailure("INVALID_STATUS", autonomyRun.gate.audit.reason_code, 409);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("decide_scope_change_atomic", {
      p_scope_change_id: scopeChangeId,
      p_customer_id: ctx.user.id,
      p_decision: input.decision,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật quyết định", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể cập nhật quyết định", 500);
  if (!row.ok) mapScopeDecisionError(nullableString(row.error_code));

  const jobId = asString(row.job_id_out);
  if (input.decision === "approve") {
    await logJobEvent(
      client,
      jobId,
      "scope_change_final_price_locked",
      ctx,
      "scope_change_pending",
      nextJobStatus,
      { scope_change_id: scopeChangeId, autonomy_decision: autonomyDecision },
    );
  }

  await logJobEvent(
    client,
    jobId,
    "kael_decided_scope_change",
    ctx,
    "scope_change_pending",
    nextJobStatus,
    { scope_change_id: scopeChangeId, customer_input: input.decision, autonomy_decision: autonomyDecision },
  );
  await notifyWorkerScopeDecision(client, jobId, scopeChangeId, input.decision);
  return {
    scope_change_id: scopeChangeId,
    job_id: jobId,
    status: row.scope_status as ScopeChangeStatus,
    decided_at: asString(row.decided_at_ts),
  };
}

function scopeDecisionToJobStatus(decision: "approve" | "reject"): JobStatus {
  return decision === "approve" ? "repairing" : "cancelled";
}

async function confirmCompletion(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id, worker_id, final_price, completion_notes, completion_photo_urls",
  });
  if (job.status === "confirmed_by_customer" || job.status === "reviewed") {
    return {
      job_id: jobId,
      status: job.status as JobStatus,
      final_price: nullableNumber(job.final_price),
    };
  }
  if (job.status !== "completed_by_worker") {
    apiFailure(
      "INVALID_STATUS",
      "Trạng thái yêu cầu đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  const autonomyDecision = buildKaelCustomerAcceptedCompletionDecision(
    jobId,
    nullableNumber(job.final_price),
    {
      completionNotes: nullableString(job.completion_notes),
      completionPhotoUrls: asStringArray(job.completion_photo_urls),
      customerId: ctx.user.id,
    },
  );
  const autonomyRun = await runPolicyAutonomyGate({
    label: "customer_confirm_completion",
    client,
    ctx,
    jobId,
    decision: autonomyDecision,
    from: job.status as JobStatus,
    to: "confirmed_by_customer",
    amountVnd: nullableNumber(job.final_price),
    authority: {
      purpose: "scope_change",
      actor: ctx.role,
      jobRelation: "own_customer_job",
      action: "review_scope_change",
      topic: "job_status",
      actorId: ctx.user.id,
      jobId,
    },
    knownEvidenceReferences: [ctx.user.id, jobId, "RULES.md#rule-7"],
  });
  if (autonomyRun.gate.result !== "allow") {
    apiFailure("INVALID_STATUS", autonomyRun.gate.audit.reason_code, 409);
  }
  const finalPrice = nullableNumber(job.final_price);
  // Phase 2.0 (2026-05-23): jobs.final_price là Kael-locked. Nếu null thì
  // confirmSearch chưa set baseline — chặn confirm để giữ trust.
  if (finalPrice === null || finalPrice <= 0) {
    apiFailure(
      "INVALID_STATUS",
      "Kael chưa chốt giá cuối cùng nên chưa thể xác nhận hoàn tất",
      409,
    );
  }

  const now = new Date().toISOString();
  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({ status: "confirmed_by_customer", confirmed_at: now })
      .eq("id", jobId)
      .eq("customer_id", ctx.user.id)
      .eq("status", job.status)
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) {
    apiFailure("DB_ERROR", "Không thể xác nhận hoàn thành", 500);
  }
  if (!updated.data) {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  await logJobEvent(
    client,
    jobId,
    "kael_confirmed_completion",
    ctx,
    job.status as JobStatus,
    "confirmed_by_customer",
    { autonomy_decision: autonomyDecision, customer_input: "accepted_completion" },
  );
  // P9 keeps review prompting in the completion surface; A14 sends the customer notification.
  // Kael Autonomy v2: notify worker that completion has been policy-confirmed.
  const workerId = nullableString(job.worker_id);
  if (workerId) {
    await insertUserNotification(client, {
      userId: workerId,
      jobId,
      eventType: "kael_confirmed_completion",
      title: "Kael đã xác nhận hoàn tất",
      body: "Kael đã xác nhận công việc từ bằng chứng hoàn tất. Đối soát thu nhập sẽ cập nhật.",
      metadata: { final_price: finalPrice, autonomy_decision: autonomyDecision },
    });
  }
  return {
    job_id: jobId,
    status: "confirmed_by_customer" as JobStatus,
    final_price: finalPrice,
  };
}

async function createPaymentIntent(
  ctx: MobileApiContext,
  jobId: string,
  secrets: EdgeServiceSecrets,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select:
      "id, display_code, status, customer_id, worker_id, final_price, created_at, payment_provider, payment_status, payment_code, payment_transfer_content, payment_qr_image_url, payment_expires_at, payment_received_at, payment_amount_received, gross_amount, platform_fee, worker_net, payment_updated_at",
  });
  const currentStatus = job.status as JobStatus;
  if (currentStatus === "paid" || currentStatus === "reviewed") {
    return serializePaymentIntent(job);
  }
  if (
    currentStatus !== "confirmed_by_customer" &&
    currentStatus !== "payment_pending"
  ) {
    apiFailure(
      "INVALID_STATUS",
      "Kael chưa xác nhận hoàn tất nên chưa thể tạo mã thanh toán",
      409,
    );
  }

  const finalPrice = nullableNumber(job.final_price);
  if (finalPrice === null || finalPrice <= 0) {
    apiFailure(
      "INVALID_STATUS",
      "Kael chưa chốt giá cuối cùng nên chưa thể tạo mã thanh toán",
      409,
    );
  }
  const workerId = nullableString(job.worker_id);
  if (!workerId) {
    apiFailure("INVALID_STATUS", "Yêu cầu chưa có thợ để nhận thanh toán", 409);
  }

  const worker = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_profiles")
      .select("bank_account, bank_name")
      .eq("id", workerId)
      .maybeSingle(),
  );
  if (worker.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra tài khoản thợ", 500);
  }
  const bankAccount = normalizeBankAccount(nullableString(worker.data?.bank_account));
  const bankName = normalizeBankName(nullableString(worker.data?.bank_name));
  if (!bankAccount || !bankName) {
    apiFailure(
      "WORKER_BANK_MISSING",
      "Thợ chưa cấu hình tài khoản nhận thanh toán",
      409,
    );
  }

  if (currentStatus === "confirmed_by_customer") {
    const transition = validateWorkflowTransition({
      event: "kael_decided_payment",
      from: currentStatus,
      to: "payment_pending",
    });
    if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
  }

  const displayCode = nullableString(job.display_code) ?? buildJobDisplayCode({
    jobId: asString(job.id),
    customerId: nullableString(job.customer_id),
    createdAt: nullableString(job.created_at),
  });
  const paymentCode = nullableString(job.payment_code) ??
    buildSepayPaymentCode(displayCode);
  const transferContent = nullableString(job.payment_transfer_content) ??
    `NestScout ${paymentCode}`;
  const platformFee = Math.round(finalPrice * PLATFORM_FEE_WORKER);
  const workerNet = Math.max(0, finalPrice - platformFee);
  const expiresAt = new Date(Date.now() + SEPAY_PAYMENT_TTL_MS).toISOString();
  const qrImageUrl = buildSepayQrImageUrl({
    amount: finalPrice,
    bankAccount,
    bankName,
    baseUrl: secrets.sepayQrBaseUrl,
    description: transferContent,
  });
  const now = new Date().toISOString();
  const updatePayload = {
    status: "payment_pending",
    payment_provider: SEPAY_VIETQR_PROVIDER,
    payment_status: "vietqr_ready",
    payment_code: paymentCode,
    payment_transfer_content: transferContent,
    payment_qr_image_url: qrImageUrl,
    payment_expires_at: expiresAt,
    payment_received_at: null,
    payment_amount_received: null,
    gross_amount: finalPrice,
    platform_fee: platformFee,
    worker_net: workerNet,
    payment_failure_reason: null,
    payment_updated_at: now,
  };
  const updated = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .update(updatePayload)
      .eq("id", jobId)
      .eq("status", currentStatus)
      .select(
        "id, status, payment_provider, payment_status, payment_code, payment_transfer_content, payment_qr_image_url, payment_expires_at, payment_received_at, payment_amount_received, gross_amount, platform_fee, worker_net, payment_updated_at",
      )
      .maybeSingle(),
  );
  if (updated.error) {
    apiFailure("DB_ERROR", "Không thể tạo mã thanh toán", 500);
  }
  if (!updated.data) {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }

  await logJobEvent(
    client,
    jobId,
    "kael_created_sepay_vietqr_payment",
    ctx,
    currentStatus,
    "payment_pending",
    {
      provider: SEPAY_VIETQR_PROVIDER,
      payment_code: paymentCode,
      gross_amount: finalPrice,
      expires_at: expiresAt,
    },
  );
  await insertUserNotification(client, {
    userId: workerId,
    jobId,
    eventType: "payment_vietqr_ready",
    title: "Kael đã tạo mã thanh toán",
    body: "Khách hàng đã có mã VietQR. Thu nhập sẽ cập nhật khi SePay xác nhận giao dịch.",
    metadata: { provider: SEPAY_VIETQR_PROVIDER, payment_code: paymentCode },
  });
  return serializePaymentIntent(updated.data);
}

async function handleSepayWebhook(
  input: unknown,
  headers: Headers,
  secrets: EdgeServiceSecrets,
) {
  assertSepayWebhookAuth(headers, secrets);
  const payload = parseSepayWebhook(input);
  const client = publicRouteDb(secrets);
  const duplicate = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select("id")
      .eq("sepay_transaction_id", payload.transactionId)
      .maybeSingle(),
  );
  if (duplicate.error) {
    apiFailure("DB_ERROR", "Không thể đối soát giao dịch", 500);
  }
  if (duplicate.data) return { success: true as const };

  const paymentCode = payload.paymentCode ??
    extractSepayPaymentCode(payload.content, payload.description);
  if (!paymentCode) return { success: true as const };

  const jobResult = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select(
        "id, status, customer_id, worker_id, final_price, payment_status, payment_code, gross_amount",
      )
      .eq("payment_code", paymentCode)
      .maybeSingle(),
  );
  if (jobResult.error) {
    apiFailure("DB_ERROR", "Không thể tìm mã thanh toán", 500);
  }
  const job = jobResult.data;
  if (!job) return { success: true as const };

  const jobId = asString(job.id);
  const currentStatus = asJobStatus(job.status);
  if (currentStatus === "paid" || currentStatus === "reviewed") {
    return { success: true as const };
  }
  if (currentStatus !== "payment_pending") return { success: true as const };
  const expectedAmount = nullableNumber(job.gross_amount) ??
    nullableNumber(job.final_price);
  if (
    payload.transferType !== "in" ||
    expectedAmount === null ||
    payload.transferAmount !== expectedAmount
  ) {
    await markPaymentMismatch(client, jobId, payload, expectedAmount, currentStatus);
    return { success: true as const };
  }

  const transition = validateWorkflowTransition({
    event: "payment_confirmed",
    from: currentStatus,
    to: "paid",
  });
  if (!transition.valid) {
    await markPaymentMismatch(client, jobId, payload, expectedAmount, currentStatus);
    return { success: true as const };
  }

  const receivedAt = payload.transactionDate ?? new Date().toISOString();
  const now = new Date().toISOString();
  const updated = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .update({
        status: "paid",
        paid_at: receivedAt,
        payment_status: "received",
        payment_received_at: receivedAt,
        payment_amount_received: payload.transferAmount,
        sepay_transaction_id: payload.transactionId,
        sepay_reference_code: payload.referenceCode,
        payment_failure_reason: null,
        payment_updated_at: now,
      })
      .eq("id", jobId)
      .eq("status", "payment_pending")
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) {
    apiFailure("DB_ERROR", "Không thể ghi nhận thanh toán", 500);
  }
  if (!updated.data) return { success: true as const };

  await logProviderJobEvent(client, {
    jobId,
    eventType: "sepay_payment_confirmed",
    fromStatus: currentStatus,
    toStatus: "paid",
    metadata: {
      provider: SEPAY_VIETQR_PROVIDER,
      payment_code: paymentCode,
      transfer_amount: payload.transferAmount,
      sepay_transaction_id: payload.transactionId,
      reference_code: payload.referenceCode,
    },
  });
  const customerId = nullableString(job.customer_id);
  const workerId = nullableString(job.worker_id);
  if (customerId) {
    await insertUserNotification(client, {
      userId: customerId,
      jobId,
      eventType: "payment_confirmed",
      title: "Thanh toán đã được xác nhận",
      body: "SePay đã ghi nhận giao dịch VietQR cho yêu cầu này.",
      metadata: { provider: SEPAY_VIETQR_PROVIDER, payment_code: paymentCode },
    });
  }
  if (workerId) {
    await insertUserNotification(client, {
      userId: workerId,
      jobId,
      eventType: "payment_confirmed",
      title: "Thu nhập đã được cập nhật",
      body: "SePay đã xác nhận thanh toán VietQR cho công việc này.",
      metadata: { provider: SEPAY_VIETQR_PROVIDER, payment_code: paymentCode },
    });
  }
  return { success: true as const };
}

type SepayWebhookPayload = {
  content: string | null;
  description: string | null;
  paymentCode: string | null;
  referenceCode: string | null;
  transactionDate: string | null;
  transactionId: string;
  transferAmount: number;
  transferType: "in" | "out" | string;
};

function serializePaymentIntent(row: Record<string, unknown>) {
  return {
    job_id: asString(row.id),
    status: asJobStatus(row.status),
    payment: {
      provider: SEPAY_VIETQR_PROVIDER,
      status: asPaymentStatus(row.payment_status) ?? "not_started",
      gross_amount: nullableNumber(row.gross_amount),
      platform_fee: nullableNumber(row.platform_fee),
      worker_net: nullableNumber(row.worker_net),
      payment_code: nullableString(row.payment_code),
      transfer_content: nullableString(row.payment_transfer_content),
      qr_image_url: nullableString(row.payment_qr_image_url),
      expires_at: nullableString(row.payment_expires_at),
      received_at: nullableString(row.payment_received_at),
      amount_received: nullableNumber(row.payment_amount_received),
      updated_at: nullableString(row.payment_updated_at),
    },
  };
}

function buildSepayPaymentCode(displayCode: string): string {
  const normalized = displayCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `NS${normalized}`.slice(0, 32);
}

function buildSepayQrImageUrl(input: {
  amount: number;
  bankAccount: string;
  bankName: string;
  baseUrl?: string;
  description: string;
}): string {
  const url = new URL(input.baseUrl?.trim() || SEPAY_QR_BASE_URL);
  url.searchParams.set("acc", input.bankAccount);
  url.searchParams.set("bank", input.bankName);
  url.searchParams.set("amount", String(input.amount));
  url.searchParams.set("des", input.description);
  url.searchParams.set("template", "compact");
  url.searchParams.set("showinfo", "false");
  url.searchParams.set("download", "false");
  url.searchParams.set("store", "NestScout");
  return url.toString();
}

function normalizeBankAccount(value: string | null): string | null {
  const normalized = value?.replace(/[\s.-]/g, "") ?? "";
  return normalized.length >= 6 && normalized.length <= 50 ? normalized : null;
}

function normalizeBankName(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length >= 2 && normalized.length <= 100 ? normalized : null;
}

function assertSepayWebhookAuth(headers: Headers, secrets: EdgeServiceSecrets) {
  const configured = secrets.sepayWebhookApiKey?.trim();
  if (!configured) {
    apiFailure("CONFIG_MISSING", "SePay webhook chưa được cấu hình", 503);
  }
  const value = headers.get("authorization")?.trim() ?? "";
  const accepted = [`Apikey ${configured}`, `apikey ${configured}`];
  if (!accepted.some((candidate) => safeEqual(candidate, value))) {
    apiFailure("AUTH_FORBIDDEN", "Webhook không hợp lệ", 403);
  }
}

function parseSepayWebhook(input: unknown): SepayWebhookPayload {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Webhook không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  const transactionId = String(record.id ?? "").trim();
  const transferAmount = integerAmount(record.transferAmount);
  const transferType = nullableString(record.transferType)?.toLowerCase() ?? "";
  if (!transactionId || transferAmount === null || !transferType) {
    apiFailure("VALIDATION", "Webhook không hợp lệ", 400);
  }
  return {
    content: nullableString(record.content),
    description: nullableString(record.description),
    paymentCode: normalizePaymentCode(nullableString(record.code)),
    referenceCode: nullableString(record.referenceCode),
    transactionDate: nullableString(record.transactionDate),
    transactionId,
    transferAmount,
    transferType,
  };
}

function integerAmount(value: unknown): number | null {
  const number = nullableNumber(value);
  if (number === null || !Number.isInteger(number) || number <= 0) return null;
  return number;
}

function extractSepayPaymentCode(
  content: string | null,
  description: string | null,
): string | null {
  const source = `${content ?? ""} ${description ?? ""}`;
  const match = source.toUpperCase().match(/\bNSMOH[A-Z0-9]{4,24}\b/);
  return normalizePaymentCode(match?.[0] ?? null);
}

function normalizePaymentCode(value: string | null): string | null {
  const normalized = value?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() ?? "";
  return normalized.startsWith("NSMOH") && normalized.length >= 8
    ? normalized.slice(0, 32)
    : null;
}

async function markPaymentMismatch(
  client: DbClient,
  jobId: string,
  payload: SepayWebhookPayload,
  expectedAmount: number | null,
  currentStatus: JobStatus,
) {
  const now = new Date().toISOString();
  const mismatchReason = payload.transferType !== "in"
    ? "transfer_type"
    : currentStatus !== "payment_pending"
      ? "status"
      : "amount";
  await dbQuery(
    client
      .from("jobs")
      .update({
        payment_status: "amount_mismatch",
        payment_amount_received: payload.transferAmount,
        payment_failure_reason: mismatchReason,
        payment_updated_at: now,
      })
      .eq("id", jobId),
  );
  await logProviderJobEvent(client, {
    jobId,
    eventType: "sepay_payment_mismatch",
    fromStatus: currentStatus,
    toStatus: currentStatus,
    metadata: {
      provider: SEPAY_VIETQR_PROVIDER,
      expected_amount: expectedAmount,
      transfer_amount: payload.transferAmount,
      transfer_type: payload.transferType,
      sepay_transaction_id: payload.transactionId,
      reference_code: payload.referenceCode,
      reason: mismatchReason,
    },
  });
}

async function logProviderJobEvent(
  client: DbClient,
  input: {
    eventType: string;
    fromStatus: JobStatus | null;
    jobId: string;
    metadata: Record<string, unknown>;
    toStatus: JobStatus | null;
  },
) {
  await dbQuery(
    client.from("job_events").insert({
      job_id: input.jobId,
      actor_id: null,
      actor_role: null,
      event_type: input.eventType,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      safe_metadata: input.metadata,
    }),
  ).catch(() => {
    console.warn("mobile-api provider event log failed", {
      eventType: input.eventType,
    });
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function buildKaelCustomerAcceptedCompletionDecision(
  jobId: string,
  finalPrice: number | null,
  input: {
    completionNotes: string | null;
    completionPhotoUrls: string[];
    customerId: string;
  },
): KaelAutonomyDecision {
  const photoCount = input.completionPhotoUrls.length;
  const noteLength = input.completionNotes?.trim().length ?? 0;
  return buildKaelAutonomyDecision({
    action: "confirm_completion",
    policyId: "kael.autonomy.v2.customer_completion_acceptance",
    evidence: [
      {
        kind: "customer_input",
        reference_id: input.customerId,
        summary: "Customer accepted completion; server treats the action as input to Kael decision.",
      },
      {
        kind: "worker_evidence",
        reference_id: jobId,
        summary: `Worker completion evidence on record: ${photoCount} photo(s), note length ${noteLength}.`,
      },
      {
        kind: "system_check",
        reference_id: jobId,
        summary: finalPrice && finalPrice > 0
          ? "Final price is already Kael-locked before completion confirmation."
          : "Final price is missing and will be rejected before persistence.",
      },
      {
        kind: "policy",
        reference_id: "RULES.md#rule-7",
        summary: "Kael Autonomy v2 keeps completion authority server-side and appealable.",
      },
    ],
    confidence: photoCount > 0 || noteLength >= 12 ? 0.88 : 0.76,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_confirmed_completion",
  });
}

async function submitReview(ctx: MobileApiContext, jobId: string, input: {
  rating: number;
  tags?: string[];
  comment?: string;
}) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select:
      "id, status, customer_id, worker_id, service_type, address_district, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, final_price",
  });
  if (job.status === "reviewed") {
    const existing = await dbQuery<Record<string, unknown>>(
      client
        .from("reviews")
        .select("id")
        .eq("job_id", jobId)
        .eq("customer_id", ctx.user.id)
        .maybeSingle(),
    );
    if (existing.error || !existing.data) {
      apiFailure("INVALID_STATUS", "Yêu cầu đã được đánh giá nhưng chưa tìm thấy bản ghi đánh giá", 409);
    }
    return {
      review_id: asString(existing.data.id),
      job_id: jobId,
      status: "reviewed" as JobStatus,
    };
  }
  const transition = validateWorkflowTransition({
    event: "review_submitted",
    from: job.status as JobStatus,
    to: "reviewed",
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("submit_review_atomic", {
      p_job_id: jobId,
      p_customer_id: ctx.user.id,
      p_rating: input.rating,
      p_tags: input.tags ?? [],
      p_comment: input.comment ?? null,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể gửi đánh giá", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi đánh giá", 500);
  if (!row.ok) {
    const existingReviewId = nullableString(row.review_id);
    if (nullableString(row.error_code) === "ALREADY_REVIEWED" && existingReviewId) {
      return {
        review_id: existingReviewId,
        job_id: jobId,
        status: asJobStatus(row.job_status ?? "reviewed"),
      };
    }
    mapReviewError(nullableString(row.error_code));
  }

  await logJobEvent(
    client,
    jobId,
    "customer_reviewed",
    ctx,
    null,
    "reviewed",
    { rating: input.rating },
  );
  await recordLearningReviewOutcome(client, {
    jobId,
    finalPrice: nullableNumber(job.final_price),
    rating: input.rating,
  });
  await queueKaelLearningEvent(client, 'post-A14', {
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    job_id: jobId,
    customer_id: ctx.user.id,
    worker_id: nullableString(job.worker_id) ?? undefined,
    service_type: asServiceType(job.service_type),
    problem_slug: nullableString(job.kael_problem_identified) ?? undefined,
    district_code: nullableString(job.address_district) ?? undefined,
    complexity: asComplexityOrNull(job.kael_complexity) ?? undefined,
    baseline_min: nullableNumber(job.kael_price_min) ?? undefined,
    baseline_max: nullableNumber(job.kael_price_max) ?? undefined,
    final_price: nullableNumber(job.final_price),
    rating: input.rating,
    review_tags: input.tags ?? [],
    scope_change_requested: false,
    reviewed_at: new Date().toISOString(),
  });
  await recordNormalTransactionMemory(client, {
    jobId,
    customerId: ctx.user.id,
    workerId: nullableString(job.worker_id),
    serviceType: asServiceType(job.service_type),
    problemSummary: nullableString(job.kael_problem_identified),
    district: nullableString(job.address_district),
    rating: input.rating,
    finalPrice: nullableNumber(job.final_price),
  });
  await insertUserNotification(client, {
    userId: ctx.user.id,
    jobId,
    eventType: "review_thanks",
    title: "\u0043\u1ea3m \u01a1n b\u1ea1n \u0111\u00e3 \u0111\u00e1nh gi\u00e1",
    body: "Kael \u0111\u00e3 ghi nh\u1eadn \u0111\u00e1nh gi\u00e1 \u0111\u1ec3 c\u1ea3i thi\u1ec7n l\u1ea7n sau.",
    metadata: { rating: input.rating },
  });
  return {
    review_id: asString(row.review_id),
    job_id: jobId,
    status: row.job_status as JobStatus,
  };
}

async function submitCustomerKaelFeedback(
  ctx: MobileApiContext,
  input: CustomerKaelFeedbackInput,
) {
  const client = db(ctx);
  const now = new Date().toISOString();
  const message = input.message.trim();
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("customer_kael_feedback")
      .insert({
        customer_id: ctx.user.id,
        language: input.language,
        message,
        message_scrubbed: scrubSensitiveForLLM(message),
        safe_metadata: {
          kael_feedback_version: "v1",
          submitted_from: "customer_profile",
        },
        source: input.source,
        status: "new",
      })
      .select("id, status, created_at")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể gửi góp ý cho Kael", 500);
  }
  if (!result.data) {
    apiFailure("DB_ERROR", "Không thể gửi góp ý cho Kael", 500);
  }

  return {
    feedback_id: asString(result.data.id),
    status: "new" as const,
    created_at: nullableString(result.data.created_at) ?? now,
  };
}

async function submitWorkerApplication(
  input: WorkerApplicationSubmitInput,
  secrets: EdgeServiceSecrets,
) {
  return submitWorkerApplicationForReview(publicRouteDb(secrets), input);
}

export async function submitWorkerApplicationForReview(
  client: DbClient,
  input: WorkerApplicationSubmitInput,
) {
  const now = new Date().toISOString();
  if (input.client_request_id) {
    const existing = await dbQuery<Record<string, unknown>>(
      client
        .from("kael_admin_queue")
        .select("id, status, created_at")
        .eq("queue_type", "worker_application_review")
        .eq("status", "open")
        .eq("safe_metadata->>client_request_id", input.client_request_id)
        .maybeSingle(),
    );
    if (existing.error) {
      apiFailure("DB_ERROR", "Không thể kiểm tra hồ sơ xét duyệt thợ", 500);
    }
    if (existing.data) {
      return {
        application_id: asString(existing.data.id),
        status: "open" as const,
        submitted_at: nullableString(existing.data.created_at) ?? now,
      };
    }
  }

  const inserted = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_admin_queue")
      .insert({
        job_id: null,
        actor_id: null,
        actor_role: "system",
        queue_type: "worker_application_review",
        priority: "medium",
        status: "open",
        escalation_level: "soft",
        reason_code: "worker_application_submitted",
        response_summary: "Worker application submitted for manual review",
        safe_metadata: compactMetadata({
          schema_version: "worker_application_review.v1",
          source: input.source,
          language: input.language,
          contact: input.contact,
          contact_kind: classifyWorkerApplicationContact(input.contact),
          client_request_id: input.client_request_id,
        }),
      })
      .select("id, status, created_at")
      .maybeSingle(),
  );
  if (inserted.error || !inserted.data) {
    apiFailure("DB_ERROR", "Không thể gửi hồ sơ xét duyệt thợ", 500);
  }
  return {
    application_id: asString(inserted.data.id),
    status: "open" as const,
    submitted_at: nullableString(inserted.data.created_at) ?? now,
  };
}

function classifyWorkerApplicationContact(contact: string) {
  return contact.includes("@") ? "email" : "phone";
}

type NormalTransactionMemoryInput = {
  jobId: string;
  customerId: string;
  workerId: string | null;
  serviceType: ServiceType;
  problemSummary: string | null;
  district: string | null;
  rating: number;
  finalPrice: number | null;
};

async function recordNormalTransactionMemory(
  client: DbClient,
  input: NormalTransactionMemoryInput,
) {
  const observedAt = new Date().toISOString();
  const customerExisting = await dbQuery<Record<string, unknown>>(
    client
      .from("customer_kael_memory")
      .select("service_preferences, trust_signals, safe_metadata")
      .eq("customer_id", input.customerId)
      .maybeSingle(),
  );
  const servicePreferences = nullableRecord(
    customerExisting.data?.service_preferences,
  ) ?? {};
  const previousServicePreference = nullableRecord(
    servicePreferences[input.serviceType],
  ) ?? {};
  const trustSignals = nullableRecord(customerExisting.data?.trust_signals) ?? {};
  const customerMetadata = nullableRecord(customerExisting.data?.safe_metadata) ??
    {};

  await dbQuery(
    client.from("customer_kael_memory").upsert({
      customer_id: input.customerId,
      preference_summary:
        `Normal ${input.serviceType} transaction reviewed with rating ${input.rating}.`,
      service_preferences: {
        ...servicePreferences,
        [input.serviceType]: {
          ...previousServicePreference,
          last_rating: input.rating,
          last_district: input.district,
          last_normal_job_id: input.jobId,
          observed_at: observedAt,
        },
      },
      trust_signals: {
        ...trustSignals,
        reviewed_after_completion: true,
        last_rating: input.rating,
        last_normal_job_id: input.jobId,
      },
      safe_metadata: {
        ...customerMetadata,
        last_normal_transaction: {
          job_id: input.jobId,
          service_type: input.serviceType,
          district: input.district,
          final_price_present: input.finalPrice !== null,
          problem_summary_present: input.problemSummary !== null,
          layers: ["L2", "L3", "L5"],
          observed_at: observedAt,
        },
      },
      last_observed_at: observedAt,
    }),
  ).catch(() => {
    console.warn("mobile-api customer kael memory write failed", {
      jobId: input.jobId,
    });
  });

  if (input.workerId) {
    const workerExisting = await dbQuery<Record<string, unknown>>(
      client
        .from("worker_kael_memory")
        .select("service_skill_proficiency, reliability_signals, safe_metadata")
        .eq("worker_id", input.workerId)
        .maybeSingle(),
    );
    const proficiency = nullableRecord(
      workerExisting.data?.service_skill_proficiency,
    ) ?? {};
    const previousProficiency = nullableRecord(proficiency[input.serviceType]) ??
      {};
    const reliabilitySignals = nullableRecord(
      workerExisting.data?.reliability_signals,
    ) ?? {};
    const workerMetadata = nullableRecord(workerExisting.data?.safe_metadata) ??
      {};

    await dbQuery(
      client.from("worker_kael_memory").upsert({
        worker_id: input.workerId,
        service_skill_summary:
          `Normal ${input.serviceType} job completed with customer rating ${input.rating}.`,
        service_skill_proficiency: {
          ...proficiency,
          [input.serviceType]: {
            ...previousProficiency,
            last_rating: input.rating,
            last_normal_job_id: input.jobId,
            observed_at: observedAt,
          },
        },
        reliability_signals: {
          ...reliabilitySignals,
          customer_reviewed_after_completion: true,
          last_rating: input.rating,
          last_normal_job_id: input.jobId,
        },
        safe_metadata: {
          ...workerMetadata,
          last_normal_transaction: {
            job_id: input.jobId,
            service_type: input.serviceType,
            final_price_present: input.finalPrice !== null,
            layers: ["L2", "L4", "L5"],
            observed_at: observedAt,
          },
        },
        last_observed_at: observedAt,
      }),
    ).catch(() => {
      console.warn("mobile-api worker kael memory write failed", {
        jobId: input.jobId,
      });
    });
  }

  await dbQuery(
    client.from("job_events").insert({
      job_id: input.jobId,
      actor_id: input.customerId,
      actor_role: "customer",
      event_type: "kael_memory_l2_observed",
      from_status: null,
      to_status: null,
      safe_metadata: {
        normal_case: true,
        layers: ["L2", "L3", "L4", "L5"],
        service_type: input.serviceType,
        final_price_present: input.finalPrice !== null,
      },
    }),
  ).catch(() => {
    console.warn("mobile-api job memory event write failed", {
      jobId: input.jobId,
    });
  });

  await logMemoryAudit(client, {
    subjectType: "job",
    subjectId: input.jobId,
    actorId: input.customerId,
    operation: "write",
    layer: "L2",
    purpose: "normal_transaction_review",
  });
  await logMemoryAudit(client, {
    subjectType: "customer",
    subjectId: input.customerId,
    actorId: input.customerId,
    operation: "write",
    layer: "L3",
    purpose: "normal_transaction_review",
  });
  if (input.workerId) {
    await logMemoryAudit(client, {
      subjectType: "worker",
      subjectId: input.workerId,
      actorId: input.customerId,
      operation: "write",
      layer: "L4",
      purpose: "normal_transaction_review",
    });
  }
  await logMemoryAudit(client, {
    subjectType: "domain",
    subjectId: null,
    actorId: input.customerId,
    operation: "write",
    layer: "L5",
    purpose: "normal_transaction_review",
  });
}

async function registerWorker(
  ctx: MobileApiContext,
  input: WorkerRegisterInput,
) {
  const rateCheck = checkRateLimit(
    `worker_register:${ctx.user.id}`,
    AI_SESSION_LIMIT,
  );
  if (!rateCheck.allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }

  const client = db(ctx);
  const profile = await dbQuery<Record<string, unknown>>(
    client.from("profiles").select("role").eq("id", ctx.user.id).single(),
  );
  if (profile.error || !profile.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ", 404);
  }
  if (profile.data.role !== "worker") {
    apiFailure("WRONG_ROLE", "Tài khoản này không phải tài khoản thợ", 403);
  }

  const existing = await dbQuery<Record<string, unknown>>(
    client.from("worker_profiles").select("verification_status, is_suspended")
      .eq(
        "id",
        ctx.user.id,
      ).maybeSingle(),
  );
  if (existing.error) apiFailure("DB_ERROR", "Không thể tải hồ sơ thợ", 500);
  if (
    existing.data &&
    (
      ["approved", "suspended"].includes(
        existing.data.verification_status as string,
      ) ||
      existing.data.is_suspended === true
    )
  ) {
    apiFailure(
      "ALREADY_FINALIZED",
      "Hồ sơ đã được duyệt hoặc bị khóa. Liên hệ hỗ trợ để cập nhật.",
      409,
    );
  }

  const now = new Date().toISOString();
  const districts = normalizeWorkerDistricts(input.districts);
  if (!districts) {
    apiFailure("VALIDATION", "Khu vực làm việc không hợp lệ", 400);
  }
  const upserted = await dbQuery<
    { id: string; verification_status: WorkerVerificationStatus }
  >(
    client
      .from("worker_profiles")
      .upsert({
        id: ctx.user.id,
        legal_name: input.legal_name,
        date_of_birth: input.date_of_birth,
        gender: input.gender ?? null,
        service_types: input.service_types,
        years_experience: input.years_experience,
        districts,
        home_lat: input.home_lat ?? null,
        home_lng: input.home_lng ?? null,
        service_radius_km: input.service_radius_km ?? 8,
        problem_specializations: input.problem_specializations ?? [],
        cccd_front_url: input.cccd_front_url,
        cccd_back_url: input.cccd_back_url,
        selfie_url: input.selfie_url,
        bank_account: input.bank_account,
        bank_name: input.bank_name,
        verification_status: "submitted",
        is_approved: false,
        is_available: false,
        is_suspended: false,
        updated_at: now,
      })
      .select("id, verification_status")
      .single(),
  );
  if (upserted.error || !upserted.data) {
    apiFailure("DB_ERROR", "Không thể lưu hồ sơ", 500);
  }
  return {
    worker_id: upserted.data.id,
    verification_status: asWorkerVerificationStatus(
      upserted.data.verification_status,
    ),
    submitted_at: now,
  };
}

async function getMyKaelMemory(ctx: MobileApiContext) {
  if (ctx.role === "worker") return getWorkerKaelMemory(ctx);
  const client = db(ctx);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("customer_kael_memory")
      .select("customer_id, language, preference_summary, service_preferences, trust_signals, memory_version, last_observed_at")
      .eq("customer_id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải bộ nhớ Kael", 500);
  await logMemoryAudit(client, {
    subjectType: "customer",
    subjectId: ctx.user.id,
    actorId: ctx.user.id,
    operation: "read",
    layer: "L3",
    purpose: "self_view",
  });
  return {
    subject_type: "customer" as const,
    memory: result.data ? sanitizeMemoryObject(result.data) : null,
  };
}

async function getWorkerKaelMemory(ctx: MobileApiContext) {
  const client = db(ctx);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_kael_memory")
      .select("worker_id, language, service_skill_summary, service_skill_proficiency, reliability_signals, red_flags, safe_metadata, memory_version, last_observed_at")
      .eq("worker_id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải bộ nhớ Kael", 500);
  await logMemoryAudit(client, {
    subjectType: "worker",
    subjectId: ctx.user.id,
    actorId: ctx.user.id,
    operation: "read",
    layer: "L4",
    purpose: "self_view",
  });
  return {
    subject_type: "worker" as const,
    memory: result.data ? sanitizeMemoryObject(result.data) : null,
  };
}

async function updateMyCustomerKaelMemoryPreference(
  ctx: MobileApiContext,
  input: CustomerKaelMemoryPreferenceUpdateInput,
) {
  const client = db(ctx);
  const existing = await dbQuery<Record<string, unknown>>(
    client
      .from("customer_kael_memory")
      .select("service_preferences, memory_version")
      .eq("customer_id", ctx.user.id)
      .maybeSingle(),
  );
  if (existing.error) {
    apiFailure("DB_ERROR", "Không thể tải bộ nhớ Kael", 500);
  }

  const currentPreferences = asRecord(existing.data?.service_preferences);
  const currentPermissions = asRecord(currentPreferences.memory_permissions);
  const nextPreferences = {
    ...currentPreferences,
    memory_permissions: {
      ...currentPermissions,
      [input.key]: input.enabled,
    },
  };
  const currentVersion = nullableNumber(existing.data?.memory_version) ?? 1;
  const nextVersion = existing.data ? currentVersion + 1 : 1;
  const now = new Date().toISOString();
  const upserted = await dbQuery<Record<string, unknown>>(
    client
      .from("customer_kael_memory")
      .upsert({
        customer_id: ctx.user.id,
        service_preferences: nextPreferences,
        memory_version: nextVersion,
        last_observed_at: now,
      }, { onConflict: "customer_id" })
      .select("customer_id, language, preference_summary, service_preferences, trust_signals, memory_version, last_observed_at")
      .single(),
  );
  if (upserted.error || !upserted.data) {
    apiFailure("DB_ERROR", "Không thể lưu bộ nhớ Kael", 500);
  }

  await logMemoryAudit(client, {
    subjectType: "customer",
    subjectId: ctx.user.id,
    actorId: ctx.user.id,
    operation: "write",
    layer: "L3",
    purpose: "self_update_preferences",
  });

  return {
    subject_type: "customer" as const,
    memory: sanitizeMemoryObject(upserted.data),
  };
}

async function updateMyWorkerKaelMemoryPreference(
  ctx: MobileApiContext,
  input: WorkerKaelMemoryPreferenceUpdateInput,
) {
  const client = db(ctx);
  const existing = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_kael_memory")
      .select("safe_metadata, memory_version")
      .eq("worker_id", ctx.user.id)
      .maybeSingle(),
  );
  if (existing.error) {
    apiFailure("DB_ERROR", "Không thể tải bộ nhớ Kael", 500);
  }

  const currentMetadata = asRecord(existing.data?.safe_metadata);
  const currentPreferences = asRecord(currentMetadata.memory_preferences);
  const nextMetadata = {
    ...currentMetadata,
    memory_preferences: {
      ...currentPreferences,
      [input.key]: input.enabled,
    },
  };
  const currentVersion = nullableNumber(existing.data?.memory_version) ?? 1;
  const nextVersion = existing.data ? currentVersion + 1 : 1;
  const now = new Date().toISOString();
  const upserted = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_kael_memory")
      .upsert({
        worker_id: ctx.user.id,
        safe_metadata: nextMetadata,
        memory_version: nextVersion,
        last_observed_at: now,
      }, { onConflict: "worker_id" })
      .select("worker_id, language, service_skill_summary, service_skill_proficiency, reliability_signals, red_flags, safe_metadata, memory_version, last_observed_at")
      .single(),
  );
  if (upserted.error || !upserted.data) {
    apiFailure("DB_ERROR", "Không thể lưu bộ nhớ Kael", 500);
  }

  await logMemoryAudit(client, {
    subjectType: "worker",
    subjectId: ctx.user.id,
    actorId: ctx.user.id,
    operation: "write",
    layer: "L4",
    purpose: "self_update_preferences",
  });

  return {
    subject_type: "worker" as const,
    memory: sanitizeMemoryObject(upserted.data),
  };
}

async function deleteMyKaelMemory(ctx: MobileApiContext) {
  const client = db(ctx);
  const subjectType: "customer" | "worker" = ctx.role === "worker" ? "worker" : "customer";
  const table = subjectType === "worker" ? "worker_kael_memory" : "customer_kael_memory";
  const column = subjectType === "worker" ? "worker_id" : "customer_id";
  const result = await dbQuery<null>(
    client.from(table).delete().eq(column, ctx.user.id),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể xóa bộ nhớ Kael", 500);
  await logMemoryAudit(client, {
    subjectType,
    subjectId: ctx.user.id,
    actorId: ctx.user.id,
    operation: "delete",
    layer: subjectType === "worker" ? "L4" : "L3",
    purpose: "self_delete",
  });
  return {
    subject_type: subjectType,
    deleted: true as const,
  };
}

async function getCustomerProfileInsights(ctx: MobileApiContext) {
  const client = db(ctx);
  const accountProfileResult = await dbQuery<Record<string, unknown>>(
    client
      .from("profiles")
      .select("created_at")
      .eq("id", ctx.user.id)
      .maybeSingle(),
  );
  if (accountProfileResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chỉ số hồ sơ", 500);
  }

  const profileResult = await dbQuery<Record<string, unknown>>(
    client
      .from("customer_profiles")
      .select("building_name, unit_number, floor, district, created_at")
      .eq("id", ctx.user.id)
      .maybeSingle(),
  );
  if (profileResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chỉ số hồ sơ", 500);
  }

  const jobsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("jobs")
      .select(
        "id, status, service_type, created_at, completed_at, confirmed_at, paid_at, reviewed_at, final_price, kael_price_min, kael_price_max",
      )
      .eq("customer_id", ctx.user.id)
      .order("created_at", { ascending: true })
      .limit(500),
  );
  if (jobsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chỉ số hồ sơ", 500);
  }

  const jobs = (jobsResult.data ?? []).map(customerProfileInsightJobFromRow);
  const jobIds = jobs.map((job) => job.id).filter(Boolean);
  let disputes: CustomerProfileInsightDisputeRow[] = [];
  if (jobIds.length > 0) {
    const disputesResult = await dbQuery<Array<Record<string, unknown>>>(
      client
        .from("disputes")
        .select("job_id, status")
        .in("job_id", jobIds),
    );
    if (disputesResult.error) {
      apiFailure("DB_ERROR", "Không thể tải chỉ số hồ sơ", 500);
    }
    disputes = (disputesResult.data ?? []).map((row) => ({
      job_id: nullableString(row.job_id),
      status: nullableString(row.status),
    }));
  }

  const reviewsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("reviews")
      .select("job_id, rating")
      .eq("customer_id", ctx.user.id),
  );
  if (reviewsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chỉ số hồ sơ", 500);
  }

  const kaelInteractionResult = await dbQuery<null>(
    client
      .from("kael_chat_sessions")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", ctx.user.id),
  );
  if (kaelInteractionResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chỉ số hồ sơ", 500);
  }

  const savedAddressResult = await dbQuery<null>(
    client
      .from("kael_chat_pre_intake_memory")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", ctx.user.id),
  );
  if (savedAddressResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chỉ số hồ sơ", 500);
  }

  return buildCustomerProfileInsights({
    accountProfile: accountProfileResult.data
      ? {
        created_at: nullableString(accountProfileResult.data.created_at),
      }
      : null,
    customerId: ctx.user.id,
    customerProfile: profileResult.data
      ? {
        building_name: nullableString(profileResult.data.building_name),
        created_at: nullableString(profileResult.data.created_at),
        district: nullableString(profileResult.data.district),
        floor: nullableString(profileResult.data.floor),
        unit_number: nullableString(profileResult.data.unit_number),
      }
      : null,
    disputes,
    jobs,
    kaelInteractionCount: Math.max(0, kaelInteractionResult.count ?? 0),
    reviews: (reviewsResult.data ?? []).map(customerProfileInsightReviewFromRow),
    savedAddressCount: Math.max(0, savedAddressResult.count ?? 0),
  });
}

async function getCustomerPaymentMethod(
  ctx: MobileApiContext,
): Promise<CustomerPaymentMethodResponse> {
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("customer_payment_methods")
      .select(
        "id, bank_key, bank_name, account_holder_name, bank_account_masked, status, is_default, verified_at, updated_at",
      )
      .eq("customer_id", ctx.user.id)
      .eq("is_default", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải tài khoản nhận tiền", 500);
  }
  return {
    payment_method: result.data ? customerPaymentMethodFromRow(result.data) : null,
  };
}

async function saveCustomerPaymentMethod(
  ctx: MobileApiContext,
  input: CustomerPaymentMethodSaveInput,
): Promise<CustomerPaymentMethodResponse> {
  const account = input.bank_account.trim();
  const holderName = input.account_holder_name.trim();
  const masked = maskCustomerBankAccount(account);
  if (!masked) {
    apiFailure("VALIDATION", "Số tài khoản không hợp lệ", 400);
  }

  const existingResult = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("customer_payment_methods")
      .select("id")
      .eq("customer_id", ctx.user.id)
      .eq("is_default", true)
      .maybeSingle(),
  );
  if (existingResult.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra tài khoản nhận tiền", 500);
  }

  const payload = {
    account_holder_name: holderName,
    bank_account: account,
    bank_account_masked: masked,
    bank_key: input.bank_key,
    bank_name: input.bank_name.trim(),
    customer_id: ctx.user.id,
    is_default: true,
    status: "pending_verification",
    verified_at: null,
  };

  const query = existingResult.data
    ? db(ctx)
      .from("customer_payment_methods")
      .update(payload)
      .eq("id", existingResult.data.id)
      .eq("customer_id", ctx.user.id)
      .select(
        "id, bank_key, bank_name, account_holder_name, bank_account_masked, status, is_default, verified_at, updated_at",
      )
      .single()
    : db(ctx)
      .from("customer_payment_methods")
      .insert(payload)
      .select(
        "id, bank_key, bank_name, account_holder_name, bank_account_masked, status, is_default, verified_at, updated_at",
      )
      .single();

  const result = await dbQuery<Record<string, unknown>>(query);
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể lưu tài khoản nhận tiền", 500);
  }
  return {
    payment_method: customerPaymentMethodFromRow(result.data),
  };
}

async function saveWorkerPayoutMethod(
  ctx: MobileApiContext,
  input: WorkerPayoutMethodSaveInput,
): Promise<WorkerPayoutMethodResponse> {
  const account = normalizeBankAccount(input.bank_account);
  const bankName = normalizeBankName(input.bank_name);
  const holderName = input.account_holder_name.trim();
  if (!account || !bankName || holderName.length < 2) {
    apiFailure("VALIDATION", "Dữ liệu tài khoản nhận tiền không hợp lệ", 400);
  }

  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("worker_profiles")
      .update({
        bank_account: account,
        bank_name: bankName,
      })
      .eq("id", ctx.user.id)
      .select("id, bank_account, bank_name")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể lưu tài khoản nhận tiền của thợ", 500);
  }
  if (!result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
  }

  return {
    payout_method: {
      account_holder_name: holderName,
      bank_account_masked: maskBankAccount(nullableString(result.data.bank_account)) ?? maskCustomerBankAccount(account) ?? "****",
      bank_key: input.bank_key,
      bank_name: normalizeBankName(nullableString(result.data.bank_name)) ?? bankName,
      status: "pending_verification",
      updated_at: new Date().toISOString(),
    },
    worker_profile: await getWorkerProfile(ctx),
  };
}

function customerPaymentMethodFromRow(row: Record<string, unknown>): CustomerPaymentMethodResponse["payment_method"] {
  const status = asString(row.status);
  const normalizedStatus = status === "verified" || status === "rejected" ? status : "pending_verification";
  return {
    account_holder_name: asString(row.account_holder_name),
    bank_account_masked: asString(row.bank_account_masked),
    bank_key: asString(row.bank_key),
    bank_name: asString(row.bank_name),
    id: asString(row.id),
    is_default: Boolean(row.is_default),
    status: normalizedStatus,
    updated_at: asString(row.updated_at),
    verified_at: nullableString(row.verified_at),
  };
}

function maskCustomerBankAccount(account: string) {
  return account.length >= 4 ? `**** ${account.slice(-4)}` : null;
}

function customerProfileInsightJobFromRow(row: Record<string, unknown>): CustomerProfileInsightJobRow {
  return {
    id: asString(row.id),
    status: asString(row.status),
    service_type: asString(row.service_type),
    created_at: nullableString(row.created_at),
    completed_at: nullableString(row.completed_at),
    confirmed_at: nullableString(row.confirmed_at),
    paid_at: nullableString(row.paid_at),
    reviewed_at: nullableString(row.reviewed_at),
    final_price: nullableNumber(row.final_price),
    kael_price_min: nullableNumber(row.kael_price_min),
    kael_price_max: nullableNumber(row.kael_price_max),
  };
}

function customerProfileInsightReviewFromRow(row: Record<string, unknown>): CustomerProfileInsightReviewRow {
  return {
    job_id: nullableString(row.job_id),
    rating: nullableNumber(row.rating),
  };
}

export function buildCustomerProfileInsights(
  input: CustomerProfileInsightInput,
): CustomerProfileInsightsResponse {
  const jobs = input.jobs.filter((job) => Boolean(job.id));
  const completedJobs = jobs.filter(isCustomerProfileCompletedJob);
  const transactionJobs = jobs.filter(isCustomerProfileTransactionJob);
  const protectedJobs = transactionJobs.filter(isCustomerProfileProtectedTransaction);
  const fairPriceJobs = transactionJobs.filter(isCustomerProfileFairPriceTransaction);
  const disputedJobIds = new Set(
    input.disputes
      .filter(isCountedCustomerProfileDispute)
      .map((dispute) => dispute.job_id)
      .filter((jobId): jobId is string => Boolean(jobId)),
  );
  const disputedTransactionCount = transactionJobs.filter((job) =>
    disputedJobIds.has(job.id)
  ).length;
  const totalTransactionCount = transactionJobs.length;
  const disputeFreeRatePercent = totalTransactionCount > 0
    ? Math.round(
      ((totalTransactionCount - disputedTransactionCount) /
        totalTransactionCount) * 100,
    )
    : 0;
  const protectedTransactionCount = protectedJobs.length;
  const protectedValueVnd = sumCustomerProfileMoney(
    protectedJobs.map((job) => job.final_price),
  );
  const totalSpendVnd = sumCustomerProfileMoney(
    transactionJobs.map((job) => job.final_price),
  );
  const priceSavingsVnd = sumCustomerProfileMoney(
    fairPriceJobs.map((job) => {
      const price = job.final_price ?? 0;
      const max = job.kael_price_max ?? 0;
      return Math.max(0, max - price);
    }),
  );
  const kaelInteractionCount = Number.isFinite(input.kaelInteractionCount)
    ? Math.max(0, Math.floor(input.kaelInteractionCount))
    : 0;
  const usageRankPoints = customerProfileUsageRankPoints({
    completedCount: completedJobs.length,
    fairPriceCount: fairPriceJobs.length,
    kaelInteractionCount,
    protectedCount: protectedTransactionCount,
    reviewedCount: completedJobs.filter(isCustomerProfileReviewedJob).length,
  });
  const usageRankLevel = usageRankPoints <= 0
    ? 0
    : Math.min(
      CUSTOMER_PROFILE_USAGE_RANK_MAX,
      Math.max(1, Math.floor(usageRankPoints / CUSTOMER_PROFILE_USAGE_RANK_STEP) + 1),
    );
  const protectionScore = customerProfileMoneyProtectionScore({
    disputedTransactionCount,
    protectedTransactionCount,
    totalTransactionCount,
  });
  const activeStreakDays = customerProfileActiveStreakDays(completedJobs);
  const positiveReviewRatePercent = customerProfilePositiveReviewRatePercent(input.reviews);
  const savedAddressCount = customerProfileSavedAddressCount(
    input.customerProfile,
    input.savedAddressCount,
  );

  return {
    customer_id: input.customerId,
    member_since: customerProfileMemberSince(input.accountProfile, input.customerProfile, jobs),
    kael_interaction_count: kaelInteractionCount,
    completed_service_count: completedJobs.length,
    saved_address_count: savedAddressCount,
    preferred_service_count: new Set(
      completedJobs
        .map((job) => job.service_type)
        .filter((serviceType) => isSupportedServiceType(serviceType)),
    ).size,
    active_streak_days: activeStreakDays,
    positive_review_rate_percent: positiveReviewRatePercent,
    price_savings_vnd: priceSavingsVnd,
    total_spend_vnd: totalSpendVnd,
    usage_rank_level: usageRankLevel,
    usage_rank_points: usageRankPoints,
    fair_price_service_count: fairPriceJobs.length,
    money_protection_score: protectionScore,
    protected_value_vnd: protectedValueVnd,
    protected_transaction_count: protectedTransactionCount,
    total_transaction_count: totalTransactionCount,
    dispute_free_rate_percent: disputeFreeRatePercent,
    fair_price_status: customerProfileFairPriceStatus({
      fairPriceCount: fairPriceJobs.length,
      totalTransactionCount,
      disputeFreeRatePercent,
    }),
  };
}

function isCustomerProfileCompletedJob(job: CustomerProfileInsightJobRow) {
  return CUSTOMER_PROFILE_COMPLETED_STATUSES.has(job.status) ||
    Boolean(job.completed_at || job.confirmed_at || job.paid_at || job.reviewed_at);
}

function isCustomerProfileTransactionJob(job: CustomerProfileInsightJobRow) {
  return CUSTOMER_PROFILE_TRANSACTION_STATUSES.has(job.status) &&
    (job.final_price ?? 0) > 0;
}

function isCustomerProfileProtectedTransaction(job: CustomerProfileInsightJobRow) {
  return isCustomerProfileFairPriceTransaction(job);
}

function isCustomerProfileFairPriceTransaction(job: CustomerProfileInsightJobRow) {
  const price = job.final_price ?? 0;
  const max = job.kael_price_max ?? 0;
  return price > 0 && max > 0 && price <= max;
}

function isCustomerProfileReviewedJob(job: CustomerProfileInsightJobRow) {
  return job.status === "reviewed" || Boolean(job.reviewed_at);
}

function isCountedCustomerProfileDispute(dispute: CustomerProfileInsightDisputeRow) {
  const status = dispute.status?.trim().toLowerCase() ?? "";
  return Boolean(dispute.job_id) && status !== "cancelled" && status !== "withdrawn";
}

function customerProfileMemberSince(
  accountProfile: CustomerProfileInsightInput["accountProfile"],
  profile: CustomerProfileInsightInput["customerProfile"],
  jobs: CustomerProfileInsightJobRow[],
) {
  if (accountProfile?.created_at) return accountProfile.created_at;
  if (profile?.created_at) return profile.created_at;
  return jobs
    .map((job) => job.created_at)
    .filter((createdAt): createdAt is string => Boolean(createdAt))
    .sort()[0] ?? null;
}

function customerProfileSavedAddressCount(
  profile: CustomerProfileInsightInput["customerProfile"],
  savedAddressMemoryCount: number,
) {
  const memoryCount = Number.isFinite(savedAddressMemoryCount)
    ? Math.max(0, Math.floor(savedAddressMemoryCount))
    : 0;
  const hasPrimaryAddress = Boolean(
    profile &&
      [
        profile.building_name,
        profile.unit_number,
        profile.floor,
        profile.district,
      ].some((value) => Boolean(value?.trim())),
  );
  return Math.max(hasPrimaryAddress ? 1 : 0, memoryCount);
}

function customerProfileActiveStreakDays(jobs: CustomerProfileInsightJobRow[]) {
  const days = Array.from(
    new Set(
      jobs
        .map(customerProfileActivityDateKey)
        .filter((day): day is string => Boolean(day)),
    ),
  ).sort((a, b) => b.localeCompare(a));
  if (days.length === 0) return 0;

  let streak = 1;
  let expectedPreviousDay = previousIsoDateKey(days[0]);
  for (const day of days.slice(1)) {
    if (day === expectedPreviousDay) {
      streak += 1;
      expectedPreviousDay = previousIsoDateKey(day);
      continue;
    }
    if (day < expectedPreviousDay) break;
  }
  return streak;
}

function customerProfileActivityDateKey(job: CustomerProfileInsightJobRow) {
  const value = job.reviewed_at ?? job.paid_at ?? job.completed_at ??
    job.confirmed_at ?? job.created_at;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function previousIsoDateKey(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function customerProfilePositiveReviewRatePercent(
  reviews: CustomerProfileInsightReviewRow[],
) {
  const ratings = reviews
    .map((review) => review.rating)
    .filter((rating): rating is number =>
      typeof rating === "number" && Number.isFinite(rating) && rating >= 1 &&
      rating <= 5
    );
  if (ratings.length === 0) return 0;
  const positiveCount = ratings.filter((rating) => rating >= 4).length;
  return Math.round((positiveCount / ratings.length) * 100);
}

function customerProfileUsageRankPoints(input: {
  completedCount: number;
  fairPriceCount: number;
  kaelInteractionCount: number;
  protectedCount: number;
  reviewedCount: number;
}) {
  const points =
    input.completedCount * 25 +
    input.fairPriceCount * 15 +
    input.protectedCount * 5 +
    input.reviewedCount * 10 +
    Math.min(input.kaelInteractionCount, 50) * 2;
  return Math.min(1000, Math.max(0, points));
}

function customerProfileMoneyProtectionScore(input: {
  disputedTransactionCount: number;
  protectedTransactionCount: number;
  totalTransactionCount: number;
}) {
  if (!input.totalTransactionCount) return 0;
  const protectedRatio = input.protectedTransactionCount / input.totalTransactionCount;
  const disputeFreeRatio =
    (input.totalTransactionCount - input.disputedTransactionCount) /
    input.totalTransactionCount;
  const score = Math.round(protectedRatio * disputeFreeRatio * 100);
  return Math.max(0, score);
}

function customerProfileFairPriceStatus(input: {
  disputeFreeRatePercent: number;
  fairPriceCount: number;
  totalTransactionCount: number;
}): CustomerProfileInsightsResponse["fair_price_status"] {
  if (!input.totalTransactionCount) return null;
  if (
    input.fairPriceCount === input.totalTransactionCount &&
    input.disputeFreeRatePercent === 100
  ) {
    return "verified";
  }
  if (input.fairPriceCount > 0) return "mixed";
  return "pending";
}

function sumCustomerProfileMoney(values: Array<number | null>): number {
  return values.reduce<number>((total, value) =>
    total + (value && Number.isFinite(value) && value > 0 ? Math.round(value) : 0), 0);
}

function isSupportedServiceType(serviceType: string): serviceType is ServiceType {
  return serviceType === "electrical" ||
    serviceType === "plumbing" ||
    serviceType === "cleaning";
}

async function getWorkerPerformanceInsights(ctx: MobileApiContext) {
  const client = db(ctx);
  const profileResult = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_profiles")
      .select("id, verification_status, is_available, is_approved, is_suspended, rating, total_jobs")
      .eq("id", ctx.user.id)
      .maybeSingle(),
  );
  if (profileResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chỉ số thợ", 500);
  }

  const broadcastsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_broadcasts")
      .select("status, broadcast_at, sent_at, responded_at")
      .eq("worker_id", ctx.user.id)
      .order("broadcast_at", { ascending: false })
      .limit(500),
  );
  if (broadcastsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chỉ số thợ", 500);
  }

  const jobsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("jobs")
      .select("status, scheduled_at, arrived_at, completed_at, paid_at, reviewed_at, final_price")
      .eq("worker_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(500),
  );
  if (jobsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chỉ số thợ", 500);
  }

  const reviewsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("reviews")
      .select("rating")
      .eq("worker_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(500),
  );
  if (reviewsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chỉ số thợ", 500);
  }

  return buildWorkerPerformanceInsights({
    broadcasts: (broadcastsResult.data ?? []).map(workerPerformanceBroadcastFromRow),
    jobs: (jobsResult.data ?? []).map(workerPerformanceJobFromRow),
    reviews: (reviewsResult.data ?? []).map(workerPerformanceReviewFromRow),
    workerId: ctx.user.id,
    workerProfile: profileResult.data
      ? {
        is_approved: Boolean(profileResult.data.is_approved),
        is_available: Boolean(profileResult.data.is_available),
        is_suspended: Boolean(profileResult.data.is_suspended),
        rating: asNumber(profileResult.data.rating),
        total_jobs: asNumber(profileResult.data.total_jobs),
        verification_status: asString(profileResult.data.verification_status),
      }
      : null,
  });
}

function workerPerformanceBroadcastFromRow(
  row: Record<string, unknown>,
): WorkerPerformanceInsightBroadcastRow {
  return {
    broadcast_at: nullableString(row.broadcast_at),
    responded_at: nullableString(row.responded_at),
    sent_at: nullableString(row.sent_at),
    status: asString(row.status),
  };
}

function workerPerformanceJobFromRow(
  row: Record<string, unknown>,
): WorkerPerformanceInsightJobRow {
  return {
    arrived_at: nullableString(row.arrived_at),
    completed_at: nullableString(row.completed_at),
    final_price: nullableNumber(row.final_price),
    paid_at: nullableString(row.paid_at),
    reviewed_at: nullableString(row.reviewed_at),
    scheduled_at: nullableString(row.scheduled_at),
    status: asString(row.status),
  };
}

function workerPerformanceReviewFromRow(
  row: Record<string, unknown>,
): WorkerPerformanceInsightReviewRow {
  return {
    rating: nullableNumber(row.rating),
  };
}

export function buildWorkerPerformanceInsights(
  input: WorkerPerformanceInsightInput,
): WorkerPerformanceInsightsResponse {
  const broadcasts = input.broadcasts.filter(isWorkerPerformanceDeliveredBroadcast);
  const respondedBroadcasts = broadcasts.filter(isWorkerPerformanceRespondedBroadcast);
  const responseDurations = respondedBroadcasts
    .map(workerPerformanceResponseDurationMs)
    .filter((duration): duration is number => duration !== null);
  const responseRatePercent = broadcasts.length > 0
    ? Math.round((respondedBroadcasts.length / broadcasts.length) * 100)
    : null;
  const averageResponseMinutes = responseDurations.length > 0
    ? Math.round(
      responseDurations.reduce((total, duration) => total + duration, 0) /
        responseDurations.length /
        60_000,
    )
    : null;

  const completedJobs = input.jobs.filter(isWorkerPerformanceCompletedJob);
  const scheduledArrivalJobs = input.jobs.filter((job) =>
    Boolean(job.scheduled_at && job.arrived_at)
  );
  const onTimeJobs = scheduledArrivalJobs.filter(isWorkerPerformanceOnTimeJob);
  const onTimeRatePercent = scheduledArrivalJobs.length > 0
    ? Math.round((onTimeJobs.length / scheduledArrivalJobs.length) * 100)
    : null;
  const paidJobs = input.jobs.filter(isWorkerPerformancePaidJob);
  const reconciledEarningsVnd = sumCustomerProfileMoney(
    paidJobs.map((job) => job.final_price),
  );

  const reviewRatings = input.reviews
    .map((review) => review.rating)
    .filter((rating): rating is number =>
      typeof rating === "number" && Number.isFinite(rating) && rating > 0 && rating <= 5
    );
  const averageRating = reviewRatings.length > 0
    ? roundToOneDecimal(
      reviewRatings.reduce((total, rating) => total + rating, 0) /
        reviewRatings.length,
    )
    : input.workerProfile && input.workerProfile.total_jobs > 0 &&
        input.workerProfile.rating > 0
    ? roundToOneDecimal(Math.min(5, Math.max(1, input.workerProfile.rating)))
    : null;

  const ratingScore = averageRating === null
    ? null
    : Math.round((averageRating / 5) * 100);
  const completionScore = respondedBroadcasts.length > 0
    ? Math.min(100, Math.round((completedJobs.length / respondedBroadcasts.length) * 100))
    : completedJobs.length > 0
    ? 100
    : null;
  const earningsScore = paidJobs.length > 0
    ? Math.min(100, paidJobs.length * 20)
    : null;
  const performanceAxes: WorkerPerformanceInsightsResponse["performance_axes"] = [
    { id: "rating", score: ratingScore },
    { id: "response", score: responseRatePercent },
    { id: "arrival", score: onTimeRatePercent },
    { id: "completion", score: completionScore },
    { id: "earnings", score: earningsScore },
  ];
  const axisScores = performanceAxes
    .map((axis) => axis.score)
    .filter((score): score is number => score !== null);
  const performanceScore = axisScores.length > 0
    ? Math.round(axisScores.reduce((total, score) => total + score, 0) / axisScores.length)
    : null;

  return {
    worker_id: input.workerId,
    completed_job_count: completedJobs.length,
    review_count: input.reviews.length,
    average_rating: averageRating,
    response_rate_percent: responseRatePercent,
    average_response_minutes: averageResponseMinutes,
    on_time_rate_percent: onTimeRatePercent,
    total_broadcast_count: broadcasts.length,
    responded_broadcast_count: respondedBroadcasts.length,
    accepted_broadcast_count: broadcasts.filter((row) => row.status === "accepted").length,
    scheduled_arrival_job_count: scheduledArrivalJobs.length,
    on_time_job_count: onTimeJobs.length,
    paid_job_count: paidJobs.length,
    reconciled_earnings_vnd: reconciledEarningsVnd > 0 ? reconciledEarningsVnd : null,
    performance_score: performanceScore,
    badges: workerPerformanceBadges({
      averageRating,
      averageResponseMinutes,
      onTimeRatePercent,
      paidJobCount: paidJobs.length,
      reconciledEarningsVnd,
      respondedBroadcastCount: respondedBroadcasts.length,
      responseRatePercent,
      reviewCount: input.reviews.length,
      scheduledArrivalJobCount: scheduledArrivalJobs.length,
      workerProfile: input.workerProfile,
    }),
    performance_axes: performanceAxes,
  };
}

function isWorkerPerformanceDeliveredBroadcast(row: WorkerPerformanceInsightBroadcastRow) {
  return WORKER_PERFORMANCE_TOTAL_BROADCAST_STATUSES.has(row.status) ||
    Boolean(row.sent_at || row.broadcast_at);
}

function isWorkerPerformanceRespondedBroadcast(row: WorkerPerformanceInsightBroadcastRow) {
  return WORKER_PERFORMANCE_RESPONSE_STATUSES.has(row.status) &&
    Boolean(row.responded_at);
}

function workerPerformanceResponseDurationMs(row: WorkerPerformanceInsightBroadcastRow) {
  const started = timestampMs(row.sent_at ?? row.broadcast_at);
  const responded = timestampMs(row.responded_at);
  if (started === null || responded === null || responded < started) return null;
  return responded - started;
}

function isWorkerPerformanceCompletedJob(row: WorkerPerformanceInsightJobRow) {
  return WORKER_PERFORMANCE_COMPLETED_STATUSES.has(row.status) ||
    Boolean(row.completed_at || row.paid_at || row.reviewed_at);
}

function isWorkerPerformancePaidJob(row: WorkerPerformanceInsightJobRow) {
  return (WORKER_PERFORMANCE_PAID_STATUSES.has(row.status) || Boolean(row.paid_at)) &&
    (row.final_price ?? 0) > 0;
}

function isWorkerPerformanceOnTimeJob(row: WorkerPerformanceInsightJobRow) {
  const scheduled = timestampMs(row.scheduled_at);
  const arrived = timestampMs(row.arrived_at);
  if (scheduled === null || arrived === null) return false;
  return arrived <= scheduled + WORKER_PERFORMANCE_ON_TIME_GRACE_MS;
}

function workerPerformanceBadges(input: {
  averageRating: number | null;
  averageResponseMinutes: number | null;
  onTimeRatePercent: number | null;
  paidJobCount: number;
  reconciledEarningsVnd: number;
  respondedBroadcastCount: number;
  responseRatePercent: number | null;
  reviewCount: number;
  scheduledArrivalJobCount: number;
  workerProfile: WorkerPerformanceInsightInput["workerProfile"];
}): WorkerPerformanceInsightsResponse["badges"] {
  const approved = Boolean(
    input.workerProfile?.is_approved ||
      input.workerProfile?.verification_status === "approved",
  );
  return [
    { id: "verified_profile", status: approved ? "earned" : "locked" },
    {
      id: "fast_responder",
      status: input.respondedBroadcastCount >= 2 &&
          (input.responseRatePercent ?? 0) >= 80 &&
          (input.averageResponseMinutes ?? Number.POSITIVE_INFINITY) <= 15
        ? "earned"
        : "locked",
    },
    {
      id: "reliable_arrival",
      status: input.scheduledArrivalJobCount >= 2 &&
          (input.onTimeRatePercent ?? 0) >= 90
        ? "earned"
        : "locked",
    },
    {
      id: "trusted_by_customers",
      status: input.reviewCount >= 3 && (input.averageRating ?? 0) >= 4.8
        ? "earned"
        : "locked",
    },
    {
      id: "steady_earner",
      status: input.paidJobCount > 0 && input.reconciledEarningsVnd > 0
        ? "earned"
        : "locked",
    },
  ];
}

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

const WORKER_PROFILE_SELECT =
  "id, verification_status, is_available, is_approved, is_suspended, service_types, districts, home_lat, home_lng, service_radius_km, problem_specializations, years_experience, rating, total_jobs, legal_name, date_of_birth, gender, bank_account, bank_name, cccd_front_url, cccd_back_url, selfie_url";

function workerProfileResponseFromRow(worker: Record<string, unknown>, workerId: string) {
  return {
    id: asString(worker.id) || workerId,
    verification_status: asWorkerVerificationStatus(worker.verification_status),
    is_available: Boolean(worker.is_available),
    is_approved: Boolean(worker.is_approved),
    is_suspended: Boolean(worker.is_suspended),
    service_types: asServiceTypeArray(worker.service_types),
    districts: asStringArray(worker.districts),
    home_lat: nullableNumber(worker.home_lat),
    home_lng: nullableNumber(worker.home_lng),
    service_radius_km: clampServiceRadius(worker.service_radius_km),
    problem_specializations: asStringArray(worker.problem_specializations),
    years_experience: asNumber(worker.years_experience),
    rating: asNumber(worker.rating),
    total_jobs: asNumber(worker.total_jobs),
    legal_name: nullableString(worker.legal_name),
    date_of_birth: nullableString(worker.date_of_birth),
    gender: nullableString(worker.gender),
    bank_account_masked: maskBankAccount(nullableString(worker.bank_account)),
    bank_name: nullableString(worker.bank_name),
    has_cccd: Boolean(worker.cccd_front_url && worker.cccd_back_url),
    has_selfie: Boolean(worker.selfie_url),
  };
}

async function getWorkerProfile(ctx: MobileApiContext) {
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("worker_profiles")
      .select(WORKER_PROFILE_SELECT)
      .eq("id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải hồ sơ", 500);
  if (!result.data) return blankWorkerProfile(ctx.user.id);
  return workerProfileResponseFromRow(result.data, ctx.user.id);
}

async function updateWorkerServiceArea(
  ctx: MobileApiContext,
  input: WorkerServiceAreaUpdateInput,
) {
  const districts = normalizeWorkerDistricts(input.districts);
  if (!districts?.length) {
    apiFailure("VALIDATION", "Khu vực phục vụ không hợp lệ", 400);
  }

  const patch: Record<string, unknown> = { districts };
  if ("service_radius_km" in input) {
    patch.service_radius_km = input.service_radius_km === null
      ? null
      : clampServiceRadius(input.service_radius_km);
  }
  if ("home_lat" in input) patch.home_lat = input.home_lat ?? null;
  if ("home_lng" in input) patch.home_lng = input.home_lng ?? null;

  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("worker_profiles")
      .update(patch)
      .eq("id", ctx.user.id)
      .select(WORKER_PROFILE_SELECT)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể cập nhật khu vực phục vụ", 500);
  if (!result.data) apiFailure("NOT_FOUND", "Chưa có hồ sơ thợ để cập nhật", 404);
  return workerProfileResponseFromRow(result.data, ctx.user.id);
}

async function updateWorkerAvailability(
  ctx: MobileApiContext,
  input: { is_available: boolean },
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("set_worker_availability_atomic", {
      p_worker_id: ctx.user.id,
      p_is_available: input.is_available,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  if (!row.ok) mapAvailabilityError(nullableString(row.error_code));

  return {
    worker_id: ctx.user.id,
    is_available: Boolean(row.is_available),
    updated_at: asString(row.updated_at_ts),
  };
}

async function listWorkerBroadcasts(ctx: MobileApiContext) {
  const now = new Date();
  const expired = await dbQuery(
    db(ctx)
      .from("job_broadcasts")
      .update({ status: "expired", responded_at: now.toISOString() })
      .eq("worker_id", ctx.user.id)
      .eq("status", "sent")
      .lte("expires_at", now.toISOString()),
  );
  if (expired.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật yêu cầu hết hạn", 500);
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("job_broadcasts")
      .select(
        "id, job_id, status, sent_at, expires_at, jobs(status, service_type, address_district, kael_problem_identified, kael_price_min, kael_price_max, kael_worker_brief_core)",
      )
      .eq("worker_id", ctx.user.id)
      .eq("status", "sent")
      .gt("expires_at", now.toISOString())
      .order("sent_at", { ascending: false })
      .limit(20),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải yêu cầu", 500);
  return {
    broadcasts: (result.data ?? []).map((row) => {
      const job = relatedJob(row.jobs);
      if (!job || job.status !== "broadcasting") return null;
      const min = nullableNumber(job.kael_price_min);
      const max = nullableNumber(job.kael_price_max);
      return {
        broadcast_id: asString(row.id),
        job_id: asString(row.job_id),
        status: row.status as BroadcastStatus,
        service_type: job.service_type as ServiceType,
        problem_summary: nullableString(job.kael_problem_identified),
        district: nullableString(job.address_district),
        estimated_price_min: min,
        estimated_price_max: max,
        estimated_earning_min: min === null
          ? null
          : Math.round(min * (1 - PLATFORM_FEE_WORKER)),
        estimated_earning_max: max === null
          ? null
          : Math.round(max * (1 - PLATFORM_FEE_WORKER)),
        worker_brief_core: nullableRecord(job.kael_worker_brief_core),
        sent_at: nullableString(row.sent_at),
        expires_at: nullableString(row.expires_at),
        seconds_remaining: secondsRemaining(
          nullableString(row.expires_at),
          now,
        ),
      };
    }).filter((broadcast): broadcast is NonNullable<typeof broadcast> =>
      broadcast !== null
    ),
  };
}

async function listWorkerJobs(ctx: MobileApiContext) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("jobs")
      .select(
        "id, display_code, status, customer_id, service_type, kael_problem_identified, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state, kael_price_min, kael_price_max, kael_worker_brief_guidance, final_price, payment_provider, payment_status, payment_code, payment_transfer_content, payment_qr_image_url, payment_expires_at, payment_received_at, payment_amount_received, gross_amount, platform_fee, worker_net, completion_notes, completion_photo_urls, created_at, matched_at, completed_at",
      )
      .eq("worker_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách công việc", 500);
  }
  return {
    jobs: (result.data ?? []).map((row) => {
      const finalPrice = nullableNumber(row.final_price);
      const max = finalPrice ?? nullableNumber(row.kael_price_max);
      const min = nullableNumber(row.kael_price_min);
      const addressProjection = projectAddressAccess(row, "worker");
      const fallbackBrief = buildWorkerBriefOutput({
        stage: "guidance",
        serviceType: row.service_type as ServiceType,
        problemSummary:
          nullableString(row.kael_problem_identified) ?? "Yêu cầu cần thợ kiểm tra",
        district: nullableString(row.address_district),
        fullAddress: addressProjection.fullAddress,
        estimatedEarningMin: min === null
          ? null
          : Math.round(min * (1 - PLATFORM_FEE_WORKER)),
        estimatedEarningMax: max === null
          ? null
          : Math.round(max * (1 - PLATFORM_FEE_WORKER)),
      }).brief;
      return {
        id: asString(row.id),
        display_code: nullableString(row.display_code) ?? buildJobDisplayCode({
          jobId: asString(row.id),
          customerId: nullableString(row.customer_id),
          createdAt: nullableString(row.created_at),
        }),
        status: row.status as JobStatus,
        service_type: row.service_type as ServiceType,
        problem_summary: nullableString(row.kael_problem_identified),
        address_building: addressProjection.fullAddress.building,
        address_unit: addressProjection.fullAddress.unit,
        address_floor: addressProjection.fullAddress.floor,
        district: addressProjection.fullAddress.district,
        address_access: addressProjection.addressAccess,
        final_price: finalPrice,
        estimated_earning: finalPrice
          ? Math.round(finalPrice * (1 - PLATFORM_FEE_WORKER))
          : null,
        payment_provider: nullableString(row.payment_provider),
        payment_status: asPaymentStatus(row.payment_status),
        payment_code: nullableString(row.payment_code),
        payment_transfer_content: nullableString(row.payment_transfer_content),
        payment_qr_image_url: nullableString(row.payment_qr_image_url),
        payment_expires_at: nullableString(row.payment_expires_at),
        payment_received_at: nullableString(row.payment_received_at),
        payment_amount_received: nullableNumber(row.payment_amount_received),
        gross_amount: nullableNumber(row.gross_amount),
        platform_fee: nullableNumber(row.platform_fee),
        worker_net: nullableNumber(row.worker_net),
        completion_notes: nullableString(row.completion_notes),
        completion_photo_urls: asStringArray(row.completion_photo_urls),
        worker_brief_guidance:
          nullableRecord(row.kael_worker_brief_guidance) ?? fallbackBrief,
        created_at: asString(row.created_at),
        matched_at: nullableString(row.matched_at),
        completed_at: nullableString(row.completed_at),
      };
    }),
  };
}

async function getWorkerEarnings(
  ctx: MobileApiContext,
  range: { from?: string; to?: string },
) {
  let query = db(ctx)
    .from("jobs")
    .select("id, status, final_price, paid_at, created_at")
    .eq("worker_id", ctx.user.id)
    .in("status", [
      "paid",
      "reviewed",
      "confirmed_by_customer",
      "payment_pending",
    ]);
  if (range.from) query = query.gte("created_at", range.from);
  if (range.to) query = query.lte("created_at", range.to);

  const result = await dbQuery<Array<Record<string, unknown>>>(query);
  if (result.error) {
    console.warn("mobile-api earnings query failed", {
      workerId: ctx.user.id,
      errorCode: result.error.code,
    });
    apiFailure("DB_ERROR", "Không thể tải thu nhập", 500);
  }
  const rows = result.data ?? [];
  let gross = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  for (const row of rows) {
    const price = nullableNumber(row.final_price) ?? 0;
    if (nullableString(row.paid_at)) {
      gross += price;
      paidCount++;
    } else if (
      row.status === "confirmed_by_customer" ||
      row.status === "payment_pending" ||
      row.status === "reviewed"
    ) {
      pendingAmount += price;
      pendingCount++;
    }
  }
  const fee = Math.round(gross * PLATFORM_FEE_WORKER);
  return {
    worker_id: ctx.user.id,
    total_jobs_paid: paidCount,
    gross_earnings: gross,
    platform_fee_total: fee,
    net_earnings: gross - fee,
    pending_payment_count: pendingCount,
    pending_payment_amount: pendingAmount,
    from_date: range.from ?? null,
    to_date: range.to ?? null,
  };
}

async function invalidateMarketCache(
  ctx: MobileApiContext,
  input: MarketCacheInvalidateInput,
): Promise<MarketCacheInvalidateResponse> {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được xóa cache giá", 403);
  }
  const invalidatedAt = new Date().toISOString();
  let query = db(ctx)
    .from("kael_market_cache")
    .update({ invalidated_at: invalidatedAt, updated_at: invalidatedAt })
    .is("invalidated_at", null);
  if (input.cache_id) query = query.eq("id", input.cache_id);
  if (input.district_code) query = query.eq("district_code", input.district_code);
  if (input.service_type) query = query.eq("service_type", input.service_type);
  if (input.problem_slug) query = query.eq("problem_slug", input.problem_slug);
  if (input.complexity) query = query.eq("complexity", input.complexity);

  const result = await dbQuery<Array<{ id: string }>>(query.select("id"));
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể xóa cache giá", 500);
  }
  return {
    invalidated_count: result.data?.length ?? 0,
    invalidated_at: invalidatedAt,
    filters: input,
  };
}

async function evaluatePriceSynthesisAbCaseAdmin(
  ctx: MobileApiContext,
  input: PriceSynthesisAbCaseInput,
  secrets: EdgeAiSecrets,
): Promise<PriceSynthesisAbEvaluation> {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chi admin moi duoc chay A/B price_synthesis", 403);
  }
  return runPriceSynthesisAbCase(input, secrets);
}

async function processKaelLearningQueueAdmin(
  ctx: MobileApiContext,
  input: KaelLearningQueueProcessInput,
  secrets: EdgeAiSecrets,
): Promise<KaelLearningQueueProcessResponse> {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được xử lý hàng đợi Kael", 403);
  }
  return processLearningQueue(db(ctx), secrets, {
    limit: input.limit,
    forceRealtime: input.force_realtime,
  });
}

async function processKaelBatchResultsAdmin(
  ctx: MobileApiContext,
  input: KaelBatchResultsProcessInput,
  secrets: EdgeAiSecrets,
): Promise<KaelBatchResultsProcessResponse> {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được xử lý batch Kael", 403);
  }
  return processBatchResults(db(ctx), secrets, {
    limit: input.limit,
    forcePoll: input.force_poll,
  });
}

async function monitorKaelLearningRulesAdmin(
  ctx: MobileApiContext,
  input: KaelLearningMonitorInput,
): Promise<KaelLearningMonitorResponse> {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được theo dõi rule Kael", 403);
  }
  return monitorLearningRules(db(ctx), {
    limit: input.limit,
  });
}

async function listKaelLearningCandidatesAdmin(
  ctx: MobileApiContext,
  input: KaelLearningCandidateListInput,
): Promise<KaelLearningCandidateListResponse> {
  if (ctx.role !== "admin") {
    await denyKaelLearningCandidateAdminAccess(ctx, "list", null);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("learning_candidates")
      .select(
        "id,candidate_type,affected_service,affected_problem,affected_district,suggested_payload,confidence,evidence_count,status,audit_reason,created_at,updated_at,promoted_at,rolled_back_at",
      )
      .eq("status", input.state)
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 50),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách ứng viên learning Kael", 500);
  }
  return {
    candidates: (result.data ?? []).map(kaelLearningCandidateSummary),
  };
}

async function approveKaelLearningCandidateAdmin(
  ctx: MobileApiContext,
  candidateId: string,
  input: KaelLearningCandidateReviewInput,
): Promise<KaelLearningCandidateApproveResponse> {
  if (ctx.role !== "admin") {
    await denyKaelLearningCandidateAdminAccess(ctx, "approve", candidateId);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("admin_approve_learning_candidate", {
      p_candidate_id: candidateId,
      p_admin_id: ctx.user.id,
      p_review_note: input.review_note ?? null,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể duyệt ứng viên learning Kael", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure("DB_ERROR", "Không thể duyệt ứng viên learning Kael", 500);
  }
  if (row.ok !== true) {
    mapLearningCandidateReviewError(nullableString(row.error_code), "approve");
  }
  const knowledgeApplyResult = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("apply_approved_learning_candidate_to_knowledge", {
      p_candidate_id: candidateId,
      p_admin_id: ctx.user.id,
    }),
  );
  if (knowledgeApplyResult.error) {
    apiFailure("DB_ERROR", "Không thể áp dụng tri thức Kael đã duyệt", 500);
  }
  const knowledgeApplyRow = knowledgeApplyResult.data?.[0] ?? null;
  return {
    ok: true,
    candidate_id: asString(row.candidate_id) || candidateId,
    rule_id: nullableString(row.rule_id),
    rule_version: nullableNumber(row.rule_version),
    status: asString(row.status) || "auto_promoted",
    knowledge_apply: knowledgeApplyRow
      ? {
        ok: knowledgeApplyRow.ok === true,
        error_code: nullableString(knowledgeApplyRow.error_code),
        knowledge_table: nullableString(knowledgeApplyRow.knowledge_table),
        record_key: nullableString(knowledgeApplyRow.record_key),
        knowledge_version: nullableNumber(knowledgeApplyRow.knowledge_version),
      }
      : null,
  };
}

async function rejectKaelLearningCandidateAdmin(
  ctx: MobileApiContext,
  candidateId: string,
  input: KaelLearningCandidateReviewInput,
): Promise<KaelLearningCandidateRejectResponse> {
  if (ctx.role !== "admin") {
    await denyKaelLearningCandidateAdminAccess(ctx, "reject", candidateId);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("admin_reject_learning_candidate", {
      p_candidate_id: candidateId,
      p_admin_id: ctx.user.id,
      p_reason: input.reason,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể từ chối ứng viên learning Kael", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure("DB_ERROR", "Không thể từ chối ứng viên learning Kael", 500);
  }
  if (row.ok !== true) {
    mapLearningCandidateReviewError(nullableString(row.error_code), "reject");
  }
  return {
    ok: true,
    candidate_id: asString(row.candidate_id) || candidateId,
    status: asString(row.status) || "archived",
  };
}

async function denyKaelLearningCandidateAdminAccess(
  ctx: MobileApiContext,
  action: "list" | "approve" | "reject",
  candidateId: string | null,
): Promise<never> {
  const result = await dbQuery<null>(
    db(ctx).from("kael_permission_audit").insert({
      actor_id: ctx.user.id,
      actor_role: ctx.role,
      purpose: "kael_learning_admin_review",
      action,
      topic: "learning_candidate",
      decision: "deny",
      reason_code: "admin_required",
      safe_metadata: {
        ...(candidateId ? { candidate_id: candidateId } : {}),
      },
    }),
  );
  if (result.error) {
    console.warn("mobile-api learning admin deny audit failed", {
      action,
      errorCode: result.error.code,
    });
  }
  apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được review ứng viên learning Kael", 403);
}

function kaelLearningCandidateSummary(
  row: Record<string, unknown>,
): KaelLearningCandidateSummary {
  const payload = nullableRecord(row.suggested_payload) ?? {};
  return {
    id: asString(row.id),
    candidate_type: asString(row.candidate_type),
    affected_service: nullableServiceType(row.affected_service),
    affected_problem: nullableString(row.affected_problem),
    affected_district: nullableString(row.affected_district),
    confidence: asNumber(row.confidence),
    evidence_count: Math.max(0, Math.trunc(asNumber(row.evidence_count))),
    status: asLearningCandidateStatus(row.status),
    audit_reason: nullableString(row.audit_reason),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
    promoted_at: nullableString(row.promoted_at),
    rolled_back_at: nullableString(row.rolled_back_at),
    suggested_payload: payload,
    evidence_snapshot: nullableRecord(payload.evidence_snapshot),
  };
}

function mapLearningCandidateReviewError(
  code: string | null,
  action: "approve" | "reject",
): never {
  const normalized = code ?? "REVIEW_FAILED";
  const message = action === "approve"
    ? "Không thể duyệt ứng viên learning Kael"
    : "Không thể từ chối ứng viên learning Kael";
  if (normalized === "CANDIDATE_NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy ứng viên learning Kael", 404);
  }
  if (normalized === "ADMIN_REQUIRED") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được review ứng viên learning Kael", 403);
  }
  if (
    normalized === "INVALID_INPUT" ||
    normalized === "INVALID_PAYLOAD" ||
    normalized === "UNKNOWN_SKILL" ||
    normalized === "TARGET_NOT_ALLOWED" ||
    normalized === "FORBIDDEN_EFFECT" ||
    normalized === "UNSUPPORTED_CANDIDATE_TYPE" ||
    normalized === "CANDIDATE_TYPE_MISMATCH"
  ) {
    apiFailure("VALIDATION", message, 400, { reason_code: normalized });
  }
  apiFailure("LEARNING_REVIEW_FAILED", message, 409, { reason_code: normalized });
}

async function listNotifications(ctx: MobileApiContext) {
  const unreadResult = await dbQuery<null>(
    db(ctx)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.user.id)
      .neq("status", "read")
      .neq("status", "archived"),
  );
  if (unreadResult.error) {
    apiFailure("DB_ERROR", "Không thể tải số thông báo chưa đọc", 500);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("notifications")
      .select("id, title, body, event_type, status, job_id, created_at, read_at")
      .eq("user_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải thông báo", 500);
  }
  const notifications = (result.data ?? []).map((row) => ({
    id: asString(row.id),
    title: asString(row.title),
    body: asString(row.body),
    event_type: asString(row.event_type),
    status: asString(row.status),
    job_id: nullableString(row.job_id),
    created_at: asString(row.created_at),
    read_at: nullableString(row.read_at),
  }));
  return {
    unread_count: unreadResult.count ?? 0,
    notifications,
  };
}

async function markNotificationRead(
  ctx: MobileApiContext,
  notificationId: string,
) {
  const readAt = new Date().toISOString();
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("notifications")
      .update({ status: "read", read_at: readAt })
      .eq("id", notificationId)
      .eq("user_id", ctx.user.id)
      .select("id, read_at")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật thông báo", 500);
  }
  if (!result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy thông báo", 404);
  }
  return {
    notification_id: asString(result.data.id),
    status: "read" as const,
    read_at: nullableString(result.data.read_at) ?? readAt,
  };
}

async function registerDevicePushToken(
  ctx: MobileApiContext,
  input: DevicePushTokenInput,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("register_device_push_token_atomic", {
      p_user_id: ctx.user.id,
      p_platform: input.platform,
      p_push_token: input.push_token,
      p_permission_status: input.permission_status,
      p_safe_metadata: input.safe_metadata,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể lưu thiết bị nhận thông báo", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure("VALIDATION", "Dữ liệu thiết bị nhận thông báo không hợp lệ", 400);
  }
  return {
    token_id: asString(row.token_id),
    enabled: asBoolean(row.enabled_out),
    updated_at: asString(row.updated_at_ts),
  };
}

async function createBroadcasts(
  client: DbClient,
  jobId: string,
  serviceType: ServiceType,
  district: string,
  options: { excludeWorkerIds?: string[] } = {},
) {
  const eligibleResult = await queryEligibleWorkers(
    client,
    serviceType,
    district,
    5,
    { ...options, jobId },
  );
  if (!eligibleResult.success) {
    return {
      success: false as const,
      reasonCode: "DB_ERROR" as const,
      reason: eligibleResult.reason,
    };
  }
  const eligible = eligibleResult.workers;
  if (eligible.length === 0) {
    return {
      success: false as const,
      reasonCode: "NO_WORKER" as const,
      reason: "Không tìm thấy thợ phù hợp đang online trong khu vực",
    };
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60_000);
  const batchId = crypto.randomUUID();
  const rows = eligible.map((worker) => ({
    job_id: jobId,
    worker_id: worker.id,
    status: "sent",
    broadcast_at: now.toISOString(),
    sent_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    batch_id: batchId,
  }));
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.from("job_broadcasts").insert(rows).select("id, worker_id"),
  );
  if (result.error) {
    return {
      success: false as const,
      reasonCode: "DB_ERROR" as const,
      reason: "Lỗi khi gửi yêu cầu đến thợ",
    };
  }
  const broadcastTargets = (result.data ?? []).map((row) => ({
    broadcastId: asString(row.id),
    workerId: asString(row.worker_id),
  })).filter((row) => row.broadcastId && row.workerId);
  await notifyBroadcastWorkers(
    client,
    jobId,
    serviceType,
    district,
    expiresAt.toISOString(),
    broadcastTargets,
  );
  return { success: true as const, batchId, broadcastCount: eligible.length };
}

async function notifyJobMessageRecipient(
  client: DbClient,
  job: Record<string, unknown>,
  ctx: MobileApiContext,
  messageId: string,
) {
  const recipientId = ctx.role === "customer"
    ? nullableString(job.worker_id)
    : nullableString(job.customer_id);
  if (!recipientId) return;

  const title = "Có tin nhắn mới";
  const body = "Bạn có tin nhắn mới trong công việc.";
  await insertUserNotification(client, {
    userId: recipientId,
    jobId: asString(job.id),
    eventType: "job_message_received",
    title,
    body,
    metadata: { message_id: messageId },
  });

  const jobId = asString(job.id);
  const deepLink = ctx.role === "customer"
    ? `/(worker)/jobs?job_id=${jobId}`
    : `/(customer)/history?job_id=${jobId}`;
  const push = await sendPushToUser(client, recipientId, {
    title,
    body,
    data: {
      event_type: "job_message_received",
      job_id: jobId,
      message_id: messageId,
      deep_link: deepLink,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api chat message push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function notifyBroadcastWorkers(
  client: DbClient,
  jobId: string,
  serviceType: ServiceType,
  district: string,
  expiresAt: string,
  targets: Array<{ workerId: string; broadcastId: string }>,
) {
  if (targets.length === 0) return;
  const body = `${serviceLabel(serviceType)} - ${districtLabel(district)}`;
  const notificationResults = await Promise.allSettled(
    targets.map((target) =>
      dbQuery<Array<Record<string, unknown>>>(
        client.rpc("insert_notification_atomic", {
          p_user_id: target.workerId,
          p_job_id: jobId,
          p_event_type: "broadcast_received",
          p_title: "Có yêu cầu mới",
          p_body: body,
          p_safe_metadata: {
            broadcast_id: target.broadcastId,
            expires_at: expiresAt,
          },
        }),
      )
    ),
  );
  notificationResults.forEach((result, index) => {
    if (result.status === "rejected" || result.value.error) {
      console.warn("mobile-api worker notification insert failed", {
        jobId,
        workerId: targets[index]?.workerId,
      });
    }
  });

  for (const target of targets) {
    const push = await sendPushToUser(client, target.workerId, {
      title: "Có yêu cầu mới gần bạn",
      body,
      data: {
        event_type: "broadcast_received",
        job_id: jobId,
        broadcast_id: target.broadcastId,
        deep_link: `/(worker)/jobs?broadcast_id=${target.broadcastId}`,
      },
      sound: "default",
    });
    if (push.failed > 0) {
      console.warn("mobile-api worker push delivery had failures", {
        jobId,
        workerId: target.workerId,
        failed: push.failed,
      });
    }
  }
}

async function notifyCustomerWorkerMatched(
  client: DbClient,
  jobId: string,
  workerId: string,
) {
  const customerLookup = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("customer_id").eq("id", jobId).single(),
  );
  if (customerLookup.error || !customerLookup.data) {
    console.warn("mobile-api customer notification lookup failed", { jobId });
    return;
  }
  const customerId = nullableString(customerLookup.data.customer_id);
  if (!customerId) return;

  const notification = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("insert_notification_atomic", {
      p_user_id: customerId,
      p_job_id: jobId,
      p_event_type: "worker_matched",
      p_title: "Đã có thợ nhận việc",
      p_body: "Thợ đang chuẩn bị, bạn có thể theo dõi trong Hoạt động.",
      p_safe_metadata: { worker_id: workerId },
    }),
  );
  if (notification.error) {
    console.warn("mobile-api customer notification insert failed", { jobId });
  }

  const push = await sendPushToUser(client, customerId, {
    title: "Đã có thợ nhận việc",
    body: "Thợ đang chuẩn bị đến.",
    data: {
      event_type: "worker_matched",
      job_id: jobId,
      deep_link: `/(customer)/history?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api customer push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

type NotificationCopy = {
  eventType: string;
  title: string;
  body: string;
};

const CUSTOMER_STATUS_PUSH: Partial<Record<JobStatus, NotificationCopy>> = {
  arrived: {
    eventType: "worker_arrived",
    title: "Thợ đã đến",
    body: "Thợ đã đến nơi và chuẩn bị kiểm tra.",
  },
  completed_by_worker: {
    eventType: "completed_by_worker",
    title: "Thợ đã báo hoàn tất",
    body: "Kael đang kiểm tra bằng chứng hoàn tất và sẽ xác nhận hoặc mở tranh chấp theo chính sách.",
  },
};

async function notifyKaelConfirmedCompletion(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  workerId: string | null,
  finalPrice: number | null,
  decision: KaelAutonomyDecision,
) {
  const metadata = {
    final_price: finalPrice,
    autonomy_decision: decision,
  };
  if (customerId) {
    await insertUserNotification(client, {
      userId: customerId,
      jobId,
      eventType: "kael_confirmed_completion",
      title: "Kael đã xác nhận hoàn tất",
      body: "Kael đã xác nhận công việc từ bằng chứng hoàn tất. Bạn có thể xem lại hoặc đánh giá trong Hoạt động.",
      metadata,
    });
  }
  if (workerId) {
    await insertUserNotification(client, {
      userId: workerId,
      jobId,
      eventType: "kael_confirmed_completion",
      title: "Kael đã xác nhận hoàn tất",
      body: "Kael đã xác nhận công việc từ bằng chứng hoàn tất. Đối soát thu nhập sẽ cập nhật.",
      metadata,
    });
  }
}

async function notifyCustomerJobStatus(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  status: JobStatus,
) {
  if (!customerId) return;
  if ((NORMAL_TRANSACTION_SILENT_STATUSES as readonly string[]).includes(status)) return;
  const copy = CUSTOMER_STATUS_PUSH[status];
  if (!copy) return;

  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: copy.eventType,
    title: copy.title,
    body: copy.body,
    metadata: { status },
  });

  const push = await sendPushToUser(client, customerId, {
    title: copy.title,
    body: copy.body,
    data: {
      event_type: copy.eventType,
      job_id: jobId,
      deep_link: `/(customer)/history?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api customer status push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function notifyCustomerScopeChangeRequested(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  scopeChangeId: string,
) {
  if (!customerId || !scopeChangeId) return;
  const title = "Cần duyệt thay đổi phạm vi";
  const body = "Thợ vừa gửi thay đổi phạm vi. Vui lòng xem ngay.";
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: "scope_change_requested",
    title,
    body,
    metadata: { scope_change_id: scopeChangeId },
  });

  const push = await sendPushToUser(client, customerId, {
    title,
    body,
    data: {
      event_type: "scope_change_requested",
      job_id: jobId,
      scope_change_id: scopeChangeId,
      deep_link: `/(customer)/history?scope_change=${scopeChangeId}&job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api scope-change customer push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function notifyCustomerScopeChangeDecided(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  scopeChangeId: string,
  decision: "approve" | "reject",
) {
  if (!customerId || !scopeChangeId) return;
  const approved = decision === "approve";
  const title = approved
    ? "Kael đã duyệt thay đổi phạm vi"
    : "Kael đã từ chối thay đổi phạm vi";
  const body = approved
    ? "Kael đã cập nhật giá theo phạm vi mới. Bạn có thể xem lại hoặc khiếu nại trong Hoạt động."
    : "Kael đã hủy phần phát sinh theo chính sách. Bạn có thể xem lại trong Hoạt động.";
  const eventType = approved
    ? "scope_change_auto_approved"
    : "scope_change_auto_rejected";
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType,
    title,
    body,
    metadata: { scope_change_id: scopeChangeId, decision, actor: "kael_system" },
  });

  const push = await sendPushToUser(client, customerId, {
    title,
    body,
    data: {
      event_type: eventType,
      job_id: jobId,
      scope_change_id: scopeChangeId,
      deep_link: `/(customer)/history?scope_change=${scopeChangeId}&job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api scope-change customer decision push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function notifyCustomerWorkerReplacementSearch(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  broadcastSent: boolean,
) {
  if (!customerId) return;
  const title = "Đang tìm thợ thay thế";
  const body = broadcastSent
    ? "Kael đã gửi yêu cầu đến thợ phù hợp khác."
    : "Kael đang tìm thợ phù hợp khác cho yêu cầu này.";
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: "worker_replacement_search",
    title,
    body,
    metadata: { broadcast_sent: broadcastSent },
  });

  const push = await sendPushToUser(client, customerId, {
    title,
    body,
    data: {
      event_type: "worker_replacement_search",
      job_id: jobId,
      deep_link: `/(customer)/history?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api replacement customer push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function notifyWorkerCustomerCancellation(
  client: DbClient,
  jobId: string,
  workerId: string,
  subCase: CustomerCancellationSubCase,
) {
  if (!workerId) return;
  const title = "Khách đã hủy yêu cầu";
  const body = subCase === "scheduled_job"
    ? "Khách đã hủy lịch sắp tới. Kael đã ghi nhận trong Phase 0."
    : "Khách đã hủy sau khi bạn nhận việc. Kael đã ghi nhận goodwill Phase 0.";

  await insertUserNotification(client, {
    userId: workerId,
    jobId,
    eventType: "customer_cancelled_after_accept",
    title,
    body,
    metadata: {
      sub_case: subCase,
      phase0_no_monetary_penalty: true,
    },
  });

  const push = await sendPushToUser(client, workerId, {
    title,
    body,
    data: {
      event_type: "customer_cancelled_after_accept",
      job_id: jobId,
      deep_link: `/(worker)/jobs?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api customer-cancel worker push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function notifyWorkerScopeDecision(
  client: DbClient,
  jobId: string,
  scopeChangeId: string,
  decision: "approve" | "reject",
) {
  if (!jobId || !scopeChangeId) return;
  const workerLookup = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("worker_id").eq("id", jobId).single(),
  );
  if (workerLookup.error || !workerLookup.data) {
    console.warn("mobile-api worker scope-decision lookup failed", { jobId });
    return;
  }
  const workerId = nullableString(workerLookup.data.worker_id);
  if (!workerId) return;

  const approved = decision === "approve";
  const eventType = approved
    ? "scope_change_approved"
    : "scope_change_rejected";
  const title = approved
    ? "Kael đã duyệt thay đổi"
    : "Kael đã từ chối thay đổi";
  const body = approved
    ? "Bạn có thể tiếp tục xử lý công việc. Khách vẫn có đường khiếu nại nếu thông tin thực tế chưa đúng."
    : "Công việc đã được hủy theo quyết định của Kael.";
  await insertUserNotification(client, {
    userId: workerId,
    jobId,
    eventType,
    title,
    body,
    metadata: { scope_change_id: scopeChangeId, decision, actor: "kael_system" },
  });

  const push = await sendPushToUser(client, workerId, {
    title,
    body,
    data: {
      event_type: eventType,
      job_id: jobId,
      scope_change_id: scopeChangeId,
      deep_link: `/(worker)/jobs?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api worker scope-decision push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function insertUserNotification(
  client: DbClient,
  input: {
    userId: string;
    jobId: string;
    eventType: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
) {
  const notification = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("insert_notification_atomic", {
      p_user_id: input.userId,
      p_job_id: input.jobId,
      p_event_type: input.eventType,
      p_title: input.title,
      p_body: input.body,
      p_safe_metadata: input.metadata ?? {},
    }),
  );
  if (notification.error) {
    console.warn("mobile-api notification insert failed", {
      jobId: input.jobId,
      eventType: input.eventType,
    });
  }
}

async function listBroadcastRecipientWorkerIds(client: DbClient, jobId: string) {
  const workerIds = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const result = await dbQuery<Array<Record<string, unknown>>>(
      client
        .from("job_broadcasts")
        .select("worker_id")
        .eq("job_id", jobId)
        .order("broadcast_at", { ascending: true })
        .range(from, from + pageSize - 1),
    );
    if (result.error) {
      return {
        success: false as const,
        reason: "Đã duyệt hủy nhưng không thể kiểm tra danh sách thợ đã nhận yêu cầu.",
      };
    }
    const rows = result.data ?? [];
    for (const row of rows) {
      const workerId = asString(row.worker_id);
      if (workerId) workerIds.add(workerId);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return {
    success: true as const,
    workerIds: Array.from(workerIds),
  };
}

async function expireStaleBroadcasts(
  client: DbClient,
  jobId: string,
  nowIso: string,
) {
  const result = await dbQuery(
    client
      .from("job_broadcasts")
      .update({ status: "expired", responded_at: nowIso })
      .eq("job_id", jobId)
      .eq("status", "sent")
      .lte("expires_at", nowIso),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật broadcast đã hết hạn", 500);
  }
}

async function hasActiveBroadcast(
  client: DbClient,
  jobId: string,
  nowIso: string,
): Promise<boolean> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_broadcasts")
      .select("id, expires_at")
      .eq("job_id", jobId)
      .eq("status", "sent")
      .limit(20),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra broadcast hiện tại", 500);
  }
  return (result.data ?? []).some((row) => {
    const expiresAt = nullableString(row.expires_at);
    return !expiresAt || expiresAt > nowIso;
  });
}

async function acquireBroadcastRetryLease(
  client: DbClient,
  jobId: string,
  customerId: string,
  nowIso: string,
): Promise<boolean> {
  const guardIso = new Date(Date.parse(nowIso) - 1_000).toISOString();
  const result = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({ broadcast_at: nowIso, confirmed_search_at: nowIso })
      .eq("id", jobId)
      .eq("customer_id", customerId)
      .eq("status", "broadcasting")
      .or(`broadcast_at.is.null,broadcast_at.lte.${guardIso}`)
      .select("id")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể bắt đầu tìm thợ", 500);
  }
  return Boolean(result.data);
}

async function getJobBroadcastState(client: DbClient, jobId: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  await expireStaleBroadcasts(client, jobId, nowIso);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_broadcasts")
      .select("id, expires_at")
      .eq("job_id", jobId)
      .eq("status", "sent")
      .limit(20),
  );
  if (result.error) {
    apiFailure(
      "DB_ERROR",
      "Không thể kiểm tra trạng thái broadcast",
      500,
    );
  }
  const active = (result.data ?? []).filter((row) => {
    const expiresAt = nullableString(row.expires_at);
    return !expiresAt || expiresAt > nowIso;
  });
  const seconds = active
    .map((row) => secondsRemaining(nullableString(row.expires_at), now))
    .filter((value): value is number => value !== null);
  return {
    active_count: active.length,
    seconds_remaining: seconds.length > 0 ? Math.max(...seconds) : 0,
  };
}

async function getCurrentScopeChange(client: DbClient, jobId: string) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("scope_change_requests")
      .select(
        "id, status, requested_description, reason, price_min, price_max, kael_computed_min, kael_computed_max, kael_review, kael_progress, evidence_photo_urls, created_at",
      )
      .eq("job_id", jobId)
      .in("status", ["waiting_customer_decision", "reviewing_by_kael"])
      .order("created_at", { ascending: false })
      .limit(1),
  );
  if (result.error) {
    apiFailure(
      "DB_ERROR",
      "Không thể tải yêu cầu đổi phạm vi hiện tại",
      500,
    );
  }
  const row = result.data?.[0];
  if (!row) return null;
  return {
    id: asString(row.id),
    status: row.status as ScopeChangeStatus,
    requested_description: nullableString(row.requested_description),
    reason: nullableString(row.reason),
    price_min: nullableNumber(row.price_min),
    price_max: nullableNumber(row.price_max),
    kael_computed_min: nullableNumber(row.kael_computed_min),
    kael_computed_max: nullableNumber(row.kael_computed_max),
    kael_review: nullableRecord(row.kael_review),
    kael_progress: parseKaelProgressSnapshot(row.kael_progress, asString(row.id)),
    evidence_photo_urls: asStringArray(row.evidence_photo_urls),
    created_at: nullableString(row.created_at),
  };
}

async function queryEligibleWorkers(
  client: DbClient,
  serviceType: ServiceType,
  district: string,
  limit: number,
  options: { excludeWorkerIds?: string[]; jobId?: string } = {},
) {
  const candidateLimit = Math.max(limit, DEFAULT_WORKER_CANDIDATE_POOL_SIZE);
  const districtCode = normalizeDistrict(district);
  const excludedWorkerIds = new Set(options.excludeWorkerIds ?? []);
  const jobGeo = options.jobId
    ? await loadJobGeoForMatching(client, options.jobId)
    : null;
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("worker_profiles")
      .select("id, rating, total_jobs, service_types, districts, home_lat, home_lng, service_radius_km, problem_specializations")
      .eq("is_approved", true)
      .eq("is_available", true)
      .eq("is_suspended", false)
      .contains("service_types", [serviceType])
      .or(`districts.cs.{${districtCode}},districts.cs.{hcmc_all}`)
      .order("rating", { ascending: false })
      .limit(candidateLimit),
  );
  if (result.error) {
    console.warn("mobile-api worker eligibility query failed", {
      serviceType,
      district: districtCode,
      errorCode: result.error.code,
    });
    return {
      success: false as const,
      reason: "Lỗi khi tìm thợ phù hợp",
    };
  }
  const candidates = (result.data ?? []).filter((worker) =>
    !excludedWorkerIds.has(asString(worker.id))
  );
  const candidateIds = candidates
    .map((worker) => asString(worker.id))
    .filter(Boolean);
  if (candidateIds.length === 0) {
    return { success: true as const, workers: [] };
  }
  const activeJobs = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("jobs")
      .select("worker_id")
      .in("worker_id", candidateIds)
      .in("status", ACTIVE_WORKER_JOB_STATUSES)
      .limit(candidateIds.length),
  );
  if (activeJobs.error) {
    console.warn("mobile-api active worker job query failed", {
      serviceType,
      district: districtCode,
      errorCode: activeJobs.error.code,
    });
    return {
      success: false as const,
      reason: "Lỗi khi tìm thợ phù hợp",
    };
  }
  const busyWorkerIds = new Set(
    (activeJobs.data ?? [])
      .map((job) => asString(job.worker_id))
      .filter(Boolean),
  );
  return {
    success: true as const,
    workers: rankEligibleWorkers(
      candidates.filter((worker) => !busyWorkerIds.has(asString(worker.id))),
      jobGeo,
    )
      .slice(0, limit)
      .map((worker) => ({
        id: asString(worker.id),
      })),
  };
}

async function loadJobGeoForMatching(client: DbClient, jobId: string) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select("address_lat, address_lng, problem_chips, service_problem_id, kael_problem_identified")
      .eq("id", jobId)
      .maybeSingle(),
  );
  if (result.error) {
    console.warn("mobile-api geo job lookup failed", {
      jobId,
      errorCode: result.error.code,
    });
    return null;
  }
  if (!result.data) return null;
  return {
    lat: nullableNumber(result.data.address_lat),
    lng: nullableNumber(result.data.address_lng),
    problemKeys: specializationKeys([
      ...asStringArray(result.data.problem_chips),
      nullableString(result.data.service_problem_id),
      nullableString(result.data.kael_problem_identified),
    ]),
  };
}

function rankEligibleWorkers(
  workers: Array<Record<string, unknown>>,
  jobGeo: Awaited<ReturnType<typeof loadJobGeoForMatching>>,
) {
  return workers
    .map((worker) => {
      const workerLat = nullableNumber(worker.home_lat);
      const workerLng = nullableNumber(worker.home_lng);
      const radius = clampServiceRadius(worker.service_radius_km);
      const distanceKm = jobGeo && jobGeo.lat !== null && jobGeo.lng !== null &&
          workerLat !== null && workerLng !== null
        ? distanceKmBetween(jobGeo.lat, jobGeo.lng, workerLat, workerLng)
        : null;
      const specializationMatch = hasSpecializationMatch(
        asStringArray(worker.problem_specializations),
        jobGeo?.problemKeys ?? new Set<string>(),
      );
      const rating = asNumber(worker.rating);
      const totalJobs = asNumber(worker.total_jobs);
      const distanceScore = distanceKm === null || distanceKm <= radius
        ? 0
        : -(distanceKm - radius) * 2;
      return {
        worker,
        rating,
        totalJobs,
        score: rating * 10 + (specializationMatch ? 20 : 0) + distanceScore,
      };
    })
    .sort((left, right) =>
      right.score - left.score ||
      right.rating - left.rating ||
      right.totalJobs - left.totalJobs
    )
    .map((entry) => entry.worker);
}

function distanceKmBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasSpecializationMatch(
  workerSpecializations: string[],
  jobProblemKeys: Set<string>,
) {
  if (jobProblemKeys.size === 0 || workerSpecializations.length === 0) return false;
  return workerSpecializations
    .map(normalizeSpecializationKey)
    .some((key) => key.length > 0 && jobProblemKeys.has(key));
}

function specializationKeys(values: Array<string | null>) {
  return new Set(
    values
      .map((value) => normalizeSpecializationKey(value ?? ""))
      .filter(Boolean),
  );
}

function normalizeSpecializationKey(value: string) {
  return value.trim().toLowerCase();
}

async function logJobEvent(
  client: DbClient,
  jobId: string,
  eventType: string,
  actor: MobileApiContext,
  fromStatus: JobStatus | null,
  toStatus: JobStatus | null,
  metadata: Record<string, unknown> = {},
) {
  await dbQuery(
    client.from("job_events").insert({
      job_id: jobId,
      actor_id: actor.user.id,
      actor_role: actor.role,
      event_type: eventType,
      from_status: fromStatus,
      to_status: toStatus,
      safe_metadata: metadata,
    }),
  ).catch(() => {
    console.warn("mobile-api job event log failed", { jobId, eventType });
  });
}

async function auditGuardrailTripBestEffort(
  client: DbClient,
  input: {
    readonly jobId: string | null;
    readonly actorId: string | null;
    readonly actorRole: "customer" | "worker";
    readonly surface: string;
    readonly reason: string;
    readonly guardrailLabel?: string | null;
    readonly source:
      | "self_check"
      | "semantic_self_check"
      | "boundary_guard"
      | "autonomy_gate";
    readonly safeMetadata?: Record<string, unknown>;
  },
) {
  await auditKaelGuardrailTrip(client, {
    jobId: input.jobId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    surface: input.surface,
    reason: input.reason,
    guardrailLabel: input.guardrailLabel ?? null,
    source: input.source,
    safeMetadata: input.safeMetadata,
  }).catch((error) => {
    console.warn("mobile-api kael guardrail audit failed", {
      surface: input.surface,
      reason: input.reason,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  });
}

function isWorkerAssistGuardrailReason(reason: string) {
  return reason === "MONEY_OR_STATUS_MUTATION" ||
    reason === "SELF_CHECK" ||
    reason === "semantic_guardrail" ||
    reason === "exact_vnd" ||
    reason === "language_mismatch" ||
    reason === "sentence_too_long" ||
    reason === "fear_language" ||
    reason === "absolute_claim" ||
    reason === "ai_self_reference" ||
    reason === "accusatory_in_dispute" ||
    reason === "aggressive_response";
}

async function queueKaelLearningEvent(
  client: DbClient,
  event: LearningSkillTrigger,
  input: LearningSkillInput,
) {
  const flags = readKaelOptimizationFlags();
  const queueFn = flags.KAEL_OPT_BATCH_LEARNING_ENABLED
    ? queueLearningForBatch
    : queueLearningSkillTriggers;
  await queueFn(client, event, input).catch((error) => {
    console.warn("mobile-api kael learning queue failed", {
      event,
      jobId: nullableString(input.job_id),
      errorName: error instanceof Error ? error.name : typeof error,
    });
  });
}

async function logMemoryAudit(
  client: DbClient,
  input: {
    subjectType: "customer" | "worker" | "job" | "domain" | "system";
    subjectId: string | null;
    actorId: string | null;
    operation: "read" | "write" | "delete" | "archive";
    layer: string;
    purpose: string;
  },
) {
  await dbQuery(
    client.from("kael_memory_audit").insert({
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      actor_id: input.actorId,
      operation: input.operation,
      layer: input.layer,
      purpose: input.purpose,
      safe_metadata: {},
    }),
  ).catch(() => {
    console.warn("mobile-api kael memory audit failed", {
      subjectType: input.subjectType,
      operation: input.operation,
    });
  });
}

async function logApiCalls(
  client: DbClient,
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) return;
  const result = await dbQuery(client.from("api_logs").insert(rows));
  if (result.error) {
    console.warn("mobile-api api_logs batch insert failed", {
      count: rows.length,
    });
    return;
  }

  const metricRows = buildKaelOptimizationMetricRows(rows);
  if (metricRows.length === 0) return;
  const metricsResult = await dbQuery(
    client.from("kael_optimization_metrics").insert(metricRows),
  );
  if (metricsResult.error) {
    console.warn("mobile-api optimization metrics insert failed", {
      count: metricRows.length,
    });
  }
}

function apiLogPurposeForPipelineStage(
  stage: PipelineStageLog["stage"],
): string {
  switch (stage) {
    case "intent":
      return "intent_classification";
    case "vision":
      return "vision_analysis";
    case "market":
      return "market_lookup";
    case "synthesis":
      return "price_synthesis";
    case "baseline":
      return "problem_synthesis";
  }
}

function sourceTrustSecretsForRequest(
  secrets: EdgeAiSecrets,
  ctx: MobileApiContext,
): EdgeAiSecrets {
  if (secrets.sourceTrustPerplexityFilterEnabled === true) return secrets;
  if (secrets.sourceTrustPerplexityFilterExplicit === true) return secrets;
  if (!isStagingSourceTrustRequest(secrets, ctx)) return secrets;
  return { ...secrets, sourceTrustPerplexityFilterEnabled: true };
}

function isStagingSourceTrustRequest(
  secrets: EdgeAiSecrets,
  ctx: MobileApiContext,
): boolean {
  return [
    secrets.supabaseUrl,
    ctx.requestProjectRef,
    ctx.requestHost,
    ctx.requestUrl,
  ].some((value) =>
    typeof value === "string" && value.includes(STAGING_PROJECT_REF)
  );
}

function mapConfirmKaelChatError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  if (errorCode === "INVALID_STATUS" || errorCode === "ALREADY_CONFIRMED") {
    apiFailure(
      "INVALID_STATUS",
      "Phiên Kael chưa sẵn sàng hoặc đã được xác nhận",
      409,
    );
  }
  if (errorCode === "MISSING_ESTIMATE") {
    apiFailure("INVALID_STATUS", "Kael chưa có ước tính để đặt thợ", 409);
  }
  if (errorCode === "NO_DISTRICT") {
    apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  }
  apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
}

function serializeKaelTurn(row: Record<string, unknown>) {
  const metadata = asRecord(row.safe_metadata);
  const contentType = asKaelContentType(row.content_type);
  return {
    id: asString(row.id),
    session_id: asString(row.session_id),
    turn_index: asNumber(row.turn_index),
    role: asKaelTurnRole(row.role),
    content_type: contentType,
    text_content: nullableString(row.text_content),
    media_refs: asStringArray(row.media_refs),
    estimate: serializeKaelEstimate(metadata.estimate),
    // Smart clarification (2026-06-04): surface what Kael still needs so the mobile
    // thread can render slot-hint chips. Drawn from the missing-info artifact proposal.
    clarification: serializeKaelClarification(contentType, metadata.artifact_proposal),
    created_at: asString(row.created_at),
  };
}

function serializeKaelClarification(
  contentType: string,
  artifactProposal: unknown,
): { question: string | null; missing_slots: string[] } | null {
  if (contentType !== "clarification") return null;
  const proposal = asRecord(artifactProposal);
  const question = nullableString(proposal.recommended_next_question);
  const missingSlots = asStringArray(proposal.missing_fields);
  if (!question && missingSlots.length === 0) return null;
  return { question, missing_slots: missingSlots };
}

function serializeKaelSession(
  row: Record<string, unknown>,
  estimate: ReturnType<typeof serializeKaelEstimate>,
  turns: Array<ReturnType<typeof serializeKaelTurn>>,
) {
  const status = asKaelChatStatus(row.status);
  const lastTurn = turns[turns.length - 1];
  const totalCostUsd = asNumber(row.total_cost_usd);
  return {
    id: asString(row.id),
    job_id: nullableString(row.job_id),
    customer_id: asString(row.customer_id),
    service_type: asServiceType(row.service_type),
    status,
    estimate,
    started_at: asString(row.started_at),
    estimate_ready_at: nullableString(row.estimate_ready_at),
    total_turns: asNumber(row.total_turns),
    total_cost_usd: totalCostUsd,
    next_action: kaelNextAction(status, lastTurn?.content_type, totalCostUsd),
  };
}

function serializeKaelEstimate(value: unknown) {
  const estimate = asRecord(value);
  if (Object.keys(estimate).length === 0) return null;
  return {
    service_type: asServiceType(estimate.service_type),
    problem_category: asString(estimate.problem_category),
    problem_summary: asString(estimate.problem_summary),
    complexity: asComplexity(estimate.complexity),
    price_min: asNumber(estimate.price_min),
    price_max: asNumber(estimate.price_max),
    confidence: asNumber(estimate.confidence),
    advisory: nullableString(estimate.advisory),
    disclaimer: nullableString(estimate.disclaimer) ?? PRICE_DISCLAIMER,
  };
}

function serializeJobMessage(row: Record<string, unknown>) {
  return {
    id: asString(row.id),
    job_id: asString(row.job_id),
    sender_id: nullableString(row.sender_id),
    sender_role: asMessageSender(row.sender_role),
    content: asString(row.content),
    is_read: asBoolean(row.is_read),
    created_at: asString(row.created_at),
  };
}

function kaelNextAction(
  status: KaelChatStatus,
  lastContentType: string | undefined,
  totalCostUsd: number,
): KaelChatNextAction {
  if (status === "confirmed") return "confirmed";
  if (status === "unsupported") return "unsupported";
  if (status === "collecting_evidence") return "collect_evidence";
  if (totalCostUsd >= KAEL_CHAT_HARD_COST_CAP_USD) return "budget_exceeded";
  if (status === "estimate_ready") return "estimate_ready";
  if (lastContentType === "photo_request") return "ask_photo";
  if (lastContentType === "video_request") return "ask_video";
  if (lastContentType === "error") return "unsupported";
  return "await_input";
}

function asKaelTurnRole(value: unknown): KaelChatTurnRole {
  if (value === "customer" || value === "kael" || value === "system") {
    return value;
  }
  return "system";
}

function asKaelContentType(value: unknown): KaelChatContentType {
  if (
    value === "text" ||
    value === "photo_request" ||
    value === "video_request" ||
    value === "photo_attached" ||
    value === "video_attached" ||
    value === "clarification" ||
    value === "analysis" ||
    value === "estimate" ||
    value === "error"
  ) {
    return value;
  }
  return "text";
}

function compactMetadata(input: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      result[key] = value.filter((item) => typeof item === "string");
      continue;
    }
    result[key] = value;
  }
  return result;
}

function demandingCustomerTurnMetadata(
  detection: ReturnType<typeof detectDemandingCustomerPatterns>,
  response: ReturnType<typeof buildDemandingCustomerResponse>,
) {
  return {
    nuance: detection.nuance,
    expected_nuance: detection.expectedNuance,
    escalation_level: detection.escalationLevel,
    pressure_score: detection.pressureScore,
    legitimate_concern_signals: detection.legitimateConcernSignals,
    pressure_signals: detection.pressureSignals,
    strategy_ids: response.strategyIds,
    admin_queue_priority: response.adminQueuePriority,
    stop_ai_loop: response.stopAiLoop,
  };
}

function demandingCustomerSessionMetadata(
  previousMetadata: Record<string, unknown>,
  detection: ReturnType<typeof detectDemandingCustomerPatterns>,
  response: ReturnType<typeof buildDemandingCustomerResponse>,
) {
  return compactMetadata({
    ...previousMetadata,
    demanding_customer_last_nuance: detection.nuance,
    demanding_customer_escalation_level: detection.escalationLevel,
    demanding_customer_admin_queue_priority: response.adminQueuePriority,
    demanding_customer_stop_ai_loop: response.stopAiLoop,
    demanding_customer_hard_escalation:
      response.stopAiLoop || previousMetadata.demanding_customer_hard_escalation === true,
    demanding_customer_last_at: new Date().toISOString(),
  });
}

function formatKaelEstimateText(estimate: {
  problem_summary: string;
  complexity: ComplexityLevel;
  price_min: number;
  price_max: number;
  advisory: string | null;
  disclaimer: string;
}) {
  const advisory = estimate.advisory ? ` Lưu ý: ${estimate.advisory}` : "";
  return `Kael đã có ước tính: ${estimate.problem_summary}. Mức độ ${estimate.complexity}, khoảng ${estimate.price_min.toLocaleString("vi-VN")}-${estimate.price_max.toLocaleString("vi-VN")} đ. ${estimate.disclaimer}${advisory}`;
}

function mapAcceptError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Yêu cầu này không dành cho bạn", 404);
  }
  if (errorCode === "BROADCAST_NOT_ACTIVE") {
    apiFailure(
      "BROADCAST_NOT_ACTIVE",
      "Yêu cầu này đã được xử lý hoặc đã hết hạn",
      409,
    );
  }
  if (errorCode === "EXPIRED") {
    apiFailure("EXPIRED", "Yêu cầu đã hết hạn", 410);
  }
  if (errorCode === "ALREADY_TAKEN") {
    apiFailure("ALREADY_TAKEN", "Yêu cầu đã được thợ khác nhận trước", 409);
  }
  if (errorCode === "WORKER_NOT_ELIGIBLE") {
    apiFailure(
      "WORKER_NOT_ELIGIBLE",
      "Tài khoản thợ chưa đủ điều kiện nhận việc",
      403,
    );
  }
  apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
}

function mapAvailabilityError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Vui lòng hoàn tất đăng ký trước", 404);
  }
  if (errorCode === "NOT_APPROVED") {
    apiFailure("NOT_APPROVED", "Hồ sơ thợ chưa sẵn sàng nhận việc", 403);
  }
  if (errorCode === "WORKER_BUSY") {
    apiFailure(
      "WORKER_BUSY",
      "Bạn đang có công việc chưa kết thúc nên chưa thể bật nhận việc",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
}

function mapCancelError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Chỉ có thể hủy trước khi thợ nhận việc", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể hủy yêu cầu", 500);
}

function mapWorkerCancellationRequestError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy công việc phù hợp", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái công việc chưa thể yêu cầu hủy", 409);
  }
  if (errorCode === "ALREADY_REQUESTED") {
    apiFailure("ALREADY_REQUESTED", "Yêu cầu hủy đang chờ Kael/Admin duyệt", 409);
  }
  if (errorCode === "RATE_LIMITED") {
    apiFailure("RATE_LIMITED", "Thợ đã hủy quá nhiều lần trong 24 giờ", 429);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure("STATUS_CHANGED", "Công việc đã thay đổi, vui lòng tải lại", 409);
  }
  if (errorCode === "INVALID_REASON") {
    apiFailure("VALIDATION", "Cần lý do hủy rõ ràng", 400);
  }
  apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy việc", 500);
}

function mapCustomerCancellationError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái yêu cầu chưa thể hủy theo Case 4", 409);
  }
  if (errorCode === "ALREADY_REQUESTED") {
    apiFailure("ALREADY_REQUESTED", "Yêu cầu hủy đang được xử lý", 409);
  }
  if (errorCode === "INVALID_REASON") {
    apiFailure("VALIDATION", "Cần chọn lý do hủy hợp lệ", 400);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure("STATUS_CHANGED", "Trạng thái đã thay đổi, vui lòng tải lại", 409);
  }
  apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy", 500);
}

function mapDisputeOpenError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy công việc", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền mở tranh chấp này", 403);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái công việc chưa thể mở tranh chấp", 409);
  }
  if (errorCode === "ALREADY_OPEN") {
    apiFailure("ALREADY_OPEN", "Tranh chấp đang được xử lý", 409);
  }
  if (errorCode === "DEFERRED_PHASE0") {
    apiFailure("DEFERRED_PHASE0", "Thanh toán đang được hoãn trong Phase 0", 409);
  }
  apiFailure("DB_ERROR", "Không thể mở kiểm tra tranh chấp", 500);
}

function mapDisputeCounterError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy tranh chấp", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền phản hồi tranh chấp này", 403);
  }
  if (errorCode === "ALREADY_SUBMITTED") {
    apiFailure("ALREADY_SUBMITTED", "Phản hồi đã được ghi nhận", 409);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Tranh chấp không còn nhận phản hồi", 409);
  }
  apiFailure("DB_ERROR", "Không thể gửi phản hồi tranh chấp", 500);
}

function mapDisputeDecisionError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy tranh chấp", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được quyết định tranh chấp", 403);
  }
  if (errorCode === "ALREADY_DECIDED") {
    apiFailure("ALREADY_DECIDED", "Tranh chấp đã có quyết định", 409);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái tranh chấp không hợp lệ", 409);
  }
  apiFailure("DB_ERROR", "Không thể ghi quyết định tranh chấp", 500);
}

function mapWorkerCancellationDecisionError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu hủy", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được duyệt yêu cầu hủy", 403);
  }
  if (errorCode === "ALREADY_DECIDED") {
    apiFailure("ALREADY_DECIDED", "Yêu cầu hủy đã được xử lý", 409);
  }
  if (errorCode === "JOB_CHANGED") {
    apiFailure("STATUS_CHANGED", "Công việc đã thay đổi, vui lòng tải lại", 409);
  }
  if (errorCode === "JOB_NOT_CANCELLABLE") {
    apiFailure("STATUS_CHANGED", "Công việc đã qua giai đoạn có thể duyệt hủy", 409);
  }
  if (errorCode === "INVALID_DECISION") {
    apiFailure("VALIDATION", "Quyết định không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể xử lý yêu cầu hủy việc", 500);
}

function mapScopeRequestError(errorCode: string | null): never {
  if (KAEL_SCOPE_PRICE_ERRORS.has(errorCode ?? "")) {
    apiFailure("KAEL_PRICE_MISSING", "Kael chua tinh duoc gia phat sinh hop le", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Bạn không có quyền thực hiện hành động này",
      403,
    );
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái yêu cầu không hợp lệ", 409);
  }
  if (errorCode === "INVALID_PRICE_RANGE") {
    apiFailure("VALIDATION", "Khoảng giá không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500);
}

// Keep Kael-owned scope-change price failures user-visible instead of DB_ERROR.
const KAEL_SCOPE_PRICE_ERRORS = new Set(["KAEL_PRICE_MISSING", "KAEL_REVIEW_MISSING"]);

function mapScopeDecisionError(errorCode: string | null): never {
  if (errorCode === "KAEL_PRICE_MISSING") {
    apiFailure("KAEL_PRICE_MISSING", "Kael chua chot gia phat sinh nen chua the duyet", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu thay đổi", 404);
  }
  if (errorCode === "ALREADY_DECIDED") {
    apiFailure("ALREADY_DECIDED", "Yêu cầu này đã được xử lý", 409);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái yêu cầu không hợp lệ", 409);
  }
  if (errorCode === "INVALID_DECISION") {
    apiFailure("VALIDATION", "Quyết định không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể cập nhật quyết định", 500);
}

function mapReviewError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "ALREADY_REVIEWED") {
    apiFailure("ALREADY_REVIEWED", "Yêu cầu này đã được đánh giá", 409);
  }
  if (errorCode === "INVALID_RATING") {
    apiFailure("VALIDATION", "Đánh giá phải từ 1 đến 5 sao", 400);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Chưa thể đánh giá yêu cầu này", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể gửi đánh giá", 500);
}

function validateJobMediaPath(
  jobId: string,
  stage: JobMediaAttachInput["assets"][number]["stage"],
  objectPath: string,
) {
  const expectedPrefix = `${jobId}/${stage}/`;
  const safePathPattern =
    /^[0-9a-fA-F-]{36}\/(?:before|after|kael_reference|cancellation_evidence|scope_change_evidence)\/[A-Za-z0-9._-]+$/;
  if (
    !objectPath.startsWith(expectedPrefix) ||
    objectPath.includes("..") ||
    objectPath.includes("//") ||
    !safePathPattern.test(objectPath)
  ) {
    apiFailure("VALIDATION", "Đường dẫn media không hợp lệ", 400);
  }
}

function canAttachJobMediaStage(
  stage: JobMediaAttachInput["assets"][number]["stage"],
  isCustomer: boolean,
  isWorker: boolean,
  isAdmin: boolean,
) {
  if (isAdmin) return true;
  if (stage === "before") return isCustomer;
  if (stage === "kael_reference") return isCustomer || isWorker;
  return isWorker;
}

function storageRef(objectPath: string) {
  return `supabase://job-media/${objectPath}`;
}

const KAEL_CHAT_MEDIA_BUCKET = "kael-chat-media";
const KAEL_CHAT_MEDIA_REF_PREFIX = `supabase://${KAEL_CHAT_MEDIA_BUCKET}/`;
const KAEL_CHAT_MEDIA_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/webm",
]);

function kaelChatStorageRef(objectPath: string) {
  return `${KAEL_CHAT_MEDIA_REF_PREFIX}${objectPath}`;
}

function normalizeKaelChatMediaMime(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  if (KAEL_CHAT_MEDIA_MIME_TYPES.has(normalized)) return normalized;
  return null;
}

function safeKaelChatObjectName(fileName: string | null | undefined, mimeType: string) {
  const source = (fileName ?? `media.${kaelChatExtensionForMime(mimeType)}`)
    .split(/[\\/]/)
    .pop() ?? "media";
  const cleaned = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const hasExtension = /\.[a-z0-9]{2,6}$/i.test(cleaned);
  const base = cleaned || "media";
  return `${Date.now()}-${crypto.randomUUID()}-${base}${
    hasExtension ? "" : `.${kaelChatExtensionForMime(mimeType)}`
  }`;
}

function kaelChatExtensionForMime(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/heif") return "heif";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "audio/aac") return "aac";
  if (mimeType === "audio/wav") return "wav";
  return "bin";
}

function kaelChatObjectPathFromRef(ref: string, userId: string) {
  if (!ref.startsWith(KAEL_CHAT_MEDIA_REF_PREFIX)) return null;
  const objectPath = ref.slice(KAEL_CHAT_MEDIA_REF_PREFIX.length);
  if (!objectPath.startsWith(`${userId}/kael-chat/`)) return null;
  if (objectPath.includes("..") || objectPath.includes("//")) return null;
  return objectPath;
}

async function signedKaelChatMediaUrls(
  client: DbClient,
  userId: string,
  refs: string[],
) {
  if (!client.storage) {
    apiFailure("MEDIA_SIGN_FAILED", "Không thể chuẩn bị media cho Kael", 500);
  }
  const bucket = client.storage.from(KAEL_CHAT_MEDIA_BUCKET) as {
    createSignedUrl(
      path: string,
      expiresIn: number,
    ): Promise<{ data: { signedUrl?: string } | null; error: unknown }>;
  };
  const urls: string[] = [];
  for (const ref of refs) {
    const objectPath = kaelChatObjectPathFromRef(ref, userId);
    if (!objectPath) {
      apiFailure("INVALID_MEDIA_REF", "Đường dẫn media không hợp lệ", 400);
    }
    const { data, error } = await bucket.createSignedUrl(objectPath, 60 * 60);
    if (error || !data?.signedUrl) {
      apiFailure("MEDIA_SIGN_FAILED", "Không thể chuẩn bị media cho Kael", 500);
    }
    urls.push(data.signedUrl);
  }
  return urls;
}

function mergeLimitedRefs(existing: string[], incoming: string[], limit: number) {
  return Array.from(new Set([...existing, ...incoming])).slice(0, limit);
}

function serviceLabel(serviceType: ServiceType): string {
  if (serviceType === "electrical") return "Sửa điện";
  if (serviceType === "plumbing") return "Sửa nước";
  return "Vệ sinh";
}

function districtLabel(district: string): string {
  const slug = normalizeDistrict(district);
  return HCMC_DISTRICTS[slug] ?? HCMC_DISTRICTS.hcmc_all;
}

function assertKaelSessionOwnership(
  session: Record<string, unknown>,
  ctx: MobileApiContext,
) {
  if (ctx.role === "admin") return;
  if (session.customer_id === ctx.user.id) return;
  apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
}

const APARTMENT_ACCESS_PROFILE_KEYS = [
  "entry_method",
  "parking_note",
  "guard_note",
  "building_note",
  "customer_handoff_note",
] as const satisfies ReadonlyArray<keyof ApartmentAccessProfileInput>;

const ADDRESS_BUILDING_RELEASE_STATUSES: readonly JobStatus[] = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
  "confirmed_by_customer",
  "payment_pending",
  "paid",
  "reviewed",
];

function buildInitialApartmentAccessState() {
  return {
    release_stage: "area_only",
    exact_unit_released: false,
    check_in_required: true,
    identity_check_required: true,
    customer_handoff_required: true,
    evidence_mode: "none",
  };
}

function sanitizeApartmentAccessProfile(
  input: unknown,
): ApartmentAccessProfileInput {
  const record = nullableRecord(input) ?? {};
  const profile: ApartmentAccessProfileInput = {};
  for (const key of APARTMENT_ACCESS_PROFILE_KEYS) {
    const value = sanitizeApartmentAccessText(record[key], 300);
    if (value) profile[key] = value;
  }
  return profile;
}

function mergeApartmentAccessProfiles(
  previous: unknown,
  incoming: unknown,
): ApartmentAccessProfileInput {
  return {
    ...sanitizeApartmentAccessProfile(previous),
    ...sanitizeApartmentAccessProfile(incoming),
  };
}

function sanitizeApartmentAccessText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = sanitizeForLLM(value).trim().slice(0, maxLength);
  if (!trimmed) return undefined;
  if (evaluateJobChatContactGuard(trimmed).flagged) {
    return undefined;
  }
  return trimmed;
}

function isEmptyApartmentAccessProfile(profile: ApartmentAccessProfileInput) {
  return APARTMENT_ACCESS_PROFILE_KEYS.every((key) => !profile[key]);
}

async function persistApartmentAccessProfileFromMetadata(
  client: DbClient,
  input: {
    customerId: string;
    jobId: string;
    addressLabel: string | null;
    district: string | null;
    profile: ApartmentAccessProfileInput;
  },
) {
  const fingerprint = apartmentAddressFingerprint(
    input.addressLabel,
    input.district,
  );
  if (!fingerprint) return;

  let profile = sanitizeApartmentAccessProfile(input.profile);
  if (isEmptyApartmentAccessProfile(profile)) {
    const existing = await dbQuery<Record<string, unknown>>(
      client
        .from("kael_chat_pre_intake_memory")
        .select("access_profile")
        .eq("customer_id", input.customerId)
        .eq("address_fingerprint", fingerprint)
        .maybeSingle(),
    ).catch((error) => {
      console.warn("mobile-api apartment access memory lookup failed", {
        jobId: input.jobId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return { data: null, error: { code: "LOOKUP_FAILED" } };
    });
    if (!existing.error && existing.data) {
      profile = sanitizeApartmentAccessProfile(existing.data.access_profile);
    }
  }
  if (isEmptyApartmentAccessProfile(profile)) return;

  const jobUpdate = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({
        apartment_access_profile: profile,
        apartment_access_state: buildInitialApartmentAccessState(),
      })
      .eq("id", input.jobId)
      .select("id")
      .maybeSingle(),
  );
  if (jobUpdate.error) {
    console.warn("mobile-api apartment access job update failed", {
      jobId: input.jobId,
      errorCode: jobUpdate.error.code,
    });
  }

  await dbQuery(
    client
      .from("kael_chat_pre_intake_memory")
      .upsert({
        customer_id: input.customerId,
        address_fingerprint: fingerprint,
        address_label_safe: sanitizeApartmentAccessText(
          input.addressLabel,
          200,
        ) ?? null,
        address_district: input.district,
        access_profile: profile,
        last_used_job_id: input.jobId,
      }),
  ).catch((error) => {
    console.warn("mobile-api apartment access memory upsert failed", {
      jobId: input.jobId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  });
}

function apartmentAddressFingerprint(
  addressLabel: string | null,
  district: string | null,
) {
  if (!addressLabel?.trim()) return null;
  const normalized = normalizeGuardText(
    [district, addressLabel].filter(Boolean).join("|"),
  );
  return normalized.length > 0 ? normalized.slice(0, 160) : null;
}

function projectAddressAccess(
  row: Record<string, unknown>,
  role: MobileApiContext["role"],
  options: { forcedStage?: AddressAccessStage } = {},
): AddressAccessProjection {
  const rawAddress = readAddressParts(row);
  const profile = sanitizeApartmentAccessProfile(row.apartment_access_profile);
  const state = asRecord(row.apartment_access_state);
  const exactUnitReleased = state.exact_unit_released === true;
  const rowStatus = asJobStatus(row.job_status ?? row.status);
  const releasedStage = exactUnitReleased
    ? "unit_released"
    : ADDRESS_BUILDING_RELEASE_STATUSES.includes(rowStatus)
    ? "building_released"
    : "area_only";
  const stage = options.forcedStage ?? releasedStage;
  const evidenceMode = accessEvidenceMode(state);
  const workerAddress = stage === "unit_released"
    ? rawAddress
    : stage === "building_released"
    ? {
      building: redactWorkerBuilding(rawAddress.building) ??
        rawAddress.district,
      unit: null,
      floor: null,
      district: rawAddress.district,
    }
    : {
      building: null,
      unit: null,
      floor: null,
      district: rawAddress.district,
    };

  return {
    fullAddress: role === "worker" ? workerAddress : rawAddress,
    addressAccess: buildAddressAccessView(
      profile,
      role === "worker" ? stage : releasedStage,
      evidenceMode,
    ),
  };
}

function readAddressParts(row: Record<string, unknown>): AddressParts {
  return {
    building: nullableString(row.address_building),
    unit: nullableString(row.address_unit),
    floor: nullableString(row.address_floor),
    district: nullableString(row.address_district),
  };
}

function buildAddressAccessView(
  profile: ApartmentAccessProfileInput,
  stage: AddressAccessStage,
  evidenceMode: AddressAccessEvidenceMode,
): AddressAccessView {
  const exact = stage === "unit_released";
  return {
    release_stage: stage,
    exact_unit_released: exact,
    check_in_required: !exact,
    identity_check_required: true,
    customer_handoff_required: true,
    evidence_mode: exact ? evidenceMode : "none",
    access_profile: profile,
  };
}

function accessEvidenceMode(
  state: Record<string, unknown>,
): AddressAccessEvidenceMode {
  const direct = nullableString(state.evidence_mode);
  if (direct === "geofence" || direct === "manual_photo") return direct;
  const checkIn = nullableRecord(state.check_in);
  const mode = nullableString(checkIn?.mode);
  return mode === "geofence" || mode === "manual_photo" ? mode : "none";
}

function redactWorkerBuilding(value: string | null) {
  if (!value) return null;
  const redacted = value
    .replace(/(?:căn\s*hộ|can\s*ho|căn|can|phòng|phong|unit|apt|apartment)\s*[:#-]?\s*[A-Za-z0-9./-]+/gi, "")
    .replace(/(?:tầng|tang|lầu|lau|floor)\s*[:#-]?\s*[A-Za-z0-9./-]+/gi, "")
    .replace(/\s*,\s*,+/g, ", ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return redacted || null;
}

function buildUnitReleaseAccessState(
  previous: unknown,
  checkIn: WorkerAccessCheckInInput,
  now: string,
) {
  return compactMetadata({
    ...asRecord(previous),
    release_stage: "unit_released",
    exact_unit_released: true,
    check_in_required: false,
    identity_check_required: true,
    customer_handoff_required: true,
    evidence_mode: checkIn.mode,
    unit_released_at: now,
    check_in: compactMetadata({
      mode: checkIn.mode,
      lat: checkIn.lat,
      lng: checkIn.lng,
      accuracy_m: checkIn.accuracy_m,
      photo_urls: checkIn.photo_urls,
      note: sanitizeApartmentAccessText(checkIn.note, 300),
      checked_in_at: checkIn.checked_in_at ?? now,
    }),
  });
}

async function geocodeConfirmedKaelJob(
  client: DbClient,
  sessionId: string,
  jobId: string,
  customerId: string,
  district: string | null,
  secrets: EdgeAiSecrets,
) {
  const session = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("safe_metadata")
      .eq("id", sessionId)
      .maybeSingle(),
  );
  if (session.error) {
    console.warn("mobile-api Kael geocode session lookup failed", {
      jobId,
      errorCode: session.error.code,
    });
    await markJobGeocodeFallback(client, jobId);
    return;
  }
  const metadata = asRecord(session.data?.safe_metadata);
  await persistApartmentAccessProfileFromMetadata(client, {
    customerId,
    jobId,
    addressLabel: nullableString(metadata.address_label),
    district,
    profile: sanitizeApartmentAccessProfile(metadata.apartment_access_profile),
  });
  await geocodeJobAddressForMatching(client, jobId, {
    addressLabel: nullableString(metadata.address_label),
    district,
  }, secrets);
}

async function geocodeJobAddressForMatching(
  client: DbClient,
  jobId: string,
  input: { addressLabel: string | null; district: string | null },
  secrets: EdgeAiSecrets,
) {
  const district = normalizeServiceAreaDistrict(input.district);
  const address = buildGeocodingAddress(input.addressLabel, district);
  const fallbackUpdate = compactMetadata({
    address_building: input.addressLabel?.slice(0, 200) ?? null,
    geo_source: "fallback",
  });
  const vietmapApiKey = readVietmapApiKey(secrets);
  const googleApiKey = readGoogleMapsApiKey(secrets);
  if ((!vietmapApiKey && !googleApiKey) || !district || !address) {
    await updateJobGeo(client, jobId, fallbackUpdate);
    return;
  }

  const vietmapResult = vietmapApiKey
    ? await geocodeWithVietmap(address, vietmapApiKey, jobId)
    : null;
  const result = vietmapResult ??
    (googleApiKey
      ? await geocodeWithGoogleMaps(address, googleApiKey, jobId)
      : null);

  if (result) {
    await updateJobGeo(client, jobId, {
      ...fallbackUpdate,
      address_lat: result.lat,
      address_lng: result.lng,
      geo_source: result.geoSource,
    });
    return;
  }

  await updateJobGeo(client, jobId, fallbackUpdate);
}

async function geocodeWithVietmap(
  address: string,
  apiKey: string,
  jobId: string,
): Promise<GeocodeResult | null> {
  try {
    const searchUrl = buildVietmapUrl(VIETMAP_SEARCH_URL, apiKey, {
      text: address,
      focus: HCMC_MAP_FOCUS,
      display_type: "6",
      cityId: VIETMAP_HCMC_CITY_ID,
    });
    const searchResponse = await fetchJsonWithTimeout(searchUrl, {
      method: "GET",
    });
    if (!searchResponse.ok) {
      console.warn("mobile-api geocoding failed", {
        provider: "vietmap",
        stage: "search",
        jobId,
        status: searchResponse.status,
      });
      return null;
    }

    const searchBody = await searchResponse.json().catch(() => []) as unknown;
    const refId = firstVietmapRefId(searchBody);
    if (!refId) return null;

    const placeUrl = buildVietmapUrl(VIETMAP_PLACE_URL, apiKey, {
      refid: refId,
    });
    const placeResponse = await fetchJsonWithTimeout(placeUrl, { method: "GET" });
    if (!placeResponse.ok) {
      console.warn("mobile-api geocoding failed", {
        provider: "vietmap",
        stage: "place",
        jobId,
        status: placeResponse.status,
      });
      return null;
    }

    const placeBody = asRecord(await placeResponse.json().catch(() => ({})));
    const lat = nullableNumber(placeBody.lat);
    const lng = nullableNumber(placeBody.lng);
    if (lat === null || lng === null) return null;
    return { lat, lng, geoSource: "vietmap" };
  } catch (error) {
    console.warn("mobile-api geocoding threw", {
      provider: "vietmap",
      jobId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

async function vietmapPlaceLocation(
  placeId: string,
  apiKey: string,
): Promise<GeocodeResult | null> {
  try {
    const placeUrl = buildVietmapUrl(VIETMAP_PLACE_URL, apiKey, {
      refid: placeId,
    });
    const placeResponse = await fetchJsonWithTimeout(placeUrl, { method: "GET" });
    if (!placeResponse.ok) {
      console.warn("mobile-api place resolve failed", {
        provider: "vietmap",
        status: placeResponse.status,
      });
      return null;
    }

    const placeBody = asRecord(await placeResponse.json().catch(() => ({})));
    const lat = nullableNumber(placeBody.lat);
    const lng = nullableNumber(placeBody.lng);
    if (lat === null || lng === null) return null;
    return { lat, lng, geoSource: "vietmap" };
  } catch (error) {
    console.warn("mobile-api place resolve threw", {
      provider: "vietmap",
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

async function geocodeWithGoogleMaps(
  address: string,
  apiKey: string,
  jobId: string,
): Promise<GeocodeResult | null> {
  try {
    const url =
      `${GOOGLE_GEOCODING_URL}?address=${encodeURIComponent(address)}&region=vn&language=vi&key=${encodeURIComponent(apiKey)}`;
    const response = await fetchJsonWithTimeout(url, { method: "GET" });
    if (!response.ok) {
      console.warn("mobile-api geocoding failed", {
        provider: "google_maps",
        jobId,
        status: response.status,
      });
      return null;
    }
    const body = await response.json().catch(() => ({})) as {
      status?: string;
      results?: Array<{
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    const location = body.results?.[0]?.geometry?.location;
    if (
      body.status !== "OK" ||
      typeof location?.lat !== "number" ||
      typeof location.lng !== "number"
    ) {
      return null;
    }
    return { lat: location.lat, lng: location.lng, geoSource: "google_maps" };
  } catch (error) {
    console.warn("mobile-api geocoding threw", {
      provider: "google_maps",
      jobId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

function buildGeocodingAddress(
  addressLabel: string | null,
  district: string | null,
) {
  const parts = [
    addressLabel?.trim(),
    district ? districtLabel(district) : null,
    "Ho Chi Minh City",
    "Vietnam",
  ].filter((part): part is string => Boolean(part));
  return Array.from(new Set(parts)).join(", ");
}

function vietmapAutocompleteSuggestion(
  value: unknown,
): PlacesAutocompleteResponse["suggestions"][number] | null {
  const record = asRecord(value);
  const placeId = nullableString(record.ref_id)?.trim() ?? "";
  const label = vietmapDisplayText(record);
  if (!placeId || !label) return null;

  const mainText = nullableString(record.name)?.trim() || label;
  const secondaryText = nullableString(record.address)?.trim() || null;
  return {
    place_id: placeId,
    label,
    main_text: mainText,
    secondary_text: secondaryText,
  };
}

function firstVietmapRefId(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const record = asRecord(item);
    const refId = nullableString(record.ref_id)?.trim();
    if (refId) return refId;
  }
  return null;
}

function vietmapDisplayText(record: Record<string, unknown>): string {
  const display = nullableString(record.display)?.trim();
  if (display) return display;
  const parts = [
    nullableString(record.name)?.trim(),
    nullableString(record.address)?.trim(),
  ].filter((part): part is string => Boolean(part));
  return parts.join(" ");
}

function buildVietmapUrl(
  baseUrl: string,
  apiKey: string,
  params: Record<string, string>,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function markJobGeocodeFallback(client: DbClient, jobId: string) {
  await updateJobGeo(client, jobId, { geo_source: "fallback" });
}

async function updateJobGeo(
  client: DbClient,
  jobId: string,
  value: Record<string, unknown>,
) {
  const update = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update(value)
      .eq("id", jobId)
      .select("id")
      .maybeSingle(),
  );
  if (update.error) {
    console.warn("mobile-api job geo update failed", {
      jobId,
      errorCode: update.error.code,
    });
  }
}

function readGoogleMapsApiKey(secrets: EdgeAiSecrets): string | null {
  if (secrets.googleMapsApiKey) return secrets.googleMapsApiKey;
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno?.env?.get;
  return denoGet?.("GOOGLE_MAPS_API_KEY") ?? denoGet?.("GOOGLE_MAP_KEY") ??
    null; // Deno.env.get("GOOGLE_MAPS_API_KEY")
}

function readVietmapApiKey(secrets: EdgeAiSecrets): string | null {
  if (secrets.vietmapApiKey) return secrets.vietmapApiKey;
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno?.env?.get;
  return denoGet?.("VIETMAP_API_KEY") ?? denoGet?.("VIETMAP_MAPS_API_KEY") ??
    null;
}

function readEdgeEnvNumber(name: string): number | null {
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno?.env?.get;
  const value = denoGet?.(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function scopeChangeRiskConfig(
  originalPriceMax: number,
  originalComplexity: ComplexityLevel | null,
): ScopeChangeRiskConfig {
  const complexityHours = { small: 1, medium: 3, large: 6 };
  const baselineComplexity = originalComplexity ?? "medium";
  const derivedHourlyRate = Math.max(
    1,
    Math.round(originalPriceMax / (complexityHours[baselineComplexity] * 1.5)),
  );
  return {
    complexityHours,
    hcmcHourlyRateVnd:
      readEdgeEnvNumber("SCOPE_CHANGE_HCMC_HOURLY_RATE_VND") ??
        derivedHourlyRate,
    baseMultiplier: readEdgeEnvNumber("SCOPE_CHANGE_BASE_MULTIPLIER") ?? 1.5,
  };
}

function estimatePriceSourceFromStageLogs(
  logs: PipelineStageLog[],
): EstimatePriceSource {
  const market = logs.find((stage) => stage.stage === "market");
  if (market?.success && !market.fallbackUsed) return "perplexity_validated";
  if (market?.success) return "baseline_with_market";
  return "baseline_only";
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAPS_PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function db(ctx: MobileApiContext): DbClient {
  return ctx.supabase as DbClient;
}

function publicRouteDb(secrets: EdgeServiceSecrets): DbClient {
  if (!secrets.supabaseUrl || !secrets.supabaseSecretKey) {
    apiFailure("CONFIG_MISSING", "Dịch vụ chưa được cấu hình", 500);
  }
  return createClient(secrets.supabaseUrl, secrets.supabaseSecretKey, {
    global: { fetch: edgeServiceTimeoutFetch },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as unknown as DbClient;
}

function edgeServiceTimeoutFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function dbQuery<T = unknown>(
  promise: QueryLike,
  ms = 10_000,
): Promise<DbResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DB timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]) as DbResult<
      T
    >;
  } catch (error) {
    return {
      data: null,
      error: {
        code: error instanceof Error && error.message.startsWith("DB timeout")
          ? "DB_TIMEOUT"
          : "DB_QUERY_FAILED",
        message: error instanceof Error ? error.name : "query failed",
      },
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function secondsRemaining(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null;
  return Math.max(
    0,
    Math.round((new Date(expiresAt).getTime() - now.getTime()) / 1000),
  );
}

function maskBankAccount(account: string | null): string | null {
  if (!account || account.length < 4) return null;
  return `****${account.slice(-4)}`;
}

function blankWorkerProfile(workerId: string) {
  return {
    id: workerId,
    verification_status: "draft" as const,
    is_available: false,
    is_approved: false,
    is_suspended: false,
    service_types: [],
    districts: [],
    home_lat: null,
    home_lng: null,
    service_radius_km: null,
    problem_specializations: [],
    years_experience: 0,
    rating: 0,
    total_jobs: 0,
    legal_name: null,
    date_of_birth: null,
    gender: null,
    bank_account_masked: null,
    bank_name: null,
    has_cccd: false,
    has_selfie: false,
  };
}

function clampServiceRadius(value: unknown): number {
  const radius = Math.round(asNumber(value) || 8);
  return Math.min(30, Math.max(1, radius));
}

function normalizeWorkerDistricts(districts: string[]): string[] | null {
  const normalized: string[] = [];
  for (const district of districts) {
    const canonical = normalizeWorkerDistrict(district);
    if (!canonical) return null;
    normalized.push(canonical);
  }
  return Array.from(new Set(normalized));
}

function normalizeWorkerDistrict(district: string): string | null {
  const canonical = normalizeDistrict(district);
  if (canonical !== "hcmc_all") return canonical;

  const trimmed = district.trim().toLowerCase();
  if (
    trimmed === "hcmc_all" ||
    trimmed === HCMC_DISTRICTS.hcmc_all.toLowerCase()
  ) {
    return canonical;
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function positiveNumberFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function toCatalogBaseline(row: Record<string, unknown>) {
  const priceMin = positiveNumberFrom(row.price_min);
  const priceMax = positiveNumberFrom(row.price_max);
  if (priceMin === null || priceMax === null || priceMax < priceMin) {
    apiFailure("DB_ERROR", "Bảng giá nền có dữ liệu không hợp lệ", 500);
  }
  const districtCode = asString(row.district_code);
  if (!isKnownDistrictCode(districtCode)) {
    apiFailure("DB_ERROR", "Bảng giá nền có khu vực không hợp lệ", 500);
  }
  return {
    complexity: asComplexity(row.complexity),
    district_code: districtCode,
    price_min: priceMin,
    price_max: priceMax,
  };
}

function uniqueCatalogBaseline<
  T extends {
    complexity: unknown;
    district_code: unknown;
    price_min: unknown;
    price_max: unknown;
  },
>(baseline: T, index: number, baselines: T[]) {
  const key = catalogBaselineKey(baseline);
  return baselines.findIndex((candidate) =>
    catalogBaselineKey(candidate) === key
  ) === index;
}

function catalogBaselineKey(baseline: {
  complexity: unknown;
  district_code: unknown;
  price_min: unknown;
  price_max: unknown;
}) {
  return `${baseline.complexity}:${baseline.district_code}:${baseline.price_min}:${baseline.price_max}`;
}

function isKnownDistrictCode(
  value: string,
): value is keyof typeof HCMC_DISTRICTS {
  return Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, value);
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nullableRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asWorkerCancellationCategory(
  value: unknown,
): WorkerCancellationExpectedCategory | null {
  return value === "legit_auto_approve" ||
      value === "legit_with_admin_review" ||
      value === "suspicious" ||
      value === "no_reason"
    ? value
    : null;
}

function asWorkerCancellationReasonCode(
  value: unknown,
): WorkerCancellationReasonCode | null {
  if (
    value === "medical_emergency_with_evidence" ||
    value === "family_emergency_confirmed" ||
    value === "vehicle_breakdown_with_photo" ||
    value === "job_more_complex_than_described" ||
    value === "unsafe_conditions_on_site" ||
    value === "customer_not_responding_at_site" ||
    value === "higher_pay_elsewhere" ||
    value === "changed_mind" ||
    value === "unable_to_find_address" ||
    value === "no_reason"
  ) {
    return value;
  }
  return null;
}

function asWorkerCancellationAbuseSignals(
  value: unknown,
): WorkerCancellationAbuseSignal[] {
  return asStringArray(value).filter((item): item is WorkerCancellationAbuseSignal =>
    item === "cancellation_rate_exceeded" ||
    item === "consecutive_cancel_threshold" ||
    item === "no_reason_cancel_threshold" ||
    item === "cancel_after_arrival_threshold"
  );
}

function asCustomerCancellationSubCase(value: unknown): CustomerCancellationSubCase {
  if (
    value === "before_a7" ||
    value === "after_a7_before_worker_accept" ||
    value === "after_worker_accept" ||
    value === "after_worker_completed_trigger_dispute" ||
    value === "scheduled_job"
  ) {
    return value;
  }
  return "after_worker_accept";
}

function asCustomerCancellationAbuseSignals(
  value: unknown,
): CustomerCancellationAbuseSignal[] {
  return asStringArray(value).filter((item): item is CustomerCancellationAbuseSignal =>
    item === "customer_cancellation_rate_exceeded" ||
    item === "cancel_after_accept_threshold" ||
    item === "same_day_cancel_threshold" ||
    item === "no_reason_cancel_threshold"
  );
}

function asDisputePriority(value: unknown): "low" | "medium" | "high" | "critical" | null {
  return value === "low" ||
      value === "medium" ||
      value === "high" ||
      value === "critical"
    ? value
    : null;
}

function asWorkerCancellationFallbackOptions(value: unknown) {
  if (!Array.isArray(value)) return buildWorkerCancellationFallbackOptions();
  const safe = value
    .filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item)
    )
    .map((item) => ({
      ...item,
      id: asString(item.id),
      label_vi: asString(item.label_vi),
      effect: asString(item.effect),
    }))
    .filter((item) =>
      item.id === "wait_15_minutes" ||
      item.id === "reschedule" ||
      item.id === "cancel_no_charge"
    );
  return safe.length > 0 ? safe : buildWorkerCancellationFallbackOptions();
}

function relatedJob(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "object" && value[0] !== null
      ? value[0] as Record<string, unknown>
      : null;
  }
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function asServiceType(value: unknown): ServiceType {
  if (value === "plumbing") return "plumbing";
  if (value === "cleaning") return "cleaning";
  return "electrical";
}

function nullableServiceType(value: unknown): ServiceType | null {
  return value === "electrical" || value === "plumbing" || value === "cleaning"
    ? value
    : null;
}

function asLearningCandidateStatus(value: unknown): LearningCandidateStatus {
  if (
    value === "created" ||
    value === "pending_evidence" ||
    value === "evidence_gate_passed" ||
    value === "manual_review" ||
    value === "auto_promoted" ||
    value === "rejected" ||
    value === "rolled_back" ||
    value === "archived"
  ) {
    return value;
  }
  return "created";
}

function asServiceTypeArray(value: unknown): ServiceType[] {
  return asStringArray(value).filter((item): item is ServiceType =>
    item === "electrical" || item === "plumbing" || item === "cleaning"
  );
}

function asMessageSender(value: unknown): MessageSender {
  if (value === "worker" || value === "kael") return value;
  return "customer";
}

function asComplexity(value: unknown): ComplexityLevel {
  if (value === "small" || value === "medium" || value === "large") {
    return value;
  }
  return "medium";
}

function asComplexityOrNull(value: unknown): ComplexityLevel | null {
  return value === "small" || value === "medium" || value === "large"
    ? value
    : null;
}

function asKaelChatStatus(value: unknown): KaelChatStatus {
  if (
    value === "active" ||
    value === "collecting_evidence" ||
    value === "estimate_ready" ||
    value === "confirmed" ||
    value === "abandoned" ||
    value === "unsupported"
  ) {
    return value;
  }
  return "active";
}

function nullableComplexity(value: unknown): ComplexityLevel | null {
  if (value === null || value === undefined) return null;
  return asComplexity(value);
}

function asJobStatus(value: unknown): JobStatus {
  if (
    value === "draft" ||
    value === "analyzing" ||
    value === "estimate_ready" ||
    value === "awaiting_customer_confirm" ||
    value === "broadcasting" ||
    value === "worker_matched" ||
    value === "worker_on_way" ||
    value === "arrived" ||
    value === "inspecting" ||
    value === "repairing" ||
    value === "scope_change_pending" ||
    value === "completed_by_worker" ||
    value === "confirmed_by_customer" ||
    value === "payment_pending" ||
    value === "paid" ||
    value === "reviewed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "draft";
}

function asPaymentStatus(value: unknown):
  | "not_started"
  | "code_requested"
  | "vietqr_ready"
  | "pending"
  | "received"
  | "amount_mismatch"
  | "expired"
  | "failed"
  | "reconciled"
  | null {
  if (
    value === "not_started" ||
    value === "code_requested" ||
    value === "vietqr_ready" ||
    value === "pending" ||
    value === "received" ||
    value === "amount_mismatch" ||
    value === "expired" ||
    value === "failed" ||
    value === "reconciled"
  ) {
    return value;
  }
  return null;
}

function asWorkerVerificationStatus(value: unknown): WorkerVerificationStatus {
  if (
    value === "draft" ||
    value === "submitted" ||
    value === "under_review" ||
    value === "approved" ||
    value === "rejected" ||
    value === "suspended"
  ) {
    return value;
  }
  return "draft";
}
