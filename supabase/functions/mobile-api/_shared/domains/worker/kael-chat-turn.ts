import { asBoolean, asNumber, asRecord, asString, asStringArray, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { ACTIVE_WORKER_JOB_STATUSES } from "../../platform/job-state.ts";
import { auditGuardrailTripBestEffort, isWorkerAssistGuardrailReason } from "../../kael/learning/audit.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  buildKaelL2L3MemorySummary,
  buildWorkerKaelSessionTitle,
  loadNormalChatSessionContext,
  runWorkerAssist,
  scrubSensitiveForLLM,
  summarizeNormalChatSessionIfDue,
  updateKaelProgress,
  type EdgeAiSecrets,
  type KaelReasoningReporter,
  type KaelResponseReporter,
  type WorkerAssistAnswer,
  type WorkerKaelConversationScope,
  type WorkerOpportunityAssistContext,
  type WorkerOpportunityAssistPreferences,
} from "../../kael/index.ts";
import { takeDurableKaelChatRateLimit } from "../../kael/kael-guardrails/durable-guards.ts";
import {
  createRuntimeKaelSpendGate,
  type KaelSpendGate,
} from "../../kael/kael-guardrails/spend-gate.ts";
import {
  analyzeDescription,
  analyzeNormalChatImages,
  type NormalChatImageAnalysis,
} from "../../kael/tools/vision.ts";
import {
  appendNormalChatSources,
  searchNormalChatQuestion,
  shouldSearchNormalChatQuestion,
} from "../../kael/tools/normal-chat-search.ts";
import { kaelChatProgressSchema, sanitizeForLLM } from "../../../../_shared/domain.ts";
import type { WorkerVisionFinding } from "../../kael/contracts/types.ts";
import {
  buildSafeWorkerVisionFinding,
  prepareWorkerKaelVisionUrls,
} from "./kael-media.ts";
import {
  buildKaelVisionValidationEvidence,
  createKaelChatMediaPreviews,
  createSignedVisionUrls,
} from "../kael-chat/media-vision.ts";
import { validateAndConsumeKaelChatEvidenceMediaRefs } from "../kael-chat/media-upload.ts";
import {
  claimWorkerKaelChatTurn,
  completeWorkerKaelChatTurn,
  releaseWorkerKaelTurnClaim,
} from "./kael-chat-claims.ts";
import type { WorkerKaelChatCreateInput, WorkerKaelChatTurnInput } from "../../../../_shared/domain.ts";
import { readWorkerOpportunityAssistContext } from "./broadcasts.ts";
import { deriveWorkerKaelConversationScope } from "./kael-chat-scope.ts";
import { projectWorkerJobBrief } from "./job-brief.ts";

export const WORKER_KAEL_SESSION_SELECT =
  "id, job_id, chat_mode, worker_id, status, title, pinned_at, started_at, closed_at, archived_at, total_turns, total_cost_usd, kael_progress, safe_metadata, created_at, updated_at";
const WORKER_KAEL_TURN_SELECT =
  "id, session_id, job_id, turn_index, role, content_type, text_content, media_refs, safe_metadata, created_at";
const WORKER_KAEL_PRIVATE_METADATA_KEY = "safe_" + "metadata";

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
  const turns = (turnsResult.data ?? []).map(serializeWorkerKaelTurn);
  const refs = turns.flatMap((turn) => turn.role === "worker" ? turn.media_refs : []);
  const previews = new Map(
    (await createKaelChatMediaPreviews(ctx, refs, nullableString(session.worker_id)))
      .map((preview) => [preview.ref, preview]),
  );
  return {
    session: serializeWorkerKaelSession(session),
    turns: turns.map((turn) =>
      turn.role === "worker" && turn.media_refs.length > 0
        ? { ...turn, media_previews: turn.media_refs.map((ref) => previews.get(ref) ?? { ref, status: "unavailable" as const, url: null }) }
        : turn
    ),
  };
}

export async function sendWorkerKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: WorkerKaelChatTurnInput,
  secrets: EdgeAiSecrets,
  options: {
    prefetchedJob?: Record<string, unknown>;
    reasoning?: KaelReasoningReporter;
    response?: KaelResponseReporter;
    skipRateLimit?: boolean;
  } = {},
) {
  const client = db(ctx);
  const spendGate = createRuntimeKaelSpendGate(client, ctx.user.id, secrets.harnessTrace);
  const session = await readWorkerKaelSession(client, ctx, sessionId);
  if (asWorkerKaelChatStatus(session.status) !== "active") {
    apiFailure("INVALID_STATUS", "Phi\u00ean Kael n\u00e0y kh\u00f4ng c\u00f2n nh\u1eadn tin nh\u1eafn", 409);
  }
  const sessionMode = asWorkerKaelChatMode(session.chat_mode);
  const sessionJobId = nullableString(session.job_id);
  const conversationScope = deriveWorkerKaelConversationScope(sessionMode, sessionJobId);
  if (!conversationScope) {
    apiFailure("WORKFLOW_STALE", "Phi\u00ean Kael kh\u00f4ng c\u00f2n h\u1ee3p l\u1ec7", 409);
  }
  if (sessionJobId === null && input.media_refs.length > 0 && sessionMode !== "normal") {
    apiFailure(
      "VALIDATION_ERROR",
      "\u1ea2nh ch\u1ec9 \u0111\u01b0\u1ee3c g\u1eedi trong cu\u1ed9c tr\u00f2 chuy\u1ec7n theo c\u00f4ng vi\u1ec7c",
      400,
    );
  }
  const job = sessionJobId
    ? options.prefetchedJob ??
      await requireWorkerKaelChatJob(client, ctx, sessionJobId)
    : null;
  const safeMessage = scrubSensitiveForLLM(sanitizeForLLM(input.message));
  const visionPhotoUrls = input.media_refs.length === 0
    ? []
    : sessionJobId
    ? await prepareWorkerKaelVisionUrls(
      ctx,
      client,
      sessionJobId,
      input.media_refs,
    )
    : await prepareWorkerGeneralChatVisionUrls(ctx, input.media_refs);
  const claimId = crypto.randomUUID();
  const claim = await claimWorkerKaelChatTurn(client, {
    claimId,
    clientRequestId: input.client_request_id,
    contentType: input.media_refs.length > 0 ? "photo_attached" : "text",
    jobId: sessionJobId,
    mediaRefs: input.media_refs,
    message: safeMessage,
    sessionId,
    workerId: ctx.user.id,
  });
  if (asBoolean(claim.completed)) {
    options.reasoning?.complete({
      fallbackUsed: false,
      summary: [workerReasoningCompletion(input.language, false, true)],
    });
  }
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
  let opportunityContext: {
    opportunities: WorkerOpportunityAssistContext[];
    preferences: WorkerOpportunityAssistPreferences;
  } | null = null;
  if (conversationScope === "opportunity_intake") {
    try {
      opportunityContext = await readWorkerOpportunityAssistContext(ctx);
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
  }
  await updateKaelProgress(client, {
    table: "kael_worker_chat_sessions",
    id: sessionId,
  }, {
    stage: "worker_assist",
    status: "running",
    progress: 0.2,
  });
  if (opportunityContext && opportunityContext.opportunities.length === 0) {
    return finalizeWorkerKaelChatTurn({
      client,
      ctx,
      sessionId,
      input,
      sessionJobId,
      answer: emptyWorkerOpportunityAnswer(safeMessage, input.language),
      needsInitialTitle: asNumber(session.total_turns) === 0 && !nullableString(session.title),
      claim,
      claimId,
      reasoning: options.reasoning,
      response: options.response,
      safeMessage,
    });
  }
  const { answer, needsInitialTitle } = await runWorkerKaelAssistant({
    client, ctx, session, sessionId, input, secrets, spendGate, sessionMode,
    conversationScope, opportunityContext, sessionJobId, job, visionPhotoUrls,
    claim, claimId, reasoning: options.reasoning,
    response: options.response, safeMessage,
  });
  return finalizeWorkerKaelChatTurn({
    client, ctx, sessionId, input, sessionJobId, answer, needsInitialTitle,
    claim, claimId, reasoning: options.reasoning, response: options.response, safeMessage,
    normalChatSession: sessionMode === "normal" && sessionJobId === null,
    secrets,
  });
}

async function runWorkerKaelAssistant(input: {
  client: DbClient;
  ctx: MobileApiContext;
  session: Record<string, unknown>;
  sessionId: string;
  input: WorkerKaelChatTurnInput;
  secrets: EdgeAiSecrets;
  spendGate: KaelSpendGate;
  sessionMode: WorkerKaelChatCreateInput["mode"];
  conversationScope: WorkerKaelConversationScope;
  opportunityContext: {
    opportunities: WorkerOpportunityAssistContext[];
    preferences: WorkerOpportunityAssistPreferences;
  } | null;
  sessionJobId: string | null;
  job: Record<string, unknown> | null;
  visionPhotoUrls: string[];
  claim: Record<string, unknown>;
  claimId: string;
  reasoning?: KaelReasoningReporter;
  response?: KaelResponseReporter;
  safeMessage: string;
}) {
  const needsInitialTitle = asNumber(input.session.total_turns) === 0 && !nullableString(input.session.title);
  try {
    const normalChatScope = input.conversationScope === "normal"
      ? { actorRole: "worker" as const, actorId: input.ctx.user.id, sessionId: input.sessionId }
      : null;
    if (normalChatScope) {
      await summarizeNormalChatSessionIfDue(
        input.client,
        normalChatScope,
        input.secrets,
        input.input.language,
      ).catch((error) => console.warn("normal worker Kael memory refresh skipped", {
        sessionId: input.sessionId,
        errorName: error instanceof Error ? error.name : typeof error,
      }));
    }
    const sessionContext = normalChatScope
      ? await loadNormalChatSessionContext(input.client, normalChatScope)
      : null;
    const recentTurns = sessionContext
      ? sessionContext.previousTurns
        .filter((turn) => turn.id !== asString(input.claim.worker_turn_id))
        .map((turn) => ({
        role: turn.role as "worker" | "kael" | "system",
        text: turn.text,
        }))
      : await readWorkerKaelRecentTurns(input.client, input.sessionId);
    const { workerVisionFinding, normalChatImageAnalysis } = await findWorkerKaelVision(input);
    if (normalChatScope && normalChatImageAnalysis) {
      await persistWorkerNormalChatImageAnalysis(input, normalChatImageAnalysis);
    }
    const memorySummary = sessionContext?.memorySummary ?? (
      input.conversationScope === "opportunity_intake"
        ? null
        : await buildKaelL2L3MemorySummary(input.client, {
          jobId: input.sessionJobId,
          includeCustomer: false,
          maxTotalTokens: 500,
        })
    );
    const normalChatSearchResults = normalChatScope && shouldSearchNormalChatQuestion(input.safeMessage)
      ? await searchNormalChatQuestion({
        question: input.safeMessage,
        language: input.input.language,
        actorRole: "worker",
        actorId: input.ctx.user.id,
        client: input.client,
        secrets: input.secrets,
      })
      : undefined;
    const answer = await runWorkerAssist({
      conversationMode: input.sessionMode,
      conversationScope: input.conversationScope,
      job: input.job
        ? {
          id: asString(input.job.id), status: nullableString(input.job.status),
          service_type: nullableString(input.job.service_type), description: nullableString(input.job.description),
          address_district: nullableString(input.job.address_district),
          kael_problem_identified: nullableString(input.job.kael_problem_identified),
          kael_complexity: nullableString(input.job.kael_complexity),
          kael_worker_brief_core: nullableRecord(input.job.kael_worker_brief_core),
          kael_worker_brief_guidance: nullableRecord(input.job.kael_worker_brief_guidance),
        }
        : null,
      question: input.safeMessage || (input.input.language === "en"
        ? "Please analyze the attached image(s)."
        : "Hãy phân tích ảnh đính kèm."),
      language: input.input.language, mediaRefs: input.input.media_refs,
      opportunities: input.opportunityContext?.opportunities,
      opportunityPreferences: input.opportunityContext?.preferences,
      reasoning: input.reasoning,
      response: input.response,
      visionFinding: workerVisionFinding,
      normalChatImageAnalysis,
      normalChatSearchResults,
      normalChatSearchUnavailable: normalChatSearchResults === null,
      previousTurns: recentTurns,
      memorySummary, secrets: input.secrets, spendGate: input.spendGate,
    });
    const answerWithSources = normalChatSearchResults?.length
      ? {
        ...answer,
        text: appendNormalChatSources(answer.text, normalChatSearchResults, input.input.language),
      }
      : answer;
    return { answer: answerWithSources, needsInitialTitle };
  } catch (error) {
    await releaseWorkerKaelTurnClaim(input.client, {
      claimId: input.claimId, discard: false, requestId: asString(input.claim.request_id),
      sessionId: input.sessionId, workerId: input.ctx.user.id,
    });
    await updateKaelProgress(input.client, { table: "kael_worker_chat_sessions", id: input.sessionId }, {
      stage: "worker_assist", status: "failed", progress: 1, failureReason: "worker_assist_failed",
    });
    throw error;
  }
}

function emptyWorkerOpportunityAnswer(
  question: string,
  language: "vi" | "en",
): WorkerAssistAnswer {
  return {
    schema_version: "worker_assist_answer.v1",
    text: language === "en"
      ? "There are no active opportunities available right now. Please check the opportunity inbox again later."
      : "Hiện chưa có cơ hội nào còn hiệu lực. Bạn hãy kiểm tra lại Hộp cơ hội sau.",
    session_title: buildWorkerKaelSessionTitle(question, null, language),
    safety_notes: [],
    redirect_scope_change: false,
    fallback_used: false,
    public_reasoning_summary: language === "en"
      ? ["No active opportunity was available in the verified list."]
      : ["Danh sách đã xác minh hiện không có cơ hội còn hiệu lực."],
    provider_attempts: [],
    trace: [],
    cost_usd: 0,
  };
}

async function findWorkerKaelVision(
  input: Pick<Parameters<typeof runWorkerKaelAssistant>[0], "sessionId" | "job" | "visionPhotoUrls" | "safeMessage" | "secrets" | "spendGate" | "input">,
): Promise<{
  workerVisionFinding: WorkerVisionFinding | null;
  normalChatImageAnalysis: NormalChatImageAnalysis | null;
}> {
  if (input.visionPhotoUrls.length === 0) {
    return { workerVisionFinding: null, normalChatImageAnalysis: null };
  }
  if (input.input.media_refs.length > 0 && input.sessionId && !input.job) {
    const analysis = await analyzeNormalChatImages(
      input.safeMessage,
      input.visionPhotoUrls,
      input.secrets,
      input.spendGate,
      input.input.language,
    );
    if (!analysis.success) {
      apiFailure(
        "AI_UNAVAILABLE",
        input.input.language === "en"
          ? "Kael could not analyze the attached image. Your message is still available to retry."
          : "Kael chưa thể phân tích ảnh đính kèm. Tin nhắn của bạn vẫn có thể gửi lại.",
        502,
      );
    }
    return { workerVisionFinding: null, normalChatImageAnalysis: analysis.analysis };
  }
  try {
    const visionContext = input.job
      ? [
        nullableString(input.job.service_type),
        nullableString(input.job.kael_problem_identified) ?? nullableString(input.job.description),
      ].filter((part): part is string => Boolean(part)).join(" · ")
      : "";
    const vision = await analyzeDescription(
      input.safeMessage, visionContext, input.visionPhotoUrls, input.secrets,
      input.spendGate, input.input.language,
    );
    return { workerVisionFinding: vision.success
      ? buildSafeWorkerVisionFinding(vision.analysis, input.job ? nullableString(input.job.service_type) : null)
      : null, normalChatImageAnalysis: null };
  } catch (err) {
    console.warn("worker-assist vision analysis threw; continuing without findings", {
      sessionId: input.sessionId, errorName: err instanceof Error ? err.name : typeof err,
    });
    return { workerVisionFinding: null, normalChatImageAnalysis: null };
  }
}

async function persistWorkerNormalChatImageAnalysis(
  input: Parameters<typeof runWorkerKaelAssistant>[0],
  analysis: NormalChatImageAnalysis,
) {
  const workerTurnId = asString(input.claim.worker_turn_id);
  const sourceTurn = await dbQuery<Record<string, unknown>>(
    input.client.from("kael_worker_chat_turns")
      .select("id, turn_index, safe_metadata")
      .eq("id", workerTurnId)
      .eq("session_id", input.sessionId)
      .eq("role", "worker")
      .is("job_id", null)
      .single(),
  );
  if (sourceTurn.error || !sourceTurn.data) {
    apiFailure("DB_ERROR", "Không thể lưu bằng chứng ảnh trong phiên Kael", 500);
  }
  const safeMetadata = {
    ...asRecord(sourceTurn.data.safe_metadata),
    normal_chat_image_analysis: {
      schema_version: "normal_chat_image_analysis.v1",
      source_turn_id: workerTurnId,
      source_turn_index: asNumber(sourceTurn.data.turn_index),
      ...analysis,
    },
  };
  const saved = await dbQuery<Array<Record<string, unknown>>>(
    input.client.from("kael_worker_chat_turns")
      .update({ safe_metadata: safeMetadata })
      .eq("id", workerTurnId)
      .eq("session_id", input.sessionId)
      .eq("role", "worker")
      .is("job_id", null)
      .select("id"),
  );
  if (saved.error || !saved.data?.length) {
    apiFailure("DB_ERROR", "Không thể lưu bằng chứng ảnh trong phiên Kael", 500);
  }
}

async function finalizeWorkerKaelChatTurn(input: {
  client: DbClient;
  ctx: MobileApiContext;
  sessionId: string;
  input: WorkerKaelChatTurnInput;
  sessionJobId: string | null;
  answer: WorkerAssistAnswer;
  needsInitialTitle: boolean;
  claim: Record<string, unknown>;
  claimId: string;
  reasoning?: KaelReasoningReporter;
  response?: KaelResponseReporter;
  safeMessage: string;
  normalChatSession?: boolean;
  secrets?: EdgeAiSecrets;
}) {
  await updateKaelProgress(input.client, { table: "kael_worker_chat_sessions", id: input.sessionId }, {
    stage: "worker_assist", status: "running", progress: 0.8,
  });
  if (input.answer.guardrail_reason && isWorkerAssistGuardrailReason(input.answer.guardrail_reason)) {
    await auditGuardrailTripBestEffort(input.client, {
      jobId: input.sessionJobId, actorId: input.ctx.user.id, actorRole: "worker",
      surface: "worker_kael_chat", reason: input.answer.guardrail_reason,
      guardrailLabel: input.answer.guardrail_reason,
      source: input.answer.guardrail_source ??
        (input.answer.guardrail_reason === "MONEY_OR_STATUS_MUTATION"
          ? "boundary_guard" : input.answer.guardrail_reason === "semantic_guardrail"
          ? "semantic_self_check" : "self_check"),
      safeMetadata: { session_id: input.sessionId },
    });
  }
  if (input.needsInitialTitle) await persistWorkerKaelSessionTitle(input);
  let completed: Record<string, unknown>;
  try {
    completed = await completeWorkerKaelChatTurn(input.client, {
      answer: input.answer, claimId: input.claimId, jobId: input.sessionJobId,
      requestId: asString(input.claim.request_id), sessionId: input.sessionId,
      workerId: input.ctx.user.id, workerTurnId: asString(input.claim.worker_turn_id),
    });
  } catch (error) {
    await releaseWorkerKaelTurnClaim(input.client, {
      claimId: input.claimId, discard: false, requestId: asString(input.claim.request_id),
      sessionId: input.sessionId, workerId: input.ctx.user.id,
    });
    throw error;
  }
  if (asBoolean(completed.stale)) {
    apiFailure("WORKFLOW_STALE", "Trạng thái công việc đã đổi trong lúc Kael xử lý. Vui lòng gửi lại yêu cầu.", 409);
  }
  if (input.normalChatSession && input.secrets) {
    await summarizeNormalChatSessionIfDue(
      input.client,
      { actorRole: "worker", actorId: input.ctx.user.id, sessionId: input.sessionId },
      input.secrets,
      input.input.language,
    ).catch((error) => console.warn("normal worker Kael memory refresh skipped", {
      sessionId: input.sessionId,
      errorName: error instanceof Error ? error.name : typeof error,
    }));
  }
  input.response?.complete(input.answer.text);
  await updateKaelProgress(input.client, { table: "kael_worker_chat_sessions", id: input.sessionId }, {
    stage: "worker_assist", status: "completed", progress: 1,
  });
  const response = await getWorkerKaelChat(input.ctx, input.sessionId);
  input.reasoning?.complete({
    fallbackUsed: input.answer.fallback_used,
    summary: input.answer.public_reasoning_summary ?? [],
  });
  return response;
}

function workerReasoningCompletion(
  language: "vi" | "en",
  fallbackUsed: boolean,
  existing = false,
) {
  if (language === "en") {
    if (existing) return "The already saved reply has been synchronized.";
    return fallbackUsed
      ? "Kael completed a safe alternative reply."
      : "Kael completed and saved a safe reply.";
  }
  if (existing) return "Ph\u1ea3n h\u1ed3i \u0111\u00e3 l\u01b0u \u0111\u01b0\u1ee3c \u0111\u1ed3ng b\u1ed9.";
  return fallbackUsed
    ? "Kael \u0111\u00e3 ho\u00e0n t\u1ea5t m\u1ed9t ph\u1ea3n h\u1ed3i thay th\u1ebf an to\u00e0n."
    : "Kael \u0111\u00e3 ho\u00e0n t\u1ea5t v\u00e0 l\u01b0u ph\u1ea3n h\u1ed3i an to\u00e0n.";
}

async function persistWorkerKaelSessionTitle(
  input: Pick<Parameters<typeof finalizeWorkerKaelChatTurn>[0], "client" | "sessionId" | "input" | "safeMessage" | "answer">,
) {
  const title = buildWorkerKaelSessionTitle(input.safeMessage, input.answer.session_title, input.input.language);
  const titleResult = await dbQuery<Record<string, unknown>>(
    input.client.from("kael_worker_chat_sessions").update({ title }).eq("id", input.sessionId)
      .is("title", null).select("id").maybeSingle(),
  );
  if (titleResult.error) {
    console.warn("worker Kael session title persistence failed", {
      sessionId: input.sessionId, errorCode: titleResult.error.code ?? "DB_ERROR",
    });
  }
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
    job_id: nullableString(row.job_id),
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

export async function requireWorkerKaelChatJob(
  client: DbClient,
  ctx: MobileApiContext,
  jobId: string,
) {
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    statuses: ACTIVE_WORKER_JOB_STATUSES,
    select:
      "id, status, customer_id, worker_id, quote_mode, service_type, description, address_district, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, final_price, worker_commission_level, worker_commission_rate_bps, kael_worker_brief_core",
  });
  return { ...job, kael_worker_brief_guidance: projectWorkerJobBrief(job, ctx.user.id) };
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

// General chat photos live in the worker's own kael-chat-media folder: the same upload intent,
// ownership, retention and location-metadata checks as customer normal chat apply before signing.
async function prepareWorkerGeneralChatVisionUrls(ctx: MobileApiContext, mediaRefs: string[]) {
  const refs = await validateAndConsumeKaelChatEvidenceMediaRefs(ctx, mediaRefs, ctx.user.id);
  return createSignedVisionUrls(ctx, buildKaelVisionValidationEvidence([], refs), ctx.user.id);
}
