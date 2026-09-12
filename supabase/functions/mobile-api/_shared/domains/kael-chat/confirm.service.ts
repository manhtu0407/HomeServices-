// Edge service kael-chat confirmation bridge. Governed lanes create or recover one durable
// operation with an atomic database command; legacy lanes retain synchronous matching behavior.
// Imported by services.ts for route wiring.

import { asBoolean, asString, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, workflowDb } from "../../platform/db.ts";
import { mapConfirmKaelChatError } from "../../platform/domain-error-mappers.ts";
import { geocodeConfirmedKaelJob } from "../places/geo.ts";
import { confirmSearch } from "../matching/flow.ts";
import { hasActiveBroadcast } from "../matching/broadcasts.ts";
import {
  beginMatchingPreferencePrompt,
  getMatchingState,
  hasSavedWorker,
  isCustomerFavoriteWorker,
  setJobMatchingPreference,
} from "../matching/matching-preference.ts";
import { HCMC_SCHEDULE_VALIDATION_MESSAGE, validateFutureHcmcSchedule } from "../../platform/scheduling.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { requireJobAccess } from "../../platform/access.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { buildKaelAutonomyDecision, kaelDiagnosisScopeArtifactSchema, type EdgeAiSecrets, type KaelAutonomyDecision } from "../../kael/index.ts";
import { hashHarnessIdentifier, recordHarnessEvent } from "../../../../_shared/harness/trace.ts";
import type { EdgeKaelChatConfirmInput, JobStatus } from "../../../../_shared/domain.ts";
import { resolveStage1RuntimeBehavior } from "../release/stage1-release-lane.ts";
import {
  getKaelConfirmationOperation,
  requestDurableKaelConfirmation,
} from "./confirmation-operation.ts";

export async function confirmKaelChat(
  ctx: MobileApiContext,
  sessionId: string,
  input: EdgeKaelChatConfirmInput,
  secrets: EdgeAiSecrets,
) {
  if (ctx.role !== "customer") {
    apiFailure("FORBIDDEN", "Chỉ khách hàng được xác nhận yêu cầu của mình.", 403);
  }
  const client = db(ctx);
  const workflowClient = workflowDb(ctx);
  const runtimeBehavior = await resolveStage1RuntimeBehavior(client, {
    environment: ctx.environment,
    releaseId: ctx.releaseId,
    sessionId,
    deploymentId: ctx.deploymentId,
    clientContractEpoch: ctx.clientContractEpoch,
  });
  const confirmationKind = input.confirmation_kind ?? "priced_offer";
  if (runtimeBehavior === "governed") {
    return confirmGovernedKaelChat({
      confirmationKind,
      ctx,
      input,
      sessionId,
      workflowClient,
    });
  }

  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, job_id, customer_id, case_phase, diagnosis_scope, scheduled_at, preferred_worker_id, safe_metadata")
      .eq("id", sessionId)
      .eq("customer_id", ctx.user.id)
      .maybeSingle(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  const diagnosisScopeResult = kaelDiagnosisScopeArtifactSchema.safeParse(
    sessionResult.data.diagnosis_scope,
  );
  if (confirmationKind !== "priced_offer" || !diagnosisScopeResult.success) {
    apiFailure("INVALID_STATUS", "Kael chưa hoàn tất phân tích phạm vi để xác nhận báo giá", 409);
  }
  return confirmPreviousReleaseKaelChat({
    ctx,
    diagnosisScope: diagnosisScopeResult.data,
    input,
    secrets,
    session: sessionResult.data,
    sessionId,
  });
}

async function confirmGovernedKaelChat(input: {
  confirmationKind: Exclude<EdgeKaelChatConfirmInput["confirmation_kind"], undefined>;
  ctx: MobileApiContext;
  input: EdgeKaelChatConfirmInput;
  sessionId: string;
  workflowClient: ReturnType<typeof workflowDb>;
}) {
  let result;
  try {
    const traceFinalizer = await confirmationTraceFinalizer(input.ctx);
    result = await requestDurableKaelConfirmation(input.workflowClient, {
      sessionId: input.sessionId,
      customerId: input.ctx.user.id,
      confirmationKind: input.confirmationKind,
      priceReasoningReceiptId: input.input.price_reasoning_receipt_id ?? null,
      ...(input.input.matching_mode ? { matchingMode: input.input.matching_mode } : {}),
      ...(traceFinalizer ? { traceFinalizer } : {}),
    });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error
      ? (error as Error & { cause?: { code?: unknown; message?: unknown } }).cause
      : undefined;
    await recordHarnessEvent(input.ctx.traceContext, {
      eventClass: "kael.confirm.rpc_failed",
      stage: "kael.chat.confirm",
      status: "failed",
      errorCode: "KAEL_CONFIRM_RPC_FAILED",
      safeMetadata: {
        rpc_code: safeConfirmRpcErrorCode(cause?.code),
        rpc_subject: safeConfirmRpcFailureSubject(cause?.message),
      },
    });
    if (cause && isPriceEvidenceConstraintError(cause)) {
      apiFailure(
        "INVALID_STATUS",
        "Báo giá này chưa có đủ nguồn giá đã kiểm chứng. Kael cần lập lại báo giá trước khi bạn xác nhận.",
        409,
      );
    }
    if (cause && isScheduleConstraintError(cause)) {
      apiFailure("VALIDATION", HCMC_SCHEDULE_VALIDATION_MESSAGE, 400);
    }
    apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  }
  if (result.traceFinalized && input.ctx.requestLifecycle) {
    input.ctx.requestLifecycle.finalizedByDomain = true;
  }
  if (!result.ok) {
    mapDurableConfirmationError(result.errorCode);
  }

  const jobId = result.jobId;
  if (!jobId) apiFailure("DB_ERROR", "Phiên Kael chưa tạo được yêu cầu", 500);
  if (!result.operation) apiFailure("DB_ERROR", "Phiên Kael chưa tạo được tiến trình bền vững", 500);
  const status = (result.jobStatus ?? "awaiting_customer_confirm") as JobStatus;
  const matchingState = await getMatchingState(input.workflowClient, jobId, status);
  return {
    session_id: input.sessionId,
    job_id: jobId,
    status,
    broadcast_sent: false,
    worker: null,
    message: matchingState?.stage === "awaiting_choice"
      ? "Bạn chọn cách tìm thợ trước khi Kael gửi yêu cầu."
      : result.alreadyApplied
      ? "Yêu cầu đã được tiếp nhận trước đó. Kael đang đồng bộ tiến trình tìm thợ."
      : "Kael đã tiếp nhận yêu cầu và đang bắt đầu tìm thợ.",
    matching_state: matchingState,
    operation: result.operation,
  };
}

async function confirmationTraceFinalizer(ctx: MobileApiContext) {
  const trace = ctx.traceContext;
  const envelope = ctx.capabilityEnvelope;
  if (!trace?.actorIdHash || !envelope || !ctx.environment || !ctx.releaseId) return null;
  return {
    runId: trace.runId,
    traceId: trace.traceId,
    actorIdHash: trace.actorIdHash,
    actorRole: ctx.role,
    routeKind: "kael.chat.confirm",
    capability: envelope.capability,
    environment: ctx.environment,
    releaseId: ctx.releaseId,
    privileged: envelope.privileged,
    resourceType: envelope.resource.type,
    resourceIdHash: envelope.resource.id
      ? await hashHarnessIdentifier(envelope.resource.id)
      : null,
    durationMs: Math.max(0, Date.now() - trace.startedAtMs),
  };
}

async function confirmPreviousReleaseKaelChat(input: {
  ctx: MobileApiContext;
  diagnosisScope: ReturnType<typeof kaelDiagnosisScopeArtifactSchema.parse>;
  input: EdgeKaelChatConfirmInput;
  secrets: EdgeAiSecrets;
  session: Record<string, unknown>;
  sessionId: string;
}) {
  const client = db(input.ctx);
  const workflowClient = workflowDb(input.ctx);
  const scheduledAt = nullableString(input.session.scheduled_at);
  if (
    !nullableString(input.session.job_id) &&
    (!scheduledAt || validateFutureHcmcSchedule(scheduledAt) !== null)
  ) {
    apiFailure("VALIDATION", HCMC_SCHEDULE_VALIDATION_MESSAGE, 400);
  }
  if (
    (input.session.case_phase !== "offer_review" && input.session.case_phase !== "matching") ||
    !input.diagnosisScope.quote_ready ||
    input.diagnosisScope.quote_blockers.length > 0 ||
    input.diagnosisScope.facts.needs_inspection === true ||
    input.diagnosisScope.next_action.kind !== "prepare_offer"
  ) {
    apiFailure("INVALID_STATUS", "Kael chưa hoàn tất phân tích phạm vi để xác nhận báo giá", 409);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowClient.rpc("confirm_kael_chat_atomic", {
      p_session_id: input.sessionId,
      p_customer_id: input.ctx.user.id,
      p_price_reasoning_receipt_id: input.input.price_reasoning_receipt_id,
    }),
  );
  if (result.error) {
    await recordHarnessEvent(input.ctx.traceContext, {
      eventClass: "kael.confirm.rpc_failed",
      stage: "kael.chat.confirm.previous",
      status: "failed",
      errorCode: "KAEL_CONFIRM_RPC_FAILED",
      safeMetadata: {
        rpc_code: safeConfirmRpcErrorCode(result.error.code),
        rpc_subject: safeConfirmRpcFailureSubject(result.error.message),
      },
    });
    if (isPriceEvidenceConstraintError(result.error)) {
      apiFailure(
        "INVALID_STATUS",
        "Báo giá này chưa có đủ nguồn giá đã kiểm chứng. Kael cần lập lại báo giá trước khi bạn xác nhận.",
        409,
      );
    }
    if (isScheduleConstraintError(result.error)) {
      apiFailure("VALIDATION", HCMC_SCHEDULE_VALIDATION_MESSAGE, 400);
    }
    apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  if (!asBoolean(row.ok)) {
    const errorCode = nullableString(row.error_code);
    let existingJobId = nullableString(row.job_id);
    if (errorCode === "ALREADY_CONFIRMED" && !existingJobId) {
      const sessionLookup = await dbQuery<{ job_id: string | null }>(
        client.from("kael_chat_sessions")
          .select("job_id")
          .eq("id", input.sessionId)
          .eq("customer_id", input.ctx.user.id)
          .maybeSingle(),
      );
      if (sessionLookup.error) {
        apiFailure("DB_ERROR", "Không thể khôi phục trạng thái xác nhận Kael", 500);
      }
      existingJobId = nullableString(sessionLookup.data?.job_id ?? null);
    }
    if (errorCode === "ALREADY_CONFIRMED" && existingJobId) {
      const currentState = await readPreviousReleaseConfirmedState(input.ctx, existingJobId);
      if (currentState.status === "awaiting_customer_confirm") {
        return {
          session_id: input.sessionId,
          ...(await startConfirmedKaelMatching({
            ctx: input.ctx,
            diagnosisScope: input.diagnosisScope,
            input: input.input,
            jobId: existingJobId,
            preferredWorkerId: nullableString(input.session.preferred_worker_id),
            sessionId: input.sessionId,
          })),
        };
      }
      return { session_id: input.sessionId, ...currentState };
    }
    mapConfirmKaelChatError(errorCode);
  }
  const jobId = asString(row.job_id);
  if (!jobId) apiFailure("DB_ERROR", "Phiên Kael chưa tạo được yêu cầu", 500);
  await geocodeConfirmedKaelJob(
    workflowClient,
    input.sessionId,
    jobId,
    input.ctx.user.id,
    nullableString(row.district_code),
    input.secrets,
  );
  return {
    session_id: input.sessionId,
    ...(await startConfirmedKaelMatching({
      ctx: input.ctx,
      diagnosisScope: input.diagnosisScope,
      input: input.input,
      jobId,
      preferredWorkerId: nullableString(input.session.preferred_worker_id),
      sessionId: input.sessionId,
    })),
  };
}

export async function recoverKaelConfirmationOperation(
  ctx: MobileApiContext,
  sessionId: string,
  _secrets: EdgeAiSecrets,
) {
  return getKaelConfirmationOperation(ctx, sessionId);
}

function mapDurableConfirmationError(errorCode: string | null): never {
  if (errorCode === "POLICY_UNAVAILABLE") {
    apiFailure("POLICY_UNAVAILABLE", "Chính sách dịch vụ chưa sẵn sàng. Kael chưa thể nhận yêu cầu này.", 503);
  }
  if (errorCode === "POLICY_BLOCKED" || errorCode === "SAFETY_BLOCKED") {
    apiFailure("POLICY_BLOCKED", "Yêu cầu cần được hỗ trợ an toàn trước khi tiếp tục.", 409);
  }
  if (errorCode === "TIER_A_INCOMPLETE") {
    apiFailure("TIER_A_INCOMPLETE", "Cần bổ sung thông tin bắt buộc trước khi gửi yêu cầu.", 409);
  }
  if (errorCode === "COVERAGE_UNAVAILABLE") {
    apiFailure(
      "COVERAGE_UNAVAILABLE",
      "Khu vực này chưa còn đủ ít nhất 3 thợ phù hợp và có thể nhận yêu cầu. Kael chưa tạo công việc.",
      409,
    );
  }
  if (errorCode === "CONFIRMATION_KIND_MISMATCH") {
    apiFailure("INVALID_STATUS", "Hình thức xác nhận không khớp chính sách dịch vụ hiện tại.", 409);
  }
  mapConfirmKaelChatError(errorCode);
}

function buildKaelChatMatchingDecision(
  sessionId: string,
  jobId: string,
  confidence: number,
  scopeSummary: string | null,
): KaelAutonomyDecision {
  const evidenceSummary = scopeSummary
    ? scopeSummary.slice(0, 280)
    : "Validated Kael DiagnosisScopeArtifact and customer-confirmed offer.";
  return buildKaelAutonomyDecision({
    action: "start_matching",
    policyId: "kael.autonomy.v2.chat_estimate_to_matching",
    evidence: [
      {
        kind: "artifact",
        reference_id: sessionId,
        summary: evidenceSummary,
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
    confidence,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_started_matching",
  });
}

async function startConfirmedKaelMatching(input: {
  ctx: MobileApiContext;
  diagnosisScope: ReturnType<typeof kaelDiagnosisScopeArtifactSchema.parse>;
  input: Pick<EdgeKaelChatConfirmInput, "matching_mode">;
  jobId: string;
  preferredWorkerId: string | null;
  sessionId: string;
}) {
  const autonomyDecision = buildKaelChatMatchingDecision(
    input.sessionId,
    input.jobId,
    input.diagnosisScope.confidence,
    input.diagnosisScope.scope_summary,
  );
  if (
    input.preferredWorkerId &&
    await isCustomerFavoriteWorker(input.ctx, input.preferredWorkerId)
  ) {
    await beginMatchingPreferencePrompt(input.ctx, input.jobId, { autonomyDecision });
    return setJobMatchingPreference(input.ctx, input.jobId, {
      auto_general: true,
      client_request_id: crypto.randomUUID(),
      mode: "saved_worker_first",
      worker_id: input.preferredWorkerId,
    });
  }
  if (
    input.input.matching_mode === "prompt_if_saved" &&
    await hasSavedWorker(input.ctx)
  ) {
    const matchingState = await beginMatchingPreferencePrompt(
      input.ctx,
      input.jobId,
      { autonomyDecision },
    );
    return {
      job_id: input.jobId,
      status: "broadcasting" as JobStatus,
      broadcast_sent: false,
      worker: null,
      message: "Kael đã tìm thấy thợ bạn đã lưu. Bạn chọn cách tìm thợ trước khi Kael gửi yêu cầu.",
      matching_state: matchingState,
    };
  }
  return confirmSearch(input.ctx, input.jobId, {
    kaelSessionId: input.sessionId,
    autonomyDecision,
  });
}

function isPriceEvidenceConstraintError(value: {
  code?: unknown;
  message?: unknown;
}): boolean {
  return value.code === "23514" &&
    typeof value.message === "string" &&
    value.message.includes("KAEL_PRICE_EVIDENCE_REQUIRED");
}

function isScheduleConstraintError(value: {
  code?: unknown;
  message?: unknown;
}): boolean {
  return value.code === "22023" &&
    typeof value.message === "string" &&
    value.message.includes("KAEL_SCHEDULE_INVALID");
}

function safeConfirmRpcErrorCode(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_]{1,64}$/u.test(value)
    ? value
    : "UNKNOWN";
}

function safeConfirmRpcFailureSubject(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (normalized.includes("permission denied for function")) return "function_execute";
  if (
    normalized.includes("permission denied for table") ||
    normalized.includes("permission denied for relation") ||
    normalized.includes("permission denied for sequence")
  ) return "data_access";
  if (normalized.includes("permission denied")) return "permission_other";
  return "unknown";
}

async function readPreviousReleaseConfirmedState(
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
    matching_state: await getMatchingState(client, jobId, status),
  };
}
