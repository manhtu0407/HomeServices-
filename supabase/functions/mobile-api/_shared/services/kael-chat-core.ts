// Edge service kael-chat engine (C4 6a): the turn/estimate/boundary/demanding pipeline + session
// primitives behind the kael-chat API (kael-chat.service.ts). Split from the API layer to stay under
// the structure cap. Imported one-way by kael-chat.service.ts (no back-import).

import { asKaelTurnRole, asNumber, asRecord, asString, nullableNumber, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { KAEL_CHAT_HARD_COST_CAP_USD, asKaelStoredSentiment, compactMetadata, estimatePriceSourceFromStageLogs, formatKaelEstimateText, kaelServiceLabelVi, sourceTrustSecretsForRequest } from "./_shared.ts";
import type { KaelChatTurnRole } from "./_shared.ts";
import type { KaelChatStatus } from "../../../_shared/contracts.ts";
import { auditGuardrailTripBestEffort, logApiCalls, apiLogPurposeForPipelineStage } from "./audit.ts";
import { guardDemandingResponseText } from "./chat.service.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { buildDemandingCustomerResponse, buildEstimateCardOutput, buildKaelMissingInfoArtifactProposal, detectDemandingCustomerPatterns, recordDemandingCustomerInteraction, runKaelPipeline, updateKaelProgress, type EdgeAiSecrets, type PipelineResult } from "../kael/index.ts";
import { evaluateMessageBoundary } from "../kael/boundary-guard.ts";
import { guardOutput } from "../kael/output-gateway.ts";
import { readKaelOptimizationFlags } from "../kael/cost-tracking.ts";
import { normalizeServiceAreaDistrict, sanitizeForLLM } from "../../../_shared/domain.ts";
import type { KaelChatCreateInput, ServiceType } from "../../../_shared/domain.ts";

type ExistingKaelSessionByClientRequest =
  | { kind: "ready"; sessionId: string }
  | { kind: "pending" }
  | null;

const KAEL_CHAT_SOFT_COST_CAP_USD = 0.5;

export async function advanceKaelChatEstimate(
  ctx: MobileApiContext,
  sessionId: string,
  input: Required<Pick<KaelChatCreateInput, "service_type">> & {
    message?: string;
    problem_chips?: string[];
    photo_urls?: string[];
    address_district?: string;
  },
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const progressTarget = { table: "kael_chat_sessions" as const, id: sessionId };
  const llmClarificationEnabled =
    readKaelOptimizationFlags().KAEL_OPT_LLM_CLARIFICATION_ENABLED;
  const currentCostUsd = await getKaelChatCostUsd(client, sessionId);
  if (currentCostUsd >= KAEL_CHAT_HARD_COST_CAP_USD) {
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "error",
      text:
        "Kael tạm dừng phân tích thêm cho phiên này để giữ ngân sách AI an toàn. Bạn có thể đặt thợ từ ước tính đã có hoặc tạo phiên mới nếu cần.",
      nextStatus: "active",
      metadata: {
        budget_exceeded: true,
        hard_cap_usd: KAEL_CHAT_HARD_COST_CAP_USD,
        total_cost_usd: currentCostUsd,
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "intent_classification",
      status: "failed",
      progress: 0,
      failureReason: "budget_exceeded",
    });
    return;
  }

  const district = normalizeServiceAreaDistrict(input.address_district);
  if (!district) {
    const question =
      "\u0042\u1ea1n cho Kael bi\u1ebft qu\u1eadn \u1edf TP.HCM \u0111\u1ec3 \u01b0\u1edbc t\u00ednh \u0111\u00fang khu v\u1ef1c v\u00e0 t\u00ecm th\u1ee3 ph\u00f9 h\u1ee3p.";
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "clarification",
      text: question,
      nextStatus: "active",
      metadata: {
        artifact_proposal: buildKaelMissingInfoArtifactProposal({
          missingFields: ["address_district"],
          question,
        }),
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "clarification",
      status: "completed",
      progress: 1,
    });
    return;
  }

  const message = sanitizeForLLM(input.message ?? "");
  const problemChips = input.problem_chips?.filter(Boolean) ?? [];
  // When smart clarification is on, let intake-diagnosis ask a CONTEXTUAL question
  // instead of this generic length-heuristic prompt (STRUCTURES.md A4).
  if (!llmClarificationEnabled && message.length < 10 && problemChips.length === 0) {
    const question =
      "\u0042\u1ea1n m\u00f4 t\u1ea3 r\u00f5 h\u01a1n v\u1ea5n \u0111\u1ec1 \u0111ang g\u1eb7p: v\u1ecb tr\u00ed, d\u1ea5u hi\u1ec7u v\u00e0 m\u1ee9c \u0111\u1ed9 \u1ea3nh h\u01b0\u1edfng trong c\u0103n h\u1ed9.";
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "clarification",
      text: question,
      nextStatus: "active",
      metadata: {
        artifact_proposal: buildKaelMissingInfoArtifactProposal({
          missingFields: ["description"],
          question,
        }),
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "clarification",
      status: "completed",
      progress: 1,
    });
    return;
  }

  // Boundary guard rejects
  // out-of-scope / prompt-injection / service-mismatch BEFORE any provider
  // call so cost stays zero for declined turns and Kael never emits an
  // estimate that would violate RULES.md #6 (service scope) or #8 (no
  // fake/off-topic data).
  // S2/F6 (§38): semantic injection classifier is intentionally always-on here
  // (do not gate off) — defense-in-depth on the customer Kael chat turn path.
  const boundary = evaluateMessageBoundary(message, input.service_type, {
    semanticInjectionClassifierEnabled: true,
  });
  if (!boundary.ok) {
    console.warn("kael_chat boundary decline", {
      sessionId,
      reason: boundary.reason,
      signalCount: boundary.detectedSignals.length,
    });
    await auditGuardrailTripBestEffort(client, {
      jobId: null,
      actorId: ctx.user.id,
      actorRole: "customer",
      surface: "kael_chat_boundary",
      reason: boundary.reason,
      source: "boundary_guard",
      safeMetadata: {
        session_id: sessionId,
        service_type: input.service_type,
        boundary_signals: boundary.detectedSignals,
      },
    });
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "error",
      text: boundary.declineText,
      nextStatus: "unsupported",
      metadata: {
        boundary_reason: boundary.reason,
        boundary_signals: boundary.detectedSignals,
        ...(boundary.suggestedService
          ? { suggested_service: boundary.suggestedService }
          : {}),
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "intent_classification",
      status: "failed",
      progress: 1,
      failureReason: boundary.reason,
    });
    return;
  }

  let conversationContext: string | undefined;
  let priorClarificationCount = 0;
  if (llmClarificationEnabled) {
    const convo = await buildKaelConversationContext(client, sessionId);
    conversationContext = convo.context;
    priorClarificationCount = convo.clarificationCount;
  }

  const requestId = crypto.randomUUID();
  let pipeline: PipelineResult;
  try {
    await updateKaelProgress(client, progressTarget, {
      stage: "intent_classification",
      status: "queued",
      progress: 0,
    });
    pipeline = await runKaelPipeline(
      {
        serviceType: input.service_type,
        problemChips: problemChips.length > 0 ? problemChips : [input.service_type],
        description: message,
        district,
        photoUrls: input.photo_urls ?? [],
        intakeDiagnosisEnabled: llmClarificationEnabled,
        conversationContext,
        clarificationCount: priorClarificationCount,
        progressTarget,
        actorId: ctx.user.id, // S4/F1 (§38): per-user AI-spend attribution
      },
      client,
      sourceTrustSecretsForRequest(secrets, ctx),
    );
  } catch {
    await updateKaelProgress(client, progressTarget, {
      stage: "intent_classification",
      status: "failed",
      progress: 0,
      failureReason: "pipeline_error",
    });
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "error",
      text: "Kael chưa thể phân tích lúc này. Bạn thử gửi lại sau ít phút.",
      nextStatus: "active",
    });
    return;
  }

  await logApiCalls(
    client,
    pipeline.stageLogs
      .filter((stage) => stage.provider && stage.model)
      .map((stage) => ({
        job_id: null,
        request_id: requestId,
        purpose: apiLogPurposeForPipelineStage(stage.stage),
        provider: stage.provider,
        model: stage.model,
        input_tokens: stage.inputTokens ?? null,
        output_tokens: stage.outputTokens ?? null,
        cost_usd: stage.costUsd ?? null,
        latency_ms: stage.latencyMs,
        success: stage.success,
        error_code: stage.failureReason ?? null,
        safe_metadata: {
          surface: "kael_chat",
          session_id: sessionId,
          ...(stage.cacheStatus ? { cache_status: stage.cacheStatus } : {}),
          ...(stage.safeMetadata ?? {}),
        },
      })),
  );

  if (!pipeline.success) {
    // Intake-diagnosis asked for ONE specific
    // missing detail. Self-check the AI question before showing it (RULES.md #3);
    // fall back to a safe template if it fails screening — never raw AI text.
    if (pipeline.code === "NEEDS_CLARIFICATION") {
      const checked = guardOutput({
        text: pipeline.clarification?.question ?? "",
        actor: "customer",
        language: "vi",
        surface: "kael_chat_clarification",
        fallbackText:
          "Bạn mô tả rõ hơn vấn đề đang gặp: vị trí, dấu hiệu và mức độ ảnh hưởng trong căn hộ.",
      });
      if (checked.used_fallback || !checked.allowed) {
        await auditGuardrailTripBestEffort(client, {
          jobId: null,
          actorId: ctx.user.id,
          actorRole: "customer",
          surface: "kael_chat_clarification",
          reason: checked.reason ?? "self_check",
          guardrailLabel: checked.guardrailLabel ?? null,
          source: checked.reason === "semantic_guardrail"
            ? "semantic_self_check"
            : "self_check",
          safeMetadata: {
            session_id: sessionId,
            clarification_source: "ai",
          },
        });
      }
      const missingSlots = pipeline.clarification?.missingSlots ?? [];
      const sentiment = pipeline.clarification?.customerSentiment;
      await appendKaelSystemTurn(client, sessionId, {
        contentType: "clarification",
        text: checked.text,
        nextStatus: "active",
        metadata: {
          artifact_proposal: buildKaelMissingInfoArtifactProposal({
            missingFields: missingSlots.length > 0 ? missingSlots : ["description"],
            question: checked.text,
            confidence: 0.4,
            artifactType: "ai_notes",
          }),
          clarification_source: checked.used_fallback ? "fallback" : "ai",
          ...(sentiment ? { customer_sentiment: sentiment } : {}),
        },
        ...(sentiment
          ? { sessionMetadata: { last_customer_sentiment: sentiment } }
          : {}),
      });
      await updateKaelProgress(client, progressTarget, {
        stage: "clarification",
        status: "completed",
        progress: 1,
      });
      return;
    }
    if (pipeline.code === "SERVICE_MISMATCH") {
      const suggested = pipeline.suggestedService;
      const mismatchText = suggested
        ? `Mô tả của bạn nghiêng về dịch vụ ${kaelServiceLabelVi(suggested)}. Bạn quay lại chọn đúng dịch vụ để Kael ước tính chính xác.`
        : "Mô tả của bạn không khớp với dịch vụ đang chọn. Bạn quay lại chọn đúng dịch vụ phù hợp để Kael ước tính.";
      await appendKaelSystemTurn(client, sessionId, {
        contentType: "error",
        text: mismatchText,
        nextStatus: "unsupported",
        metadata: {
          boundary_reason: "service_mismatch_llm",
          ...(suggested ? { suggested_service: suggested } : {}),
        },
      });
      await updateKaelProgress(client, progressTarget, {
        stage: "intent_classification",
        status: "failed",
        progress: 1,
        failureReason: "service_mismatch",
      });
      return;
    }
    const clarificationText = pipeline.code === "UNSUPPORTED"
      ? pipeline.error
      : "Kael chưa đủ dữ liệu an toàn để ước tính. Bạn mô tả thêm hoặc gửi ảnh rõ hơn.";
    await appendKaelSystemTurn(client, sessionId, {
      contentType: pipeline.code === "UNSUPPORTED" ? "error" : "clarification",
      text: clarificationText,
      nextStatus: "active",
      metadata: pipeline.code === "UNSUPPORTED"
        ? undefined
        : {
          artifact_proposal: buildKaelMissingInfoArtifactProposal({
            missingFields: ["description_or_photo"],
            question: clarificationText,
            confidence: 0.35,
            artifactType: "ai_notes",
          }),
        },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: pipeline.code === "UNSUPPORTED" ? "intent_classification" : "clarification",
      status: pipeline.code === "UNSUPPORTED" ? "failed" : "completed",
      progress: 1,
      failureReason: pipeline.code === "UNSUPPORTED" ? "unsupported" : undefined,
    });
    return;
  }

  const costUsd = pipeline.stageLogs.reduce(
    (sum, stage) => sum + (stage.costUsd ?? 0),
    0,
  );
  const estimate = pipeline.estimate;
  const estimateCardV3 = buildEstimateCardOutput({
    estimate,
    priceSource: estimate.needs_inspection
      ? "inspection_required"
      : estimatePriceSourceFromStageLogs(pipeline.stageLogs),
    baselineUsed:
      `${input.service_type}:${pipeline.serviceProblemId}:${estimate.complexity}`,
    marketSignals: estimate.market_signals ?? estimate.needs_inspection_reason,
    needsInspectionReason: estimate.needs_inspection_reason,
  });
  await appendKaelSystemTurn(client, sessionId, {
    contentType: "estimate",
    text: formatKaelEstimateText(estimate),
    nextStatus: "estimate_ready",
    estimate,
    costUsd,
    metadata: {
      estimate,
      estimate_card_v3: estimateCardV3,
      artifact_proposal: estimateCardV3.artifact_proposal,
      fallback_used: pipeline.fallbackUsed,
      service_problem_id: pipeline.serviceProblemId,
      photo_count: input.photo_urls?.length ?? 0,
      budget_soft_cap_reached:
        currentCostUsd + costUsd >= KAEL_CHAT_SOFT_COST_CAP_USD,
    },
    ...(pipeline.customerSentiment
      ? { sessionMetadata: { last_customer_sentiment: pipeline.customerSentiment } }
      : {}),
  });
}

export async function maybeApplyKaelBoundaryGuard(
  client: DbClient,
  sessionId: string,
  message: string,
  serviceType: ServiceType,
  auditContext: {
    readonly actorId: string | null;
    readonly jobId: string | null;
  } = { actorId: null, jobId: null },
): Promise<boolean> {
  // S2/F6 (§38): semantic injection classifier is intentionally always-on here
  // (do not gate off) — defense-in-depth on the customer Kael chat path.
  const boundary = evaluateMessageBoundary(message, serviceType, {
    semanticInjectionClassifierEnabled: true,
  });
  if (boundary.ok) return false;
  console.warn("kael_chat boundary decline", {
    sessionId,
    reason: boundary.reason,
    signalCount: boundary.detectedSignals.length,
  });
  await auditGuardrailTripBestEffort(client, {
    jobId: auditContext.jobId,
    actorId: auditContext.actorId,
    actorRole: "customer",
    surface: "kael_chat_boundary",
    reason: boundary.reason,
    source: "boundary_guard",
    safeMetadata: {
      session_id: sessionId,
      service_type: serviceType,
      boundary_signals: boundary.detectedSignals,
    },
  });
  await appendKaelSystemTurn(client, sessionId, {
    contentType: "error",
    text: boundary.declineText,
    nextStatus: "unsupported",
    metadata: {
      boundary_reason: boundary.reason,
      boundary_signals: boundary.detectedSignals,
      ...(boundary.suggestedService
        ? { suggested_service: boundary.suggestedService }
        : {}),
    },
  });
  return true;
}

export async function maybeHandleDemandingCustomerKaelChatTurn(
  client: DbClient,
  input: {
    sessionId: string;
    actorId: string;
    jobId: string | null;
    status: KaelChatStatus;
    metadata: Record<string, unknown>;
    message: string;
    qaCount: number;
  },
) {
  const alreadyHardStopped = input.metadata.demanding_customer_hard_escalation === true;
  const detection = detectDemandingCustomerPatterns({
    message: input.message,
    qaCount: input.qaCount,
    cancelCount: asNumber(input.metadata.demanding_customer_cancel_count),
    // Prior-turn intake-diagnosis sentiment fills a keyword
    // gap (soft only). Keyword detection above stays the primary, deterministic path.
    llmSentiment: asKaelStoredSentiment(input.metadata.last_customer_sentiment),
  });
  if (!alreadyHardStopped && detection.expectedNuance === "none") return false;

  const effectiveDetection = alreadyHardStopped && detection.escalationLevel !== "hard"
    ? {
      ...detection,
      nuance: detection.nuance === "none" ? "pressure" as const : detection.nuance,
      expectedNuance: detection.expectedNuance === "none" ? "pressure" as const : detection.expectedNuance,
      pressureScore: Math.max(detection.pressureScore, 1),
      escalationLevel: "hard" as const,
    }
    : detection;
  const response = buildDemandingCustomerResponse(effectiveDetection);
  const guarded = guardDemandingResponseText(response.responseText);
  if (guarded.trip) {
    await auditGuardrailTripBestEffort(client, {
      jobId: input.jobId,
      actorId: input.actorId,
      actorRole: "customer",
      surface: guarded.trip.surface,
      reason: guarded.trip.reason,
      guardrailLabel: guarded.trip.guardrailLabel ?? null,
      source: guarded.trip.source,
      safeMetadata: { session_id: input.sessionId },
    });
  }

  await recordDemandingCustomerInteraction(client, {
    jobId: input.jobId,
    actorId: input.actorId,
    actorRole: "customer",
    message: input.message,
    detection: effectiveDetection,
    response,
  });
  await appendKaelSystemTurn(client, input.sessionId, {
    contentType: "clarification",
    text: guarded.text,
    nextStatus: response.stopAiLoop
      ? "active"
      : input.status === "estimate_ready"
      ? "estimate_ready"
      : "active",
    metadata: {
      demanding_customer: demandingCustomerTurnMetadata(effectiveDetection, response),
    },
    sessionMetadata: demandingCustomerSessionMetadata(
      input.metadata,
      effectiveDetection,
      response,
    ),
  });
  return true;
}

export async function insertKaelTurn(
  client: DbClient,
  value: Record<string, unknown>,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_turns")
      .insert(value)
      .select("id")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể lưu lượt chat Kael", 500);
  }
  return result.data;
}

export async function updateKaelSession(
  client: DbClient,
  sessionId: string,
  value: Record<string, unknown>,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .update(value)
      .eq("id", sessionId)
      .select("id")
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể cập nhật phiên Kael", 500);
  }
}

export function assertKaelSessionOwnership(
  session: Record<string, unknown>,
  ctx: MobileApiContext,
) {
  if (ctx.role === "admin") return;
  if (session.customer_id === ctx.user.id) return;
  apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
}

export async function findExistingKaelSessionByClientRequest(
  client: DbClient,
  customerId: string,
  clientRequestId: string,
): Promise<ExistingKaelSessionByClientRequest> {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, job_id, status, estimate_ready_at, total_turns")
      .eq("customer_id", customerId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return null;
  const sessionId = asString(result.data.id);
  if (!sessionId) return null;
  const hasMaterializedTurn = (nullableNumber(result.data.total_turns) ?? 0) > 0;
  const hasJob = nullableString(result.data.job_id) !== null;
  const hasEstimate = nullableString(result.data.estimate_ready_at) !== null;
  if (!hasMaterializedTurn && !hasJob && !hasEstimate) {
    return { kind: "pending" };
  }
  return { kind: "ready", sessionId };
}

async function appendKaelSystemTurn(
  client: DbClient,
  sessionId: string,
  input: {
    contentType: "clarification" | "estimate" | "error";
    text: string;
    nextStatus: "active" | "estimate_ready" | "unsupported";
    estimate?: unknown;
    costUsd?: number;
    metadata?: Record<string, unknown>;
    sessionMetadata?: Record<string, unknown>;
  },
) {
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, total_turns, total_cost_usd, safe_metadata")
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  const nextIndex = asNumber(sessionResult.data.total_turns) + 1;
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: nextIndex,
    role: "kael",
    content_type: input.contentType,
    text_content: input.text,
    media_refs: [],
    safe_metadata: input.metadata ?? {},
    cost_usd: input.costUsd ?? null,
  });
  const sessionUpdate: Record<string, unknown> = {
    total_turns: nextIndex,
    total_cost_usd: asNumber(sessionResult.data.total_cost_usd) +
      (input.costUsd ?? 0),
    status: input.nextStatus,
  };
  if (input.nextStatus === "estimate_ready") {
    sessionUpdate.estimate_ready_at = new Date().toISOString();
  }
  if (input.sessionMetadata) {
    sessionUpdate.safe_metadata = compactMetadata({
      ...asRecord(sessionResult.data.safe_metadata),
      ...input.sessionMetadata,
    });
  }
  await updateKaelSession(client, sessionId, sessionUpdate);
}

async function getKaelChatCostUsd(
  client: DbClient,
  sessionId: string,
): Promise<number> {
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, total_cost_usd")
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  return asNumber(sessionResult.data.total_cost_usd);
}

async function buildKaelConversationContext(
  client: DbClient,
  sessionId: string,
): Promise<{ context: string | undefined; clarificationCount: number }> {
  const turnsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_chat_turns")
      .select("turn_index, role, content_type, text_content")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true }),
  );
  const rows = turnsResult.data ?? [];
  const clarificationCount = rows.filter((row) =>
    asString(row.content_type) === "clarification" &&
    asKaelTurnRole(row.role) !== "customer"
  ).length;
  const recent = rows
    .map((row) => ({
      role: asKaelTurnRole(row.role),
      text: nullableString(row.text_content),
    }))
    .filter((turn): turn is { role: KaelChatTurnRole; text: string } =>
      Boolean(turn.text)
    )
    .slice(-8)
    .map((turn) => `${turn.role === "customer" ? "khách" : "kael"}: ${turn.text}`);
  return {
    context: recent.length > 0 ? recent.join("\n") : undefined,
    clarificationCount,
  };
}

function demandingCustomerTurnMetadata(
  detection: ReturnType<typeof detectDemandingCustomerPatterns>,
  response: ReturnType<typeof buildDemandingCustomerResponse>,
) {
  return {
    nuance: detection.nuance,
    expected_nuance: detection.expectedNuance,
    escalation_level: detection.escalationLevel,
    pressure_score: detection.pressureScore,
    legitimate_concern_signals: detection.legitimateConcernSignals,
    pressure_signals: detection.pressureSignals,
    strategy_ids: response.strategyIds,
    admin_queue_priority: response.adminQueuePriority,
    stop_ai_loop: response.stopAiLoop,
  };
}

function demandingCustomerSessionMetadata(
  previousMetadata: Record<string, unknown>,
  detection: ReturnType<typeof detectDemandingCustomerPatterns>,
  response: ReturnType<typeof buildDemandingCustomerResponse>,
) {
  return compactMetadata({
    ...previousMetadata,
    demanding_customer_last_nuance: detection.nuance,
    demanding_customer_escalation_level: detection.escalationLevel,
    demanding_customer_admin_queue_priority: response.adminQueuePriority,
    demanding_customer_stop_ai_loop: response.stopAiLoop,
    demanding_customer_hard_escalation:
      response.stopAiLoop || previousMetadata.demanding_customer_hard_escalation === true,
    demanding_customer_last_at: new Date().toISOString(),
  });
}
