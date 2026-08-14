// Edge service kael-chat confirm-bridge (C4 6a, services/* split): confirmKaelChat — the customer
// confirms a Kael chat estimate -> confirm_kael_chat_atomic creates the job -> geocode -> confirmSearch
// (matching) with a chat-matching autonomy decision. Internal: matching-decision builder +
// confirmed-state reader. Imported by services.ts for wiring.

import { asBoolean, asString, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
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
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { buildKaelAutonomyDecision, kaelDiagnosisScopeArtifactSchema, type EdgeAiSecrets, type KaelAutonomyDecision } from "../../kael/index.ts";
import { recordHarnessEvent } from "../../../../_shared/harness/trace.ts";
import type { EdgeKaelChatConfirmInput, JobStatus } from "../../../../_shared/domain.ts";

export async function confirmKaelChat(
  ctx: MobileApiContext,
  sessionId: string,
  input: EdgeKaelChatConfirmInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, job_id, customer_id, case_phase, diagnosis_scope, scheduled_at, preferred_worker_id")
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
  if (!diagnosisScopeResult.success) {
    apiFailure("INVALID_STATUS", "Kael chưa hoàn tất phân tích phạm vi để xác nhận báo giá", 409);
  }
  const diagnosisScope = diagnosisScopeResult.data;
  const scheduledAt = nullableString(sessionResult.data.scheduled_at);
  if (
    !nullableString(sessionResult.data.job_id) &&
    (!scheduledAt || validateFutureHcmcSchedule(scheduledAt) !== null)
  ) {
    apiFailure("VALIDATION", HCMC_SCHEDULE_VALIDATION_MESSAGE, 400);
  }
  const casePhase = sessionResult.data.case_phase;
  if (
    (casePhase !== "offer_review" && casePhase !== "matching") ||
    !diagnosisScope.quote_ready ||
    diagnosisScope.quote_blockers.length > 0 ||
    diagnosisScope.facts.needs_inspection === true ||
    diagnosisScope.next_action.kind !== "prepare_offer"
  ) {
    apiFailure("INVALID_STATUS", "Kael chưa hoàn tất phân tích phạm vi để xác nhận báo giá", 409);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("confirm_kael_chat_atomic", {
      p_session_id: sessionId,
      p_customer_id: ctx.user.id,
      p_price_reasoning_receipt_id: input.price_reasoning_receipt_id,
    }),
  );
  if (result.error) {
    await recordHarnessEvent(ctx.traceContext, {
      eventClass: "kael.confirm.rpc_failed",
      stage: "kael.chat.confirm",
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
    apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  if (!asBoolean(row.ok)) {
    const errorCode = nullableString(row.error_code);
    let existingJobId = nullableString(row.job_id);
    // Safety-net. The RPC normally
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
      if (sessionLookup.error) {
        apiFailure("DB_ERROR", "Không thể khôi phục trạng thái xác nhận Kael", 500);
      }
      existingJobId = nullableString(sessionLookup.data?.job_id ?? null);
    }
    if (errorCode === "ALREADY_CONFIRMED" && existingJobId) {
      const currentState = await readConfirmedKaelChatState(ctx, existingJobId);
      if (currentState.status === "awaiting_customer_confirm") {
        return {
          session_id: sessionId,
          ...(await startConfirmedKaelMatching({
            ctx,
            diagnosisScope,
            input,
            jobId: existingJobId,
            preferredWorkerId: nullableString(sessionResult.data.preferred_worker_id),
            sessionId,
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
  const confirmed = await startConfirmedKaelMatching({
    ctx,
    diagnosisScope,
    input,
    jobId,
    preferredWorkerId: nullableString(sessionResult.data.preferred_worker_id),
    sessionId,
  });
  return {
    session_id: sessionId,
    ...confirmed,
  };
}

function buildKaelChatMatchingDecision(
  sessionId: string,
  jobId: string,
  confidence: number,
  scopeSummary: string | null,
): KaelAutonomyDecision {
  return buildKaelAutonomyDecision({
    action: "start_matching",
    policyId: "kael.autonomy.v2.chat_estimate_to_matching",
    evidence: [
      {
        kind: "artifact",
        reference_id: sessionId,
        summary: scopeSummary ?? "Validated Kael DiagnosisScopeArtifact and customer-confirmed offer.",
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
  input: EdgeKaelChatConfirmInput;
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

function safeConfirmRpcErrorCode(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_]{1,64}$/u.test(value)
    ? value
    : "UNKNOWN";
}

function safeConfirmRpcFailureSubject(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (normalized.includes("permission denied for function")) return "function_execute";
  if (normalized.includes("permission denied for table") || normalized.includes("permission denied for relation") || normalized.includes("permission denied for sequence")) {
    return "data_access";
  }
  if (normalized.includes("permission denied")) return "permission_other";
  return "unknown";
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
    matching_state: await getMatchingState(client, jobId, status),
  };
}
