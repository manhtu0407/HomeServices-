import type {
  WorkerAssistAnswer,
  WorkerAssistProviderAttempt,
} from "../kael/index.ts";
import { apiFailure } from "../router.ts";
import { compactMetadata } from "./_runtime/shared.ts";
import { asBoolean, nullableString } from "./_runtime/coercions.ts";
import { dbQuery, type DbClient } from "./_runtime/db.ts";

export async function claimWorkerKaelChatTurn(
  client: DbClient,
  input: {
    claimId: string;
    clientRequestId: string;
    contentType: "text" | "photo_attached";
    jobId: string;
    mediaRefs: string[];
    message: string;
    sessionId: string;
    workerId: string;
  },
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("claim_worker_kael_chat_turn_atomic", {
      p_claim_id: input.claimId,
      p_client_request_id: input.clientRequestId,
      p_content_type: input.contentType,
      p_job_id: input.jobId,
      p_media_refs: input.mediaRefs,
      p_session_id: input.sessionId,
      p_text_content: input.message,
      p_worker_id: input.workerId,
    }),
  );
  if (result.error || !result.data?.[0]) {
    apiFailure("DB_ERROR", "Không thể bắt đầu lượt chat Kael", 500);
  }

  const row = result.data[0];
  if (asBoolean(row.ok)) return row;

  const errorCode = nullableString(row.error_code);
  if (errorCode === "REQUEST_IN_PROGRESS" || errorCode === "SESSION_TURN_IN_PROGRESS") {
    apiFailure(
      "REQUEST_IN_PROGRESS",
      "Kael đang xử lý một tin nhắn trong phiên này. Vui lòng chờ kết quả.",
      409,
    );
  }
  if (errorCode === "IDEMPOTENCY_CONFLICT") {
    apiFailure(
      "IDEMPOTENCY_CONFLICT",
      "Mã yêu cầu này đã được dùng cho một nội dung khác.",
      409,
    );
  }
  if (
    errorCode === "INVALID_STATUS" || errorCode === "SOURCE_STATUS_STALE" ||
    errorCode === "SOURCE_TURN_INVALID"
  ) {
    apiFailure(
      "WORKFLOW_STALE",
      "Phiên hoặc trạng thái công việc đã thay đổi. Vui lòng tải lại trước khi gửi tiếp.",
      409,
    );
  }
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không thể gửi tin nhắn vào phiên Kael này", 403);
  }
  if (errorCode === "INVALID_INPUT") {
    apiFailure("VALIDATION_ERROR", "Tin nhắn Kael không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể bắt đầu lượt chat Kael", 500);
}

export async function completeWorkerKaelChatTurn(
  client: DbClient,
  input: {
    answer: WorkerAssistAnswer;
    claimId: string;
    jobId: string;
    requestId: string;
    sessionId: string;
    workerId: string;
    workerTurnId: string;
  },
) {
  const answerMetadata = compactMetadata({
    schema_version: input.answer.schema_version,
    safety_notes: input.answer.safety_notes,
    redirect_scope_change: input.answer.redirect_scope_change,
    fallback_used: input.answer.fallback_used,
    guardrail_reason: input.answer.guardrail_reason ?? null,
    provider_attempts: formatWorkerAssistProviderAttempts(input.answer.provider_attempts ?? []),
    kael_trace: input.answer.trace ?? [],
    provider: input.answer.provider ?? null,
    model: input.answer.model ?? null,
    latency_ms: input.answer.latency_ms ?? null,
  });
  const sessionMetadataPatch = compactMetadata({
    latest_redirect_scope_change: input.answer.redirect_scope_change,
    latest_fallback_used: input.answer.fallback_used,
  });
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("complete_worker_kael_chat_turn_atomic", {
      p_ai_model: input.answer.model ?? null,
      p_ai_provider: input.answer.provider ?? null,
      p_claim_id: input.claimId,
      p_content_type: input.answer.redirect_scope_change ? "guidance" : "text",
      p_cost_usd: input.answer.cost_usd ?? 0,
      p_job_id: input.jobId,
      p_latency_ms: input.answer.latency_ms ?? null,
      p_request_id: input.requestId,
      p_safe_metadata: answerMetadata,
      p_session_id: input.sessionId,
      p_session_metadata_patch: sessionMetadataPatch,
      p_text_content: input.answer.text,
      p_worker_id: input.workerId,
      p_worker_turn_id: input.workerTurnId,
    }),
  );
  if (result.error || !result.data?.[0]) {
    apiFailure("DB_ERROR", "Không thể lưu câu trả lời Kael", 500);
  }
  const row = result.data[0];
  if (asBoolean(row.ok)) return row;

  const errorCode = nullableString(row.error_code);
  if (errorCode === "IDEMPOTENCY_CONFLICT") {
    apiFailure(
      "IDEMPOTENCY_CONFLICT",
      "Kết quả Kael không khớp với yêu cầu đã hoàn tất.",
      409,
    );
  }
  if (errorCode === "CLAIM_STALE" || errorCode === "REQUEST_INVALID") {
    apiFailure(
      "WORKFLOW_STALE",
      "Quyền xử lý lượt Kael đã hết hạn. Vui lòng gửi lại yêu cầu.",
      409,
    );
  }
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  apiFailure("DB_ERROR", "Không thể lưu câu trả lời Kael", 500);
}

export async function releaseWorkerKaelTurnClaim(
  client: DbClient,
  input: {
    claimId: string;
    discard: boolean;
    requestId: string;
    sessionId: string;
    workerId: string;
  },
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("release_worker_kael_chat_turn_claim_atomic", {
      p_claim_id: input.claimId,
      p_discard: input.discard,
      p_request_id: input.requestId,
      p_session_id: input.sessionId,
      p_worker_id: input.workerId,
    }),
  );
  return !result.error && asBoolean(result.data?.[0]?.released);
}

function formatWorkerAssistProviderAttempts(
  attempts: readonly WorkerAssistProviderAttempt[],
) {
  return attempts.map((attempt) =>
    [
      attempt.role,
      attempt.provider,
      attempt.model,
      attempt.result,
      attempt.code ?? "ok",
      `timeout=${attempt.timeout_ms}`,
      `prompt=${attempt.prompt_version}`,
      `schema=${attempt.schema_version}`,
      attempt.latency_ms !== undefined ? `latency=${attempt.latency_ms}` : "latency=n/a",
    ].join(":")
  );
}
