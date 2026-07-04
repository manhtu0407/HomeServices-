import {
  availabilityToggleSchema,
  customerCancellationRequestSchema,
  customerKaelFeedbackSchema,
  customerScopeDecisionSchema,
  updateKaelMemorySchema,
  disputeAdminDecisionSchema,
  disputeCounterStatementSchema,
  disputeOpenRequestSchema,
  devicePushTokenSchema,
  jobMediaAttachSchema,
  jobMessageSendSchema,
  jobCreateSchema,
  kaelWorkerClarifySchema,
  kaelChatCreateSchema,
  kaelChatTurnSchema,
  workerKaelChatCreateSchema,
  workerKaelChatTurnSchema,
  workerKaelFeedbackSchema,
  workerKaelTrainingConsentSchema,
  placesAutocompleteSchema,
  reviewSchema,
  workerCancellationDecisionSchema,
  workerCancellationRequestSchema,
  workerRegisterSchema,
  workerScopeChangeSchema,
  LEARNING_CANDIDATE_STATUSES,
} from "../../_shared/domain.ts";
import type {
  ComplexityLevel,
  LearningCandidateStatus,
  ServiceType,
} from "../../_shared/domain.ts";
import { enforceKaelRuntimePathControl } from "./router-kael-path-control.ts";
import { priceSynthesisAbCaseSchema } from "./kael/price-synthesis-ab.ts";
import {
  isPublicRoute,
  matchRoute,
  type PublicRoute,
  type Route,
} from "./router/routes.ts";
import type {
  KaelBatchResultsProcessInput,
  KaelLearningCandidateListInput,
  KaelLearningCandidateReviewInput,
  KaelLearningMonitorInput,
  KaelLearningQueueProcessInput,
  MarketCacheInvalidateInput,
  MobileApiContext,
  MobileApiHandlerDeps,
  MobileApiServices,
  WorkerStatusUpdate,
  WorkerStatusUpdateInput,
} from "./router/contracts.ts";
export type {
  KaelBatchResultsProcessInput,
  KaelBatchResultsProcessResponse,
  KaelLearningCandidateApproveResponse,
  KaelLearningCandidateListInput,
  KaelLearningCandidateListResponse,
  KaelLearningCandidateReviewInput,
  KaelLearningCandidateRejectResponse,
  KaelLearningCandidateSummary,
  KaelLearningMonitorInput,
  KaelLearningMonitorResponse,
  KaelLearningQueueProcessInput,
  KaelLearningQueueProcessResponse,
  KaelMemoryDeleteResponse,
  KaelMemorySelfViewResponse,
  MarketCacheInvalidateInput,
  MarketCacheInvalidateResponse,
  MobileApiAuthResult,
  MobileApiContext,
  MobileApiHandlerDeps,
  MobileApiServices,
  PendingDecisionItem,
  PendingDecisionsResponse,
  PlacesAutocompleteResponse,
  ThreadSummary,
  ThreadsResponse,
  WorkerStatusUpdateInput,
} from "./router/contracts.ts";

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
      enforceKaelRuntimePathControl(route, ctx.role, apiFailure);
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
    case "me.kaelMemory.update": {
      const input = updateKaelMemorySchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.updateMyKaelMemory(ctx, input.data);
    }
    case "me.pendingDecisions":
      return services.listMyPendingDecisions(ctx);
    case "me.threads":
      return services.listMyThreads(ctx);
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
