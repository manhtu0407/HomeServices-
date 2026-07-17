// Edge service worker-kael-chat domain: the worker-assist Kael surface —
// one-shot Q&A (askKaelForWorker) + the worker chat session pipeline (create/turn/list/get) with vision
// + runWorkerAssist. The worker stream wrapper stays in services.ts and imports these one-way.

import { asBoolean, asNumber, asRecord, asString, asStringArray, nullableRecord, nullableString } from "../_runtime/coercions.ts";
import { db, dbQuery, type DbClient } from "../_runtime/db.ts";
import { ACTIVE_WORKER_JOB_STATUSES, compactMetadata } from "../_runtime/shared.ts";
import { auditGuardrailTripBestEffort, isWorkerAssistGuardrailReason } from "../_runtime/audit.ts";
import { requireJobAccess } from "../../access.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import { buildWorkerKaelSessionTitle, runWorkerAssist, sanitizeKaelText, sanitizeWorkerKaelSessionTitle, scrubSensitiveForLLM, updateKaelProgress, type WorkerAssistAnswer, type EdgeAiSecrets } from "../../kael/index.ts";
import { takeDurableKaelChatRateLimit } from "../../kael/guards/durable-guards.ts";
import { analyzeDescription } from "../../kael/stages/vision.ts";
import { kaelChatProgressSchema, sanitizeForLLM } from "../../../../_shared/domain.ts";
import type { WorkerVisionFinding } from "../../kael/types.ts";
import {
  buildSafeWorkerVisionFinding,
  prepareWorkerKaelVisionUrls,
} from "./media.ts";
import {
  claimWorkerKaelChatTurn,
  completeWorkerKaelChatTurn,
  releaseWorkerKaelTurnClaim,
} from "./claims.ts";
import type { EdgeWorkerKaelChatPinInput, EdgeWorkerKaelChatRenameInput, JobStatus, KaelWorkerClarifyInput, WorkerKaelChatCreateInput, WorkerKaelChatTurnInput } from "../../../../_shared/domain.ts";

const WORKER_KAEL_SESSION_SELECT =
  "id, job_id, chat_mode, worker_id, status, title, pinned_at, started_at, closed_at, archived_at, total_turns, total_cost_usd, kael_progress, safe_metadata, created_at, updated_at";
const WORKER_KAEL_TURN_SELECT =
  "id, session_id, job_id, turn_index, role, content_type, text_content, media_refs, safe_metadata, created_at";
const WORKER_KAEL_PRIVATE_METADATA_KEY = "safe_" + "metadata";

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
  await requireWorkerKaelChatJob(client, ctx, input.job_id);

  if (input.client_request_id) {
    const existing = await findExistingWorkerKaelSessionByClientRequest(
      client,
      ctx.user.id,
      input.job_id,
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
        job_id: input.job_id,
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
      input.job_id,
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

export async function getWorkerKaelChat(
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

export async function sendWorkerKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: WorkerKaelChatTurnInput,
  secrets: EdgeAiSecrets,
  options: { prefetchedJob?: Record<string, unknown>; skipRateLimit?: boolean } = {},
) {
  const client = db(ctx);
  const spendGate = { client, actorId: ctx.user.id };
  const session = await readWorkerKaelSession(client, ctx, sessionId);
  if (asWorkerKaelChatStatus(session.status) !== "active") {
    apiFailure("INVALID_STATUS", "Phi\u00ean Kael n\u00e0y kh\u00f4ng c\u00f2n nh\u1eadn tin nh\u1eafn", 409);
  }
  const job = options.prefetchedJob ??
    await requireWorkerKaelChatJob(client, ctx, asString(session.job_id));
  const safeMessage = scrubSensitiveForLLM(sanitizeForLLM(input.message));
  const visionPhotoUrls = input.media_refs.length > 0
    ? await prepareWorkerKaelVisionUrls(
      ctx,
      client,
      asString(session.job_id),
      input.media_refs,
    )
    : [];
  const claimId = crypto.randomUUID();
  const claim = await claimWorkerKaelChatTurn(client, {
    claimId,
    clientRequestId: input.client_request_id,
    contentType: input.media_refs.length > 0 ? "photo_attached" : "text",
    jobId: asString(session.job_id),
    mediaRefs: input.media_refs,
    message: safeMessage,
    sessionId,
    workerId: ctx.user.id,
  });
  if (asBoolean(claim.completed)) return getWorkerKaelChat(ctx, sessionId);

  if (!options.skipRateLimit) {
    try {
      await enforceWorkerKaelChatRateLimit(client, ctx, secrets);
    } catch (error) {
      await releaseWorkerKaelTurnClaim(client, {
        claimId,
        discard: true,
        requestId: asString(claim.request_id),
        sessionId,
        workerId: ctx.user.id,
      });
      throw error;
    }
  }
  await updateKaelProgress(client, {
    table: "kael_worker_chat_sessions",
    id: sessionId,
  }, {
    stage: "worker_assist",
    status: "running",
    progress: 0.2,
  });

  const previousTurns = asNumber(session.total_turns);
  const needsInitialTitle = previousTurns === 0 && !nullableString(session.title);
  const recentTurns = await readWorkerKaelRecentTurns(client, sessionId);
  // Worker-assist was BLIND — it only knew the photo COUNT. When
  // the worker attaches photos, run server-side vision (schema-validated, same
  // analyzeDescription as the customer pipeline) so Kael's on-site advice can
  // reference what is actually in the image. Only surface a summary on real
  // success; on skip/fallback we pass null (no fabricated findings).
  let workerVisionFinding: WorkerVisionFinding | null = null;
  if (visionPhotoUrls.length > 0) {
    // analyzeDescription is designed to return a structured success/fail, but an
    // unexpected throw (e.g. image fetch) must NOT crash the worker chat turn —
    // the W-1 contract is "null on failure, no fabricated findings", so degrade.
    try {
      const visionContext = [
        nullableString(job.service_type),
        nullableString(job.kael_problem_identified) ?? nullableString(job.description),
      ].filter((part): part is string => Boolean(part)).join(" · ");
      const vision = await analyzeDescription(
        safeMessage,
        visionContext,
        visionPhotoUrls,
        secrets,
        spendGate,
        input.language,
      );
      if (vision.success) {
        workerVisionFinding = buildSafeWorkerVisionFinding(
          vision.analysis,
          nullableString(job.service_type),
        );
      }
    } catch (err) {
      console.warn("worker-assist vision analysis threw; continuing without findings", {
        sessionId,
        errorName: err instanceof Error ? err.name : typeof err,
      });
      workerVisionFinding = null;
    }
  }
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
      visionFinding: workerVisionFinding,
      previousTurns: recentTurns,
      secrets,
      spendGate,
    });
  } catch (err) {
    await releaseWorkerKaelTurnClaim(client, {
      claimId,
      discard: false,
      requestId: asString(claim.request_id),
      sessionId,
      workerId: ctx.user.id,
    });
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
      source: answer.guardrail_source ??
        (answer.guardrail_reason === "MONEY_OR_STATUS_MUTATION"
          ? "boundary_guard"
          : answer.guardrail_reason === "semantic_guardrail"
          ? "semantic_self_check"
          : "self_check"),
      safeMetadata: {
        session_id: sessionId,
      },
    });
  }

  if (needsInitialTitle) {
    const title = buildWorkerKaelSessionTitle(
      safeMessage,
      answer.session_title,
      input.language,
    );
    const titleResult = await dbQuery<Record<string, unknown>>(
      client
        .from("kael_worker_chat_sessions")
        .update({ title })
        .eq("id", sessionId)
        .is("title", null)
        .select("id")
        .maybeSingle(),
    );
    if (titleResult.error) {
      console.warn("worker Kael session title persistence failed", {
        sessionId,
        errorCode: titleResult.error.code ?? "DB_ERROR",
      });
    }
  }

  let completed: Record<string, unknown>;
  try {
    completed = await completeWorkerKaelChatTurn(client, {
      answer,
      claimId,
      jobId: asString(session.job_id),
      requestId: asString(claim.request_id),
      sessionId,
      workerId: ctx.user.id,
      workerTurnId: asString(claim.worker_turn_id),
    });
  } catch (error) {
    await releaseWorkerKaelTurnClaim(client, {
      claimId,
      discard: false,
      requestId: asString(claim.request_id),
      sessionId,
      workerId: ctx.user.id,
    });
    throw error;
  }
  if (asBoolean(completed.stale)) {
    apiFailure(
      "WORKFLOW_STALE",
      "Trạng thái công việc đã đổi trong lúc Kael xử lý. Vui lòng gửi lại yêu cầu.",
      409,
    );
  }
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

export async function readWorkerKaelSession(
  client: DbClient,
  ctx: MobileApiContext,
  sessionId: string,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_sessions")
      .select(WORKER_KAEL_SESSION_SELECT)
      .eq("id", sessionId)
      .is("archived_at", null)
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

export function serializeWorkerKaelSession(row: Record<string, unknown>) {
  const rawProgress = nullableRecord(row.kael_progress);
  const parsedProgress = rawProgress
    ? kaelChatProgressSchema.safeParse(rawProgress)
    : null;
  return {
    id: asString(row.id),
    job_id: asString(row.job_id),
    mode: asWorkerKaelChatMode(row.chat_mode),
    worker_id: asString(row.worker_id),
    status: asWorkerKaelChatStatus(row.status),
    title: nullableString(row.title),
    pinned_at: nullableString(row.pinned_at),
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
  mode: WorkerKaelChatCreateInput["mode"],
  clientRequestId: string,
): Promise<string | null> {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_worker_chat_sessions")
      .select("id")
      .eq("worker_id", workerId)
      .eq("job_id", jobId)
      .eq("chat_mode", mode)
      .eq("client_request_id", clientRequestId)
      .is("archived_at", null)
      .maybeSingle(),
  );
  if (result.error || !result.data) return null;
  return asString(result.data.id);
}

async function enforceWorkerKaelChatRateLimit(
  client: DbClient,
  ctx: MobileApiContext,
  secrets: EdgeAiSecrets,
) {
  if (secrets.durableGuardsEnabled) {
    const rate = await takeDurableKaelChatRateLimit(client, ctx.user.id);
    if (!rate.allowed) {
      apiFailure(
        "RATE_LIMITED",
        rate.reason === "hour"
          ? "Bạn đã đạt giới hạn Kael trong 1 giờ. Vui lòng thử lại sau."
          : "Bạn đang gửi quá nhanh. Vui lòng thử lại sau ít phút.",
        429,
      );
    }
    return;
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("check_kael_worker_chat_rate", { p_worker_id: ctx.user.id }),
  );
  if (result.error) {
    console.warn("worker Kael chat rate limit unavailable", {
      errorCode: result.error.code,
    });
    apiFailure(
      "RATE_LIMIT_UNAVAILABLE",
      "Kael chưa thể kiểm tra giới hạn sử dụng. Vui lòng thử lại sau.",
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

function serializeWorkerKaelTurn(row: Record<string, unknown>) {
  return {
    id: asString(row.id),
    session_id: asString(row.session_id),
    turn_index: asNumber(row.turn_index),
    role: asWorkerKaelTurnRole(row.role),
    content_type: asWorkerKaelContentType(row.content_type),
    text_content: nullableString(row.text_content),
    media_refs: asStringArray(row.media_refs),
    safety_notes: workerKaelSafetyNotes(row[WORKER_KAEL_PRIVATE_METADATA_KEY]),
    created_at: asString(row.created_at),
  };
}

function workerKaelSafetyNotes(metadata: unknown) {
  const raw = asRecord(metadata).safety_notes;
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function asWorkerKaelChatStatus(
  value: unknown,
): "active" | "closed" | "escalated" | "error" {
  if (
    value === "active" || value === "closed" ||
    value === "escalated" || value === "error"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu phiên Kael của thợ không hợp lệ", 500);
}

function asWorkerKaelChatMode(value: unknown): WorkerKaelChatCreateInput["mode"] {
  return value === "normal" ? "normal" : "intake";
}

function asWorkerKaelTurnRole(value: unknown): "worker" | "kael" | "system" {
  if (value === "worker" || value === "kael" || value === "system") {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu lượt chat Kael của thợ không hợp lệ", 500);
}

function asWorkerKaelContentType(
  value: unknown,
): "text" | "photo_attached" | "guidance" | "error" | "clarification" | "photo_request" {
  if (
    value === "text" || value === "clarification" || value === "guidance" ||
    value === "photo_request" || value === "photo_attached" ||
    value === "error"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu lượt chat Kael của thợ không hợp lệ", 500);
}
