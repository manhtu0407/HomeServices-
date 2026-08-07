import { enforceKaelRuntimePathControl } from "./router-kael-path-control.ts";
import { createActorContext } from "./platform/authz/actor-context.ts";
import {
  beginHarnessRun,
  bindHarnessTraceActor,
  createHarnessTraceContext,
  finishHarnessRun,
  harnessTraceHeaders,
  recordHarnessEvent,
  recordHarnessPrivilegedOperation,
  type HarnessTraceContext,
} from "../../_shared/harness/trace.ts";
import {
  CapabilityAuthorizationError,
  authorizeRouteCapability,
} from "./platform/authz/capability-policy.ts";
import {
  completeHarnessIdempotency,
  failHarnessIdempotency,
  markHarnessIdempotencyReconcileRequired,
  reliabilityPolicyForOperation,
  reserveHarnessIdempotency,
  startHarnessIdempotencyExecution,
  validateIdempotencyKey,
  type ReliabilityClient,
} from "../../_shared/harness/reliability.ts";
import { apiFailure, ApiFailure } from "./platform/api-failure.ts";
import { dispatchRoute } from "./http/dispatch/index.ts";
import {
  isPublicRoute,
  matchRoute,
  type PublicRoute,
} from "./http/routes/index.ts";
import type {
  MobileApiContext,
  MobileApiHandlerDeps,
  MobileApiServices,
} from "./http/contracts.ts";
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
} from "./http/contracts.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
};

export { apiFailure };

export function createMobileApiHandler(deps: MobileApiHandlerDeps) {
  return async function handleMobileApi(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    let trace = await requestTraceContext(request, deps);
    let ctx: MobileApiContext | null = null;
    let idempotencyReservationId: string | null = null;
    let idempotencyClient: ReliabilityClient | null = null;
    let idempotencyExecutionStarted = false;

    try {
      const route = matchRoute(request);
      if (!route) {
        await recordHarnessEvent(trace, {
          eventClass: "routing.not_found",
          stage: "routing",
          status: "blocked",
          safeMetadata: { method: request.method },
        });
        return withHarnessHeaders(
          jsonError("NOT_FOUND", "Không tìm thấy endpoint", 404),
          trace,
        );
      }

      if (isPublicRoute(route)) {
        const data = await dispatchPublicRoute(route, request, deps.services);
        await recordHarnessEvent(trace, {
          eventClass: "request.public_completed",
          stage: route.kind,
          status: "succeeded",
          latencyMs: Date.now() - trace.startedAtMs,
        });
        return withHarnessHeaders(json(data, 200), trace);
      }

      const auth = await deps.authenticate(request, route.roles);
      if (!auth.success) {
        await recordHarnessEvent(trace, {
          eventClass: "authentication.denied",
          stage: "authentication",
          status: "blocked",
          errorCode: auth.status === 401 ? "AUTH_MISSING" : "AUTH_FORBIDDEN",
          safeMetadata: { status: auth.status, route_kind: route.kind },
        });
        return withHarnessHeaders(jsonError(
          auth.status === 401 ? "AUTH_MISSING" : "AUTH_FORBIDDEN",
          auth.error,
          auth.status,
        ), trace);
      }

      const requestContext = requestRuntimeContext(request);
      const actorContext = createActorContext({
        userId: auth.user.id,
        role: auth.role,
        accountState: auth.accountState,
        authenticatedAt: auth.authenticatedAt,
        environment: auth.environment ?? deps.environment ?? "unknown",
        releaseId: auth.releaseId ?? deps.releaseId ?? "unreleased",
      });
      let capabilityEnvelope;
      try {
        capabilityEnvelope = authorizeRouteCapability(actorContext, route);
      } catch (error) {
        if (error instanceof CapabilityAuthorizationError) {
          apiFailure(error.code, "Bạn không có quyền thực hiện hành động này", 403);
        }
        throw error;
      }
      const privilegedSupabase = auth.privilegedSupabase ?? auth.supabase;
      trace = await bindHarnessTraceActor(trace, {
        actorId: actorContext.actorId,
        jobId: capabilityEnvelope.resource.type === "job"
          ? capabilityEnvelope.resource.id
          : null,
        client: privilegedSupabase as Parameters<typeof createHarnessTraceContext>[0]["client"],
      });
      const effectiveSupabase = capabilityEnvelope.privileged
        ? privilegedSupabase
        : auth.userSupabase ?? auth.supabase;
      ctx = {
        ...auth,
        ...requestContext,
        supabase: effectiveSupabase,
        privilegedSupabase,
        actorContext,
        capabilityEnvelope,
        traceId: trace.traceId,
        runId: trace.runId,
        traceContext: trace,
        releaseId: actorContext.releaseId,
        environment: actorContext.environment,
      };

      const runPersisted = await beginHarnessRun(trace, {
        actorRole: actorContext.role,
        routeKind: route.kind,
        capability: capabilityEnvelope.capability,
        safeMetadata: {
          risk: capabilityEnvelope.risk,
          operation_class: capabilityEnvelope.operationClass,
          privileged: capabilityEnvelope.privileged,
          confirmation_gate: capabilityEnvelope.confirmationGate,
        },
      });
      await recordHarnessEvent(trace, {
        eventClass: "authorization.resolved",
        stage: "authorization",
        status: "succeeded",
        safeMetadata: {
          capability: capabilityEnvelope.capability,
          run_persisted: runPersisted,
        },
      });

      const operationPolicy = reliabilityPolicyForOperation(
        capabilityEnvelope.operationClass,
      );
      if (actorContext.environment !== "local" && operationPolicy.idempotency) {
        const idempotencyKey = validateIdempotencyKey(
          request.headers.get("idempotency-key"),
        );
        if (!idempotencyKey) {
          apiFailure(
            "IDEMPOTENCY_KEY_REQUIRED",
            "Yêu cầu này cần mã chống trùng lặp hợp lệ.",
            400,
          );
        }
        idempotencyClient = privilegedSupabase as ReliabilityClient;
        const requestBody = await request.clone().text();
        const reservation = await reserveHarnessIdempotency(
          idempotencyClient,
          {
            environment: actorContext.environment,
            releaseId: actorContext.releaseId,
            operationId: route.kind,
            actorId: actorContext.actorId,
            idempotencyKey,
            requestFingerprint: `${request.method}:${new URL(request.url).pathname}:${requestBody}`,
          },
        );
        if (reservation.state === "conflict") {
          apiFailure(
            "IDEMPOTENCY_CONFLICT",
            "Mã chống trùng lặp đã được dùng cho yêu cầu khác.",
            409,
          );
        }
        if (reservation.state === "in_progress") {
          apiFailure(
            "IDEMPOTENCY_IN_PROGRESS",
            "Yêu cầu đang được xử lý.",
            409,
          );
        }
        if (reservation.state === "completed") {
          apiFailure(
            "IDEMPOTENCY_REPLAY",
            "Yêu cầu đã được xử lý. Vui lòng làm mới dữ liệu.",
            409,
            { response_hash: reservation.responseHash },
          );
        }
        if (reservation.state === "reconcile_required") {
          apiFailure(
            "IDEMPOTENCY_RECONCILE_REQUIRED",
            "Kết quả trước đó cần được đối soát trước khi thử lại.",
            409,
          );
        }
        if (reservation.state === "unavailable") {
          apiFailure(
            "IDEMPOTENCY_UNAVAILABLE",
            "Hệ thống đang bận, vui lòng thử lại.",
            503,
          );
        }
        idempotencyReservationId = reservation.reservationId;
        await recordHarnessEvent(trace, {
          eventClass: "idempotency.reserved",
          stage: route.kind,
          status: "succeeded",
          safeMetadata: { reservation_id: idempotencyReservationId },
        });
      }

      if (capabilityEnvelope.privileged) {
        const audited = await recordHarnessPrivilegedOperation(trace, {
          actorRole: actorContext.role,
          operationId: route.kind,
          capability: capabilityEnvelope.capability,
          reason: "mobile_api_route_dispatch",
          resourceType: capabilityEnvelope.resource.type,
          resourceId: capabilityEnvelope.resource.id,
          result: "allowed",
          safeMetadata: { confirmation_gate: capabilityEnvelope.confirmationGate },
        });
        if (!audited) {
          apiFailure(
            "PRIVILEGED_AUDIT_UNAVAILABLE",
            "Hệ thống đang bận, vui lòng thử lại",
            503,
          );
        }
      }

      await recordHarnessEvent(trace, {
        eventClass: "request.started",
        stage: route.kind,
        status: "started",
        safeMetadata: { method: request.method },
      });
      enforceKaelRuntimePathControl(route, ctx.role, apiFailure);
      if (idempotencyReservationId) {
        const started = await startHarnessIdempotencyExecution(
          idempotencyClient,
          idempotencyReservationId,
        );
        if (!started) {
          apiFailure(
            "IDEMPOTENCY_EXECUTION_START_FAILED",
            "Không thể khóa yêu cầu an toàn. Vui lòng thử lại sau.",
            503,
          );
        }
        idempotencyExecutionStarted = true;
        await recordHarnessEvent(trace, {
          eventClass: "idempotency.executing",
          stage: route.kind,
          status: "started",
          safeMetadata: { reservation_id: idempotencyReservationId },
        });
      }
      const data = await dispatchRoute(route, request, ctx, deps.services);
      await recordHarnessEvent(trace, {
        eventClass: "request.completed",
        stage: route.kind,
        status: "succeeded",
        latencyMs: Date.now() - trace.startedAtMs,
      });
      if (capabilityEnvelope.privileged) {
        await recordHarnessPrivilegedOperation(trace, {
          actorRole: actorContext.role,
          operationId: route.kind,
          capability: capabilityEnvelope.capability,
          reason: "mobile_api_route_dispatch",
          resourceType: capabilityEnvelope.resource.type,
          resourceId: capabilityEnvelope.resource.id,
          result: "succeeded",
        });
      }
      const response = data instanceof Response
        ? withCorsHeaders(data)
        : json(
          data,
          ("successStatus" in route ? route.successStatus : undefined) ?? 200,
        );
      if (idempotencyReservationId) {
        const responseClone = response.clone();
        const responseBody = await responseClone.text();
        const completed = await completeHarnessIdempotency(
          idempotencyClient,
          idempotencyReservationId,
          `${response.status}:${responseBody}`,
        );
        if (!completed) {
          await markHarnessIdempotencyReconcileRequired(
            idempotencyClient,
            idempotencyReservationId,
            "RESPONSE_RECEIPT_COMMIT_FAILED",
          );
          apiFailure(
            "IDEMPOTENCY_COMMIT_FAILED",
            "Không thể xác nhận kết quả an toàn. Vui lòng làm mới dữ liệu.",
            503,
          );
        }
      }
      await finishHarnessRun(trace, { status: "completed" });
      return withHarnessHeaders(response, trace);
    } catch (err) {
      if (ctx) {
        const errorCode = err instanceof ApiFailure ? err.code : "UNHANDLED";
        if (idempotencyReservationId) {
          if (idempotencyExecutionStarted) {
            await markHarnessIdempotencyReconcileRequired(
              idempotencyClient,
              idempotencyReservationId,
              errorCode,
            );
          } else {
            await failHarnessIdempotency(
              idempotencyClient,
              idempotencyReservationId,
              errorCode,
            );
          }
        }
        await recordHarnessEvent(trace, {
          eventClass: err instanceof ApiFailure ? "request.blocked" : "request.failed",
          stage: ctx.capabilityEnvelope?.routeKind ?? "unknown",
          status: err instanceof ApiFailure && err.status < 500 ? "blocked" : "failed",
          latencyMs: Date.now() - trace.startedAtMs,
          errorCode,
          safeMetadata: { status: err instanceof ApiFailure ? err.status : 500 },
        });
        if (ctx.capabilityEnvelope?.privileged) {
          await recordHarnessPrivilegedOperation(trace, {
            actorRole: ctx.role,
            operationId: ctx.capabilityEnvelope.routeKind,
            capability: ctx.capabilityEnvelope.capability,
            reason: "mobile_api_route_dispatch",
            resourceType: ctx.capabilityEnvelope.resource.type,
            resourceId: ctx.capabilityEnvelope.resource.id,
            result: err instanceof ApiFailure && err.status < 500 ? "denied" : "failed",
            errorCode,
          });
        }
        await finishHarnessRun(trace, {
          status: "failed",
          errorCode,
        });
      }
      if (err instanceof ApiFailure) {
        return withHarnessHeaders(
          jsonError(err.code, err.message, err.status, err.extra),
          trace,
        );
      }

      console.error("mobile-api unhandled error", {
        code: "UNHANDLED",
        errorName: err instanceof Error ? err.name : typeof err,
        releaseId: deps.releaseId ?? "unreleased",
        traceId: trace.traceId,
      });
      return withHarnessHeaders(jsonError(
        "INTERNAL_ERROR",
        "Hệ thống đang bận, vui lòng thử lại",
        500,
      ), trace);
    }
  };
}

async function requestTraceContext(
  request: Request,
  deps: MobileApiHandlerDeps,
): Promise<HarnessTraceContext> {
  return createHarnessTraceContext({
    request,
    releaseId: deps.releaseId ?? "unreleased",
    environment: deps.environment ?? "local",
  });
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

function withHarnessHeaders(
  response: Response,
  trace: HarnessTraceContext,
): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of harnessTraceHeaders(trace).entries()) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
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

async function dispatchPublicRoute(
  route: PublicRoute,
  _request: Request,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "kael.charter":
      return services.getKaelCharter();
    case "harness.health":
      return services.getHarnessHealth();
  }
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
