// Edge service worker-kael-chat domain (C4 6a, services/* split): the worker-assist Kael surface —
// one-shot Q&A (askKaelForWorker) + the worker chat session pipeline (create/turn/list/get) with vision
// + runWorkerAssist. The worker stream wrapper stays in services.ts and imports these one-way.

import { asBoolean, asNumber, asRecord, asString, asStringArray, nullableRecord, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { ACTIVE_WORKER_JOB_STATUSES, compactMetadata } from "./_shared.ts";
import { auditGuardrailTripBestEffort, isWorkerAssistGuardrailReason } from "./audit.ts";
import { requireJobAccess } from "../access.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { runWorkerAssist, sanitizeKaelText, scrubSensitiveForLLM, updateKaelProgress, type WorkerAssistAnswer, type WorkerAssistProviderAttempt, type EdgeAiSecrets } from "../kael/index.ts";
import { analyzeDescription } from "../kael/vision.ts";
import { kaelChatProgressSchema, sanitizeForLLM } from "../../../_shared/domain.ts";
import type { JobStatus, KaelWorkerClarifyInput, WorkerKaelChatCreateInput, WorkerKaelChatTurnInput } from "../../../_shared/domain.ts";

const WORKER_KAEL_SESSION_SELECT =
  "id, job_id, worker_id, status, started_at, closed_at, total_turns, total_cost_usd, kael_progress, safe_metadata, created_at, updated_at";
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

export async function listWorkerKaelChats(ctx: MobileApiContext) {
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
  // Worker-assist was BLIND — it only knew the photo COUNT. When
  // the worker attaches photos, run server-side vision (schema-validated, same
  // analyzeDescription as the customer pipeline) so Kael's on-site advice can
  // reference what is actually in the image. Only surface a summary on real
  // success; on skip/fallback we pass null (no fabricated findings).
  let workerVisionSummary: string | null = null;
  if (input.media_refs.length > 0) {
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
        input.media_refs,
        secrets,
      );
      if (vision.success) {
        workerVisionSummary = summarizeWorkerVision(vision.analysis);
      }
    } catch (err) {
      console.warn("worker-assist vision analysis threw; continuing without findings", {
        sessionId,
        error: err instanceof Error ? err.message : "unknown",
      });
      workerVisionSummary = null;
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
      visionSummary: workerVisionSummary,
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
    worker_id: asString(row.worker_id),
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

function summarizeWorkerVision(analysis: {
  problem_identified: string;
  severity_indicators: readonly string[];
  complexity_hint: string;
}): string {
  const parts = [analysis.problem_identified.trim()];
  if (analysis.severity_indicators.length > 0) {
    parts.push(`Dấu hiệu: ${analysis.severity_indicators.join("; ")}`);
  }
  parts.push(`Mức độ ước tính từ ảnh: ${analysis.complexity_hint}`);
  return parts.filter((part) => part.length > 0).join(". ").slice(0, 480);
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
      provider_attempts: formatWorkerAssistProviderAttempts(answer.provider_attempts ?? []),
      kael_trace: answer.trace ?? [],
      provider: answer.provider ?? null,
      model: answer.model ?? null,
      latency_ms: answer.latency_ms ?? null,
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
