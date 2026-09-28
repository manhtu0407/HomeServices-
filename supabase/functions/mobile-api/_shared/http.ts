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
import { delegateDomainIdempotency } from "./http/domain-idempotency.ts";
import {
  withHarnessStreamLifecycle,
  type HarnessEventStreamTerminal,
} from "./http/harness-stream.ts";
import {
  isPublicRoute,
  matchRoute,
  type PublicRoute,
  type Route,
} from "./http/routes/index.ts";
import type {
  MobileApiAuthResult,
  MobileApiContext,
  MobileApiHandlerDeps,
  MobileApiServices,
} from "./http/contracts.ts";
import {
  enforceClientCompatibility,
  requestRuntimeContext,
} from "./http/request-runtime.ts";
import {
  beginBatchedAuthorizedRequest,
  finishBatchedAuthorizedRequest,
} from "./http/authorized-request-lifecycle.ts";
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
    "authorization, x-client-info, x-client-platform, x-client-application-id, x-client-build-number, x-client-contract-epoch, x-client-eas-build-id, x-client-runtime-version, x-client-git-sha, x-client-release-id, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
};
const MAX_IDEMPOTENCY_BODY_BYTES = 64 * 1024;

export { apiFailure };

type AuthenticatedRoute = Exclude<Route, PublicRoute>;
type SuccessfulAuth = Extract<MobileApiAuthResult, { success: true }>;

type MobileApiRequestState = {
  readonly request: Request;
  readonly deps: MobileApiHandlerDeps;
  readonly route: AuthenticatedRoute;
  readonly ctx: MobileApiContext;
  trace: HarnessTraceContext;
  idempotencyReservationId: string | null;
  idempotencyClient: ReliabilityClient | null;
  idempotencyExecutionStarted: boolean;
  batchedLifecycle: boolean;
};

export function createMobileApiHandler(deps: MobileApiHandlerDeps) {
  return (request: Request): Promise<Response> => handleMobileApi(request, deps);
}

async function handleMobileApi(
  request: Request,
  deps: MobileApiHandlerDeps,
): Promise<Response> {
  const trace = await requestTraceContext(request, deps);
  if (request.method === "OPTIONS") {
    return withHarnessHeaders(
      new Response(null, { status: 204, headers: CORS_HEADERS }),
      trace,
    );
  }

  try {
    const route = matchRoute(request);
    if (!route) return handleNotFound(request, trace);
    if (isPublicRoute(route)) return handlePublicRoute(route, request, deps.services, trace);
    enforceClientCompatibility(request, deps);
    return handleAuthenticatedRequest(
      request,
      deps,
      trace,
      route as AuthenticatedRoute,
    );
  } catch (error) {
    return handleRequestError(error, null, trace, deps);
  }
}

async function handleAuthenticatedRequest(
  request: Request,
  deps: MobileApiHandlerDeps,
  trace: HarnessTraceContext,
  route: AuthenticatedRoute,
): Promise<Response> {
  let state: MobileApiRequestState | null = null;
  try {
    const auth = await deps.authenticate(request, route.roles);
    if (!auth.success) return authenticationDenied(auth, route, trace);
    state = await createRequestState(request, deps, trace, route, auth);
    await persistAuthorization(state);
    await reserveRequestIdempotency(state);
    await auditPrivilegedAuthorization(state);
    return await dispatchAuthorizedRequest(state);
  } catch (error) {
    return handleRequestError(error, state, trace, deps);
  }
}

async function createRequestState(
  request: Request,
  deps: MobileApiHandlerDeps,
  trace: HarnessTraceContext,
  route: AuthenticatedRoute,
  auth: SuccessfulAuth,
): Promise<MobileApiRequestState> {
  const actorContext = createActorContext({
    userId: auth.user.id,
    role: auth.role,
    accountState: auth.accountState,
    authenticatedAt: auth.authenticatedAt,
    environment: auth.environment ?? deps.environment ?? "local",
    releaseId: auth.releaseId ?? deps.releaseId ?? "unreleased",
  });
  let capabilityEnvelope;
  try {
    capabilityEnvelope = authorizeRouteCapability(actorContext, route);
  } catch (error) {
    if (error instanceof CapabilityAuthorizationError) {
      apiFailure(
        error.code,
        "Bạn không có quyền thực hiện hành động này",
        403,
      );
    }
    throw error;
  }
  const privilegedSupabase = auth.privilegedSupabase ?? auth.supabase;
  const userSupabase = auth.userSupabase;
  if (!capabilityEnvelope.privileged && !userSupabase) {
    apiFailure(
      "USER_SCOPED_CLIENT_UNAVAILABLE",
      "Không thể xác thực dữ liệu người dùng an toàn. Vui lòng thử lại sau.",
      503,
    );
  }
  const boundTrace = await bindHarnessTraceActor(trace, {
    actorId: actorContext.actorId,
    jobId: capabilityEnvelope.resource.type === "job"
      ? capabilityEnvelope.resource.id
      : null,
    client: privilegedSupabase as Parameters<typeof createHarnessTraceContext>[0]["client"],
  });
  const ctx: MobileApiContext = {
    ...auth,
    ...requestRuntimeContext(request),
    supabase: capabilityEnvelope.privileged
      ? privilegedSupabase
      : userSupabase,
    privilegedSupabase,
    actorContext,
    capabilityEnvelope,
    traceId: boundTrace.traceId,
    runId: boundTrace.runId,
    traceContext: boundTrace,
    releaseId: actorContext.releaseId,
    environment: actorContext.environment,
    requestLifecycle: { finalizedByDomain: false },
    signal: request.signal,
  };
  return {
    request,
    deps,
    route,
    ctx,
    trace: boundTrace,
    idempotencyReservationId: null,
    idempotencyClient: null,
    idempotencyExecutionStarted: false,
    batchedLifecycle: false,
  };
}

async function persistAuthorization(state: MobileApiRequestState): Promise<void> {
  const { ctx, route, trace } = state;
  const envelope = ctx.capabilityEnvelope;
  if (!envelope) return;
  if (await beginBatchedAuthorizedRequest(trace, ctx, route.kind)) {
    state.batchedLifecycle = true;
    return;
  }
  const runPersisted = await beginHarnessRun(trace, {
    actorRole: ctx.role,
    routeKind: route.kind,
    capability: envelope.capability,
    safeMetadata: {
      risk: envelope.risk,
      operation_class: envelope.operationClass,
      privileged: envelope.privileged,
      confirmation_gate: envelope.confirmationGate,
    },
  });
  await recordHarnessEvent(trace, {
    eventClass: "authorization.resolved",
    stage: "authorization",
    status: "succeeded",
    safeMetadata: { capability: envelope.capability, run_persisted: runPersisted },
  });
}

async function reserveRequestIdempotency(state: MobileApiRequestState): Promise<void> {
  const { ctx, route, request, trace } = state;
  const envelope = ctx.capabilityEnvelope;
  if (!envelope || ctx.environment === "local") return;
  if (isEventStreamRoute(route.kind)) return;
  if (!reliabilityPolicyForOperation(envelope.operationClass).idempotency) return;
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
  if (await delegateDomainIdempotency(route.kind, trace)) return;
  state.idempotencyClient = ctx.privilegedSupabase as ReliabilityClient;
  const reservation = await reserveHarnessIdempotency(state.idempotencyClient, {
    environment: ctx.environment ?? "local",
    releaseId: ctx.releaseId ?? "unreleased",
    operationId: route.kind,
    actorId: ctx.actorContext?.actorId ?? ctx.user.id,
    idempotencyKey,
    requestFingerprint: await requestFingerprintForIdempotency(request),
  });
  assertIdempotencyReservation(reservation);
  state.idempotencyReservationId = reservation.reservationId;
  await recordHarnessEvent(trace, {
    eventClass: "idempotency.reserved",
    stage: route.kind,
    status: "succeeded",
    safeMetadata: { reservation_id: state.idempotencyReservationId },
  });
}

function isEventStreamRoute(routeKind: string): boolean {
  return routeKind.endsWith(".stream") || routeKind.endsWith("Stream");
}

async function requestFingerprintForIdempotency(
  request: Request,
): Promise<Uint8Array> {
  let body: Uint8Array;
  try {
    body = await readIdempotencyRequestBody(request.clone());
  } catch (error) {
    if (error instanceof IdempotencyBodyTooLargeError) {
      apiFailure("PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên quá lớn", 413);
    }
    throw error;
  }
  const prefix = new TextEncoder().encode(
    request.method + ":" + new URL(request.url).pathname + ":",
  );
  const fingerprint = new Uint8Array(prefix.byteLength + body.byteLength);
  fingerprint.set(prefix);
  fingerprint.set(body, prefix.byteLength);
  return fingerprint;
}

async function readIdempotencyRequestBody(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && /^[0-9]+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > MAX_IDEMPOTENCY_BODY_BYTES) {
      void request.body?.cancel().catch(() => undefined);
      throw new IdempotencyBodyTooLargeError();
    }
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_IDEMPOTENCY_BODY_BYTES) {
        throw new IdempotencyBodyTooLargeError();
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

class IdempotencyBodyTooLargeError extends Error {}

function assertIdempotencyReservation(
  reservation: Awaited<ReturnType<typeof reserveHarnessIdempotency>>,
): asserts reservation is Extract<
  Awaited<ReturnType<typeof reserveHarnessIdempotency>>,
  { state: "reserved" }
> {
  if (reservation.state === "conflict") {
    apiFailure(
      "IDEMPOTENCY_CONFLICT",
      "Mã chống trùng lặp đã được dùng cho yêu cầu khác.",
      409,
    );
  }
  if (reservation.state === "in_progress") {
    apiFailure("IDEMPOTENCY_IN_PROGRESS", "Yêu cầu đang được xử lý.", 409);
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
    apiFailure("IDEMPOTENCY_UNAVAILABLE", "Hệ thống đang bận, vui lòng thử lại.", 503);
  }
}

async function auditPrivilegedAuthorization(state: MobileApiRequestState): Promise<void> {
  if (state.batchedLifecycle) return;
  const { ctx, route, trace } = state;
  const envelope = ctx.capabilityEnvelope;
  if (!envelope?.privileged) return;
  const audited = await recordHarnessPrivilegedOperation(trace, {
    actorRole: ctx.role,
    operationId: route.kind,
    capability: envelope.capability,
    reason: "mobile_api_route_dispatch",
    resourceType: envelope.resource.type,
    resourceId: envelope.resource.id,
    result: "allowed",
    safeMetadata: { confirmation_gate: envelope.confirmationGate },
  });
  if (!audited) {
    apiFailure("PRIVILEGED_AUDIT_UNAVAILABLE", "Hệ thống đang bận, vui lòng thử lại", 503);
  }
}

async function dispatchAuthorizedRequest(state: MobileApiRequestState): Promise<Response> {
  await startAuthorizedRequest(state);
  const data = await dispatchRoute(
    state.route,
    state.request,
    state.ctx,
    state.deps.services,
  );
  if (data instanceof Response && isEventStreamRoute(state.route.kind)) {
    const response = withCorsHeaders(data);
    await recordHarnessEvent(state.trace, {
      eventClass: "request.stream_opened",
      stage: state.route.kind,
      status: "started",
      latencyMs: Date.now() - state.trace.startedAtMs,
      safeMetadata: { transport: "sse" },
    });
    if (!response.body) {
      await finalizeAuthorizedEventStream(state, {
        errorCode: "STREAM_BODY_MISSING",
        eventClass: "request.stream_failed",
        status: "failed",
      });
      return withHarnessHeaders(response, state.trace);
    }
    return withHarnessHeaders(withHarnessStreamLifecycle(
      response,
      (input) => finalizeAuthorizedEventStream(state, input),
    ), state.trace);
  }
  if (state.batchedLifecycle) {
    if (!state.ctx.requestLifecycle?.finalizedByDomain) {
      await finishBatchedAuthorizedRequest(state.trace, state.ctx, state.route.kind);
    }
    const response = data instanceof Response
      ? withCorsHeaders(data)
      : json(
        data,
        ("successStatus" in state.route ? state.route.successStatus : undefined) ?? 200,
      );
    return withHarnessHeaders(response, state.trace);
  }
  await recordHarnessEvent(state.trace, {
    eventClass: "request.completed",
    stage: state.route.kind,
    status: "succeeded",
    latencyMs: Date.now() - state.trace.startedAtMs,
  });
  await auditPrivilegedCompletion(state);
  const response = data instanceof Response
    ? withCorsHeaders(data)
    : json(
      data,
      ("successStatus" in state.route ? state.route.successStatus : undefined) ?? 200,
    );
  await completeRequestIdempotency(state, response);
  await finishHarnessRun(state.trace, { status: "completed" });
  return withHarnessHeaders(response, state.trace);
}

async function startAuthorizedRequest(state: MobileApiRequestState): Promise<void> {
  if (!state.batchedLifecycle) {
    await recordHarnessEvent(state.trace, {
      eventClass: "request.started",
      stage: state.route.kind,
      status: "started",
      safeMetadata: { method: state.request.method },
    });
  }
  enforceKaelRuntimePathControl(state.route, state.ctx.role, apiFailure);
  if (!state.idempotencyReservationId) return;
  const started = await startHarnessIdempotencyExecution(
    state.idempotencyClient,
    state.idempotencyReservationId,
  );
  if (!started) {
    apiFailure(
      "IDEMPOTENCY_EXECUTION_START_FAILED",
      "Không thể khóa yêu cầu an toàn. Vui lòng thử lại sau.",
      503,
    );
  }
  state.idempotencyExecutionStarted = true;
  await recordHarnessEvent(state.trace, {
    eventClass: "idempotency.executing",
    stage: state.route.kind,
    status: "started",
    safeMetadata: { reservation_id: state.idempotencyReservationId },
  });
}

async function auditPrivilegedCompletion(state: MobileApiRequestState): Promise<void> {
  const envelope = state.ctx.capabilityEnvelope;
  if (!envelope?.privileged) return;
  await recordHarnessPrivilegedOperation(state.trace, {
    actorRole: state.ctx.role,
    operationId: state.route.kind,
    capability: envelope.capability,
    reason: "mobile_api_route_dispatch",
    resourceType: envelope.resource.type,
    resourceId: envelope.resource.id,
    result: "succeeded",
  });
}

async function finalizeAuthorizedEventStream(
  state: MobileApiRequestState,
  input: HarnessEventStreamTerminal,
): Promise<void> {
  await recordHarnessEvent(state.trace, {
    eventClass: input.eventClass,
    stage: state.route.kind,
    status: input.status === "completed" ? "succeeded" : input.status,
    latencyMs: Date.now() - state.trace.startedAtMs,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  });
  if (input.status === "completed") {
    await auditPrivilegedCompletion(state);
  } else if (input.status === "failed") {
    await auditPrivilegedStreamFailure(state, input.errorCode ?? "STREAM_FAILED");
  }
  await finishHarnessRun(state.trace, {
    status: input.status,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  });
}

async function auditPrivilegedStreamFailure(
  state: MobileApiRequestState,
  errorCode: string,
): Promise<void> {
  const envelope = state.ctx.capabilityEnvelope;
  if (!envelope?.privileged) return;
  await recordHarnessPrivilegedOperation(state.trace, {
    actorRole: state.ctx.role,
    operationId: state.route.kind,
    capability: envelope.capability,
    reason: "mobile_api_event_stream",
    resourceType: envelope.resource.type,
    resourceId: envelope.resource.id,
    result: "failed",
    errorCode,
  });
}

async function completeRequestIdempotency(
  state: MobileApiRequestState,
  response: Response,
): Promise<void> {
  if (!state.idempotencyReservationId) return;
  const completed = await completeHarnessIdempotency(
    state.idempotencyClient,
    state.idempotencyReservationId,
    responseFingerprintForIdempotency(state.route.kind, response),
  );
  if (completed) return;
  await markHarnessIdempotencyReconcileRequired(
    state.idempotencyClient,
    state.idempotencyReservationId,
    "RESPONSE_RECEIPT_COMMIT_FAILED",
  );
  apiFailure(
    "IDEMPOTENCY_COMMIT_FAILED",
    "Không thể xác nhận kết quả an toàn. Vui lòng làm mới dữ liệu.",
    503,
  );
}

function responseFingerprintForIdempotency(
  routeKind: string,
  response: Response,
): string {
  return routeKind + ":" + response.status + ":" +
    (response.headers.get("content-type") ?? "");
}

async function handleRequestError(
  error: unknown,
  state: MobileApiRequestState | null,
  trace: HarnessTraceContext,
  deps: MobileApiHandlerDeps,
): Promise<Response> {
  const activeTrace = state?.trace ?? trace;
  if (state) await recordFailedRequest(state, error);
  if (error instanceof ApiFailure) {
    return withHarnessHeaders(
      jsonError(error.code, error.message, error.status, error.extra),
      activeTrace,
    );
  }
  console.error("mobile-api unhandled error", {
    code: "UNHANDLED",
    errorName: error instanceof Error ? error.name : typeof error,
    releaseId: deps.releaseId ?? "unreleased",
    traceId: activeTrace.traceId,
  });
  return withHarnessHeaders(
    jsonError("INTERNAL_ERROR", "Hệ thống đang bận, vui lòng thử lại", 500),
    activeTrace,
  );
}

async function recordFailedRequest(
  state: MobileApiRequestState,
  error: unknown,
): Promise<void> {
  const errorCode = error instanceof ApiFailure ? error.code : "UNHANDLED";
  if (state.idempotencyReservationId) {
    if (state.idempotencyExecutionStarted) {
      await markHarnessIdempotencyReconcileRequired(
        state.idempotencyClient,
        state.idempotencyReservationId,
        errorCode,
      );
    } else {
      await failHarnessIdempotency(
        state.idempotencyClient,
        state.idempotencyReservationId,
        errorCode,
      );
    }
  }
  await recordHarnessEvent(state.trace, {
    eventClass: error instanceof ApiFailure ? "request.blocked" : "request.failed",
    stage: state.ctx.capabilityEnvelope?.routeKind ?? "unknown",
    status: error instanceof ApiFailure && error.status < 500 ? "blocked" : "failed",
    latencyMs: Date.now() - state.trace.startedAtMs,
    errorCode,
    safeMetadata: { status: error instanceof ApiFailure ? error.status : 500 },
  });
  const envelope = state.ctx.capabilityEnvelope;
  if (envelope?.privileged) {
    await recordHarnessPrivilegedOperation(state.trace, {
      actorRole: state.ctx.role,
      operationId: envelope.routeKind,
      capability: envelope.capability,
      reason: "mobile_api_route_dispatch",
      resourceType: envelope.resource.type,
      resourceId: envelope.resource.id,
      result: error instanceof ApiFailure && error.status < 500 ? "denied" : "failed",
      errorCode,
    });
  }
  await finishHarnessRun(state.trace, { status: "failed", errorCode });
}

async function handleNotFound(
  request: Request,
  trace: HarnessTraceContext,
): Promise<Response> {
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

async function handlePublicRoute(
  route: PublicRoute,
  request: Request,
  services: MobileApiServices,
  trace: HarnessTraceContext,
): Promise<Response> {
  const data = await dispatchPublicRoute(route, request, services);
  await recordHarnessEvent(trace, {
    eventClass: "request.public_completed",
    stage: route.kind,
    status: "succeeded",
    latencyMs: Date.now() - trace.startedAtMs,
  });
  return withHarnessHeaders(json(data, 200), trace);
}

async function authenticationDenied(
  auth: Extract<MobileApiAuthResult, { success: false }>,
  route: AuthenticatedRoute,
  trace: HarnessTraceContext,
): Promise<Response> {
  await recordHarnessEvent(trace, {
    eventClass: "authentication.denied",
    stage: "authentication",
    status: "blocked",
    errorCode: auth.status === 401 ? "AUTH_MISSING" : "AUTH_FORBIDDEN",
    safeMetadata: { status: auth.status, route_kind: route.kind },
  });
  return withHarnessHeaders(
    jsonError(
      auth.status === 401 ? "AUTH_MISSING" : "AUTH_FORBIDDEN",
      auth.error,
      auth.status,
    ),
    trace,
  );
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
      return services.getHarnessHealth?.() ?? {
        service: "mobile-api",
        status: "degraded",
        environment: { name: "unknown", project_ref: null, host: null },
        release: {
          release_id: "unreleased",
          git_sha: "unknown",
          manifest_sha256: "unknown",
          bundle_sha256: "unknown",
          registered: false,
        },
      };
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
