import {
  availabilityToggleSchema,
  customerCancellationRequestSchema,
  customerKaelFeedbackSchema,
  customerKaelConversationCreateSchema,
  customerKaelConversationModeSchema,
  customerKaelConversationPinSchema,
  customerKaelConversationRenameSchema,
  customerKaelConversationTurnSchema,
  customerScopeDecisionSchema,
  updateKaelMemorySchema,
  disputeAdminDecisionSchema,
  disputeCounterStatementSchema,
  disputeOpenRequestSchema,
  devicePushTokenSchema,
  devicePushTokenUnregisterSchema,
  jobMediaAttachSchema,
  edgeJobIncidentScopeProposalSchema,
  jobMessageSendSchema,
  jobCreateSchema,
  kaelWorkerClarifySchema,
  kaelAssistantSchema,
  kaelChatCreateSchema,
  kaelChatEvidenceSchema,
  kaelChatMediaRevokeSchema,
  kaelChatMediaUploadSchema,
  kaelChatTurnSchema,
  workerKaelChatCreateSchema,
  workerKaelChatModeSchema,
  workerKaelChatPinSchema,
  workerKaelChatRenameSchema,
  workerKaelChatTurnSchema,
  workerKaelFeedbackSchema,
  workerKaelTrainingConsentSchema,
  placesAutocompleteSchema,
  placesResolveSchema,
  reviewSchema,
  workerApplicationSubmitSchema,
  workerCancellationDecisionSchema,
  workerCancellationRequestSchema,
  workerRegisterSchema,
  workerAvatarUploadSchema,
  workerAvatarUpdateSchema,
  workerServiceAreaUpdateSchema,
  workerScopeChangeSchema,
  LEARNING_CANDIDATE_STATUSES,
} from "../../_shared/domain.ts";
import {
  jobMediaRevokeSchema,
  jobMediaUploadSchema,
} from "../../_shared/job-media-contract.ts";
import type {
  ComplexityLevel,
  EdgeCustomerKaelConversationMode,
  LearningCandidateStatus,
  ServiceType,
  WorkerKaelChatCreateInput,
} from "../../_shared/domain.ts";
import {
  readJsonRequestBounded,
  RequestJsonError,
} from "../../_shared/request-json.ts";
import { normalizeIsoTimestamp } from "./iso-timestamp.ts";
import { enforceKaelRuntimePathControl } from "./router-kael-path-control.ts";
import { priceSynthesisAbCaseSchema } from "./kael/market/price-synthesis-ab.ts";
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
  WorkerRouteOrigin,
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
import { ApiFailure, apiFailure } from "./router/api-failure.ts";
import {
  kaelBatchResultsProcessInput,
  kaelLearningCandidateListInput,
  kaelLearningCandidateReviewInput,
  kaelLearningMonitorInput,
  kaelLearningQueueProcessInput,
  marketCacheInvalidateInput,
} from "./router/admin-learning-parsers.ts";
import { parseIsoParam } from "./router/value-parsers.ts";
import { workerStatusUpdateSchema } from "./router/worker-status-parsers.ts";
export { apiFailure };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
const MAX_JSON_BODY_BYTES = 64 * 1024;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
};


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
      if (data instanceof Response) return withCorsHeaders(data);
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
    case "places.resolve": {
      const input = placesResolveSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.placesResolve(ctx, input.data);
    }
    case "admin.marketCache.invalidate":
      return services.invalidateMarketCache(
        ctx,
        marketCacheInvalidateInput(await readJson(request)),
      );
    case "admin.kaelAb.priceSynthesis": {
      const input = priceSynthesisAbCaseSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu A/B không hợp lệ", 400);
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
      apiFailure(
        "KAEL_CASE_WORK_REQUIRED",
        "Hãy bắt đầu qua Kael Case Work và xác nhận báo giá trước khi tạo yêu cầu.",
        409,
        { next_route: "/kael/chat" },
      );
    }
    case "kael.chat.create": {
      const input = kaelChatCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createKaelChat(ctx, input.data);
    }
    case "kael.assistant": {
      const input = kaelAssistantSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.answerKaelAssistant(ctx, input.data);
    }
    case "customer.kaelConversations.create": {
      const input = customerKaelConversationCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createCustomerKaelConversation(ctx, input.data);
    }
    case "customer.kaelConversations.list":
      return services.listCustomerKaelConversations(
        ctx,
        customerKaelConversationModeParam(new URL(request.url)),
      );
    case "customer.kaelConversations.archive":
      return services.archiveCustomerKaelConversation(
        ctx,
        route.conversationId,
        new URL(request.url).searchParams.get("confirm_case_work") === "true",
      );
    case "customer.kaelConversations.rename": {
      const input = customerKaelConversationRenameSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.renameCustomerKaelConversation(ctx, route.conversationId, input.data);
    }
    case "customer.kaelConversations.pin": {
      const input = customerKaelConversationPinSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.setCustomerKaelConversationPinned(ctx, route.conversationId, input.data);
    }
    case "customer.kaelConversations.get":
      return services.getCustomerKaelConversation(ctx, route.conversationId);
    case "customer.kaelConversations.turn": {
      const input = customerKaelConversationTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.sendCustomerKaelConversationTurn(ctx, route.conversationId, input.data);
    }
    case "kael.chat.mediaUpload": {
      const input = kaelChatMediaUploadSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createKaelChatMediaUpload(ctx, input.data);
    }
    case "kael.chat.mediaRevoke": {
      const input = kaelChatMediaRevokeSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.revokeKaelChatMedia(ctx, input.data);
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
    case "kael.chat.evidence": {
      const input = kaelChatEvidenceSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitKaelChatEvidence(ctx, route.sessionId, input.data);
    }
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
    case "jobs.workerCandidate":
      return services.getWorkerCandidate(ctx, route.jobId);
    case "jobs.workerCandidateConfirm":
      return services.confirmWorkerCandidate(ctx, route.jobId, route.candidateId);
    case "jobs.workerCandidateReject":
      return services.rejectWorkerCandidate(ctx, route.jobId, route.candidateId);
    case "me.favoriteWorkerSave":
      if (!services.saveCustomerFavoriteWorker) {
        apiFailure("NOT_IMPLEMENTED", "Chức năng lưu thợ chưa sẵn sàng", 501);
      }
      return services.saveCustomerFavoriteWorker(ctx, route.workerId);
    case "me.favoriteWorkerRemove":
      if (!services.removeCustomerFavoriteWorker) {
        apiFailure("NOT_IMPLEMENTED", "Chức năng bỏ lưu thợ chưa sẵn sàng", 501);
      }
      return services.removeCustomerFavoriteWorker(ctx, route.workerId);
    case "jobs.status": {
      const input = workerStatusUpdateSchema(await readJson(request), route.jobId);
      return services.updateJobStatus(ctx, route.jobId, input);
    }
    case "jobs.accessAuthorize":
      return services.authorizeApartmentAccess(ctx, route.jobId);
    case "jobs.scopeChange": {
      const input = workerScopeChangeSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.requestScopeChange(ctx, route.jobId, input.data);
    }
    case "jobs.kaelIncidentGet":
      return services.getJobIncident(ctx, route.jobId);
    case "jobs.kaelIncidentOpen": {
      const input = workerScopeChangeSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
      return services.openJobIncident(ctx, route.jobId, input.data);
    }
    case "jobs.kaelIncidentProposeScope": {
      const input = edgeJobIncidentScopeProposalSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
      return services.proposeScopeChangeFromJobIncident(ctx, route.jobId, input.data);
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
    case "jobs.mediaUpload": {
      const input = jobMediaUploadSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createJobMediaUpload(ctx, route.jobId, input.data);
    }
    case "jobs.mediaRevoke": {
      const input = jobMediaRevokeSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.revokeJobMediaUploads(ctx, route.jobId, input.data);
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
    case "me.jobs.history":
      return services.listCustomerServiceHistory(ctx);
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
    case "me.profileInsights":
      return services.getCustomerProfileInsights(ctx);
    case "me.threads":
      return services.listMyThreads(ctx);
    case "workers.register": {
      const input = workerRegisterSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.registerWorker(ctx, input.data);
    }
    case "workerApplications.submit": {
      const input = workerApplicationSubmitSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitWorkerApplication(ctx, input.data);
    }
    case "workers.me":
      return services.getWorkerProfile(ctx);
    case "workers.avatarUpload": {
      const input = workerAvatarUploadSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Ảnh đại diện không hợp lệ", 400);
      return services.createWorkerAvatarUpload(ctx, input.data);
    }
    case "workers.avatar": {
      const input = workerAvatarUpdateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Ảnh đại diện không hợp lệ", 400);
      return services.updateWorkerAvatar(ctx, input.data);
    }
    case "workers.activityMinute":
      return services.recordWorkerAppActiveMinute(ctx);
    case "workers.performanceInsights":
      return services.getWorkerPerformanceInsights(ctx);
    case "workers.serviceArea": {
      const input = workerServiceAreaUpdateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.updateWorkerServiceArea(ctx, input.data);
    }
    case "workers.kaelMemory":
      return services.getWorkerKaelMemory(ctx);
    case "workers.kaelChat.create": {
      const input = workerKaelChatCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createWorkerKaelChat(ctx, input.data);
    }
    case "workers.kaelChat.list":
      return services.listWorkerKaelChats(
        ctx,
        workerKaelChatModeParam(new URL(request.url)),
      );
    case "workers.kaelChat.archive":
      return services.archiveWorkerKaelChat(ctx, route.sessionId);
    case "workers.kaelChat.pin": {
      const input = workerKaelChatPinSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.setWorkerKaelChatPinned(ctx, route.sessionId, input.data);
    }
    case "workers.kaelChat.rename": {
      const input = workerKaelChatRenameSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.renameWorkerKaelChat(ctx, route.sessionId, input.data);
    }
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
    case "workers.routePreview":
      return services.getWorkerRoutePreview(
        ctx,
        route.jobId,
        requiredWorkerRouteOrigin(new URL(request.url)),
      );
    case "workers.routeMap":
      return services.getWorkerRouteMap(
        ctx,
        route.jobId,
        optionalWorkerRouteOrigin(new URL(request.url)),
      );
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
    case "notifications.deviceToken.unregister": {
      const input = devicePushTokenUnregisterSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.unregisterDevicePushToken(ctx, input.data);
    }
    case "notifications.read":
      return services.markNotificationRead(ctx, route.notificationId);
  }
}

function withCorsHeaders(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function requiredWorkerRouteOrigin(url: URL): WorkerRouteOrigin {
  const origin = optionalWorkerRouteOrigin(url);
  if (!origin) apiFailure("VALIDATION", "Cần vị trí hiện tại để tính lộ trình", 400);
  return origin;
}

function optionalWorkerRouteOrigin(url: URL): WorkerRouteOrigin | null {
  const rawLatitude = url.searchParams.get("origin_lat");
  const rawLongitude = url.searchParams.get("origin_lng");
  if (rawLatitude === null && rawLongitude === null) return null;
  if (rawLatitude === null || rawLongitude === null) {
    apiFailure("VALIDATION", "Vị trí hiện tại không hợp lệ", 400);
  }
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 10.4 || latitude > 11.2 || longitude < 106.4 || longitude > 107.1) {
    apiFailure("VALIDATION", "Vị trí hiện tại không hợp lệ", 400);
  }
  return { latitude, longitude };
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
  try {
    return await readJsonRequestBounded(request, MAX_JSON_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestJsonError) {
      if (error.code === "PAYLOAD_TOO_LARGE") {
        apiFailure("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn", 413);
      }
      if (error.code === "UNSUPPORTED_MEDIA_TYPE") {
        apiFailure(
          "UNSUPPORTED_MEDIA_TYPE",
          "Yêu cầu phải dùng dữ liệu JSON",
          415,
        );
      }
    }
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
}

function workerKaelChatModeParam(url: URL): WorkerKaelChatCreateInput["mode"] {
  const parsed = workerKaelChatModeSchema.safeParse(
    url.searchParams.get("mode") ?? undefined,
  );
  if (!parsed.success) {
    apiFailure("VALIDATION", "Chế độ trò chuyện Kael không hợp lệ", 400);
  }
  return parsed.data;
}

function customerKaelConversationModeParam(url: URL): EdgeCustomerKaelConversationMode {
  const parsed = customerKaelConversationModeSchema.safeParse(
    url.searchParams.get("mode") ?? undefined,
  );
  if (!parsed.success) {
    apiFailure("VALIDATION", "Chế độ trò chuyện Kael không hợp lệ", 400);
  }
  return parsed.data;
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