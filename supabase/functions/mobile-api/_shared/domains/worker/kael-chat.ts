// Edge worker Kael core: one-shot Q&A and CRUD session operations.
import { asBoolean, asNumber, asString, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { ACTIVE_WORKER_JOB_STATUSES } from "../../platform/job-state.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  sanitizeKaelText,
  sanitizeWorkerKaelSessionTitle,
  type EdgeAiSecrets,
} from "../../kael/index.ts";
import type {
  EdgeWorkerKaelChatPinInput,
  EdgeWorkerKaelChatRenameInput,
  JobStatus,
  KaelWorkerClarifyInput,
  WorkerKaelChatCreateInput,
} from "../../../../_shared/domain.ts";
import {
  WORKER_KAEL_SESSION_SELECT,
  getWorkerKaelChat,
  readWorkerKaelSession,
  requireWorkerKaelChatJob,
  serializeWorkerKaelSession,
} from "./kael-chat-turn.ts";

export {
  getWorkerKaelChat,
  readWorkerKaelSession,
  sendWorkerKaelChatTurn,
  serializeWorkerKaelSession,
} from "./kael-chat-turn.ts";

export async function askKaelForWorker(
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

  const safeQuestion = sanitizeKaelText(input.question, 1000);
  const answer = buildWorkerKaelAnswer(safeQuestion, job);
  const recorded = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("record_worker_kael_qa_atomic", {
      p_answer: answer,
      p_job_id: jobId,
      p_question: safeQuestion,
      p_worker_id: ctx.user.id,
    }),
  );
  if (recorded.error || !recorded.data?.[0]) {
    apiFailure("DB_ERROR", "Không thể lưu câu hỏi Kael", 500);
  }
  const row = recorded.data[0];
  if (asBoolean(row.ok) !== true) {
    const errorCode = nullableString(row.error_code);
    if (errorCode === "KAEL_QA_LIMIT_REACHED") {
      apiFailure(
        "KAEL_QA_LIMIT_REACHED",
        "Mỗi việc chỉ có thể hỏi Kael thêm tối đa 3 lần",
        429,
      );
    }
    if (errorCode === "INVALID_STATUS") {
      apiFailure(
        "INVALID_STATUS",
        "Kael chỉ hỗ trợ thêm sau khi thợ đã nhận hoặc đang xử lý việc",
        409,
      );
    }
    apiFailure("AUTH_FORBIDDEN", "Không thể lưu câu hỏi Kael", 403);
  }

  return {
    qa_id: asString(row.qa_id),
    job_id: jobId,
    remaining_questions: Math.max(0, asNumber(row.remaining_questions)),
    answer,
  };
}

export async function createWorkerKaelChat(
  ctx: MobileApiContext,
  input: WorkerKaelChatCreateInput,
  _secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const jobId = input.job_id ?? null;
  if (
    (input.mode === "normal" && jobId !== null) ||
    (input.mode === "intake" && jobId === null)
  ) {
    apiFailure("VALIDATION", "Dữ liệu phiên Kael không hợp lệ", 400);
  }
  if (jobId) await requireWorkerKaelChatJob(client, ctx, jobId);

  if (input.client_request_id) {
    const existing = await findExistingWorkerKaelSessionByClientRequest(
      client,
      ctx.user.id,
      jobId,
      input.mode,
      input.client_request_id,
    );
    if (existing) return getWorkerKaelChat(ctx, existing);
  }

  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_sessions")
      .insert({
        worker_id: ctx.user.id,
        job_id: jobId,
        chat_mode: input.mode,
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
      jobId,
      input.mode,
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

export async function listWorkerKaelChats(
  ctx: MobileApiContext,
  mode: WorkerKaelChatCreateInput["mode"],
) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_worker_chat_sessions")
      .select(WORKER_KAEL_SESSION_SELECT)
      .eq("worker_id", ctx.user.id)
      .eq("chat_mode", mode)
      .is("archived_at", null)
      .order("pinned_at", { ascending: false, nullsFirst: false })
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


export async function archiveWorkerKaelChat(
  ctx: MobileApiContext,
  sessionId: string,
) {
  const client = db(ctx);
  const session = await readWorkerKaelSession(client, ctx, sessionId);
  const archivedAt = new Date().toISOString();
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_sessions")
      .update({
        archived_at: archivedAt,
        closed_at: nullableString(session.closed_at) ?? archivedAt,
        status: "closed",
      })
      .eq("id", sessionId)
      .is("archived_at", null)
      .select("id, archived_at")
      .maybeSingle(),
  );
  const persistedArchivedAt = result.data
    ? nullableString(result.data.archived_at)
    : null;
  if (result.error || !result.data || !persistedArchivedAt) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  return {
    session_id: asString(result.data.id),
    archived_at: persistedArchivedAt,
  };
}


export async function renameWorkerKaelChat(
  ctx: MobileApiContext,
  sessionId: string,
  input: EdgeWorkerKaelChatRenameInput,
) {
  const client = db(ctx);
  await readWorkerKaelSession(client, ctx, sessionId);
  const title = sanitizeWorkerKaelSessionTitle(input.title);
  if (!title) {
    apiFailure(
      "VALIDATION",
      "Tên phiên không được chứa thông tin liên hệ hoặc địa chỉ riêng tư",
      400,
    );
  }
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_sessions")
      .update({ title })
      .eq("id", sessionId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  return getWorkerKaelChat(ctx, sessionId);
}


export async function setWorkerKaelChatPinned(
  ctx: MobileApiContext,
  sessionId: string,
  input: EdgeWorkerKaelChatPinInput,
) {
  const client = db(ctx);
  await readWorkerKaelSession(client, ctx, sessionId);
  const pinnedAt = input.pinned ? new Date().toISOString() : null;
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_sessions")
      .update({ pinned_at: pinnedAt })
      .eq("id", sessionId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  return getWorkerKaelChat(ctx, sessionId);
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
      `Kael ghi nhận câu hỏi: ${questionSummary}. Với việc này, hãy kiểm tra đúng phạm vi "${problem}" tại khu vực ${district}, giải thích ngắn gọn bằng chứng thực tế và gửi đề xuất đổi phạm vi nếu có phần phát sinh.`,
      500,
    ),
    safety_notes: [
      "Không bắt đầu phần phát sinh khi khách chưa xác nhận đề xuất đổi phạm vi trong ứng dụng.",
      "Không tự báo giá mới ngoài flow Kael trong app.",
    ],
  };
}


async function findExistingWorkerKaelSessionByClientRequest(
  client: DbClient,
  workerId: string,
  jobId: string | null,
  mode: WorkerKaelChatCreateInput["mode"],
  clientRequestId: string,
): Promise<string | null> {
  let query = client
    .from("kael_worker_chat_sessions")
    .select("id")
    .eq("worker_id", workerId)
    .eq("chat_mode", mode)
    .eq("client_request_id", clientRequestId)
    .is("archived_at", null);
  query = jobId ? query.eq("job_id", jobId) : query.is("job_id", null);
  const result = await dbQuery<Record<string, unknown>>(query.maybeSingle());
  if (result.error || !result.data) return null;
  return asString(result.data.id);
}
