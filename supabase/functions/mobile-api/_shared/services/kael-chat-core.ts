// Edge service kael-chat engine (C4 6a): the turn/estimate/boundary/demanding pipeline + session
// primitives behind the kael-chat API (kael-chat.service.ts). Split from the API layer to stay under
// the structure cap. Imported one-way by kael-chat.service.ts (no back-import).
import { asNumber } from "./coercions.ts";
import { db, type DbClient } from "./db.ts";
import { KAEL_CHAT_HARD_COST_CAP_USD, asKaelStoredSentiment, estimatePriceSourceFromStageLogs, formatKaelEstimateText, kaelServiceLabelVi, sourceTrustSecretsForRequest } from "./_shared.ts";
import { buildKaelConversationContext, demandingCustomerSessionMetadata, demandingCustomerTurnMetadata, diagnosisScopeWithEvidenceRequest, diagnosisScopeWithGroundedAnswer, diagnosisScopeWithQuestion, loadKaelChatAnalysisState, mergeKaelCustomerDetailForReanalysis, persistDiagnosisScopeArtifact } from "./kael-chat-case-work.ts";
import { appendKaelSystemTurn, updateKaelSession } from "./kael-chat-session-store.ts";
import type { KaelChatStatus } from "../../../_shared/contracts.ts";
import { auditGuardrailTripBestEffort, logApiCalls, apiLogPurposeForPipelineStage } from "./audit.ts";
import { guardDemandingResponseText } from "./chat.service.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { buildDemandingCustomerResponse, buildEstimateCardOutput, buildFocusedClarificationQuestion, buildKaelMissingInfoArtifactProposal, buildPriceEvidenceUnavailableArtifact, buildProfileSafetyFlags, buildSafetyFirstElectricalEstimate, detectDemandingCustomerPatterns, deterministicSafetyGuidance, getKaelPerformanceProfile, isGroundedClarificationAnswer, kaelDiagnosisScopeArtifactSchema, prependDeterministicSafetyGuidance, recordDemandingCustomerInteraction, resolveCaseWorkEvidenceRequest, resolveIntakeFactCoverage, runKaelPipeline, updateKaelProgress, type EdgeAiSecrets, type PipelineResult } from "../kael/index.ts";
import { isElectricalPlaybookEnabled } from "../kael/playbooks/electrical.ts";
import { guardOutput } from "../kael/kael-guardrails/output-gateway.ts";
import { isKaelAiKillSwitchEnabled } from "../kael/kael-guardrails/spend-gate.ts";
import {
  sanitizeCustomerCaseEvidenceText,
  sanitizeUntrustedEvidenceList,
} from "../kael/untrusted-evidence.ts";
import { normalizeServiceAreaDistrict, sanitizeForLLM } from "../../../_shared/domain.ts";
import type { KaelChatCreateInput, ServiceType } from "../../../_shared/domain.ts";
import type { KaelDiagnosisScopeArtifact } from "../kael/artifact-contract.ts";
import { buildSafetyFirstKaelClarification, persistentKaelSafetySignals, resolveKaelResponseSafetySignals } from "./kael-chat-intake-safety.ts";
import { maybeApplyKaelBoundaryGuard } from "./kael-chat-boundary.ts";
import { maybeHandleDeterministicClarificationReply } from "./kael-chat-clarification.service.ts";
import {
  buildKaelEstimateAnalysisEvidence,
  buildKaelEstimateMarketEvidence,
} from "./kael-chat-estimate-support.ts";
import {
  intakeObservationMetadata,
  kaelServiceLabelEn,
  withIntakeSafetyGuidance,
} from "./kael-chat-core-support.ts";
export { maybeApplyKaelBoundaryGuard };
const KAEL_CHAT_SOFT_COST_CAP_USD = 0.5;

export async function advanceKaelChatEstimate(
  ctx: MobileApiContext,
  sessionId: string,
  input: Required<Pick<KaelChatCreateInput, "service_type">> & {
    message?: string;
    problem_chips?: string[];
    photo_urls?: string[];
    vision_evidence?: KaelDiagnosisScopeArtifact["evidence"];
    address_district?: string;
    language?: "vi" | "en";
    persisted_safety_signals?: string[];
  },
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const progressTarget = { table: "kael_chat_sessions" as const, id: sessionId };
  const llmClarificationEnabled = true;
  const language = input.language ?? "vi";
  const electricalPlaybookEnabled = input.service_type === "electrical" &&
    isElectricalPlaybookEnabled();
  const message = sanitizeForLLM(input.message ?? "");
  const safeCustomerEvidence = sanitizeCustomerCaseEvidenceText(message);
  const durableCustomerDetail = safeCustomerEvidence;
  const problemChips = sanitizeUntrustedEvidenceList(input.problem_chips ?? []);
  const earlySafetySignals = persistentKaelSafetySignals(
    message,
    input.service_type,
    input.persisted_safety_signals,
  );
  if (await maybeApplyKaelBoundaryGuard(
    client,
    sessionId,
    message,
    input.service_type,
    {
      actorId: ctx.user.id,
      jobId: null,
      language,
      persistedSafetySignals: earlySafetySignals,
      progressTarget,
    },
  )) return;
  const { artifact: initialArtifact, currentCostUsd, persistedTurnCount } = await loadKaelChatAnalysisState(
    client,
    sessionId,
    input.service_type,
    durableCustomerDetail || problemChips.join(" ") || input.service_type,
  );
  let artifact = initialArtifact;
  const pendingClarificationSlot = artifact.next_action.kind === "ask_question" &&
      artifact.missing_facts.length === 1
    ? artifact.missing_facts[0]
    : null;
  if (pendingClarificationSlot && await maybeHandleDeterministicClarificationReply(
    client,
    {
      artifact,
      customerEvidence: safeCustomerEvidence,
      language,
      pendingSlot: pendingClarificationSlot,
      progressTarget,
      safetySignals: earlySafetySignals,
      sessionId,
    },
  )) return;
  if (pendingClarificationSlot && isGroundedClarificationAnswer(safeCustomerEvidence)) {
    artifact = diagnosisScopeWithGroundedAnswer(
      artifact,
      pendingClarificationSlot,
      durableCustomerDetail,
    );
    await persistDiagnosisScopeArtifact(client, sessionId, artifact);
  }
  if (artifact.next_action.kind === "escalate") {
    const escalationArtifact = kaelDiagnosisScopeArtifactSchema.parse({
      ...artifact,
      quote_ready: false,
      next_action: artifact.next_action,
      updated_at: new Date().toISOString(),
    });
    await persistDiagnosisScopeArtifact(client, sessionId, escalationArtifact);
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "clarification",
      text: prependDeterministicSafetyGuidance(
        language === "en"
          ? "Kael is not yet confident enough to provide a safe offer. A support specialist needs to review the collected information."
          : "Kael chưa đủ chắc chắn để báo giá an toàn. Yêu cầu này cần người hỗ trợ xem lại thông tin đã thu thập.",
        earlySafetySignals,
        language,
      ),
      nextStatus: "active",
      metadata: {
        diagnosis_scope: escalationArtifact,
        escalation_reason: artifact.next_action.reason,
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "clarification",
      status: "failed",
      progress: 1,
      failureReason: artifact.next_action.reason,
    });
    return;
  }
  if (currentCostUsd >= KAEL_CHAT_HARD_COST_CAP_USD) {
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "error",
      text: prependDeterministicSafetyGuidance(
        language === "en"
          ? "Kael has paused further analysis in this session to keep AI usage safe. You can use an existing validated offer or start a new session if needed."
          : "Kael tạm dừng phân tích thêm cho phiên này để giữ ngân sách AI an toàn. Bạn có thể đặt thợ từ ước tính đã có hoặc tạo phiên mới nếu cần.",
        earlySafetySignals,
        language,
      ),
      nextStatus: "active",
      metadata: {
        budget_exceeded: true,
        hard_cap_usd: KAEL_CHAT_HARD_COST_CAP_USD,
        total_cost_usd: currentCostUsd,
        persisted_turn_count: persistedTurnCount,
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
    const question = prependDeterministicSafetyGuidance(
      language === "en"
        ? "Which Ho Chi Minh City district is the apartment in? Kael uses it to validate the area and eligible workers."
        : "Bạn cho Kael biết quận ở TP.HCM để ước tính đúng khu vực và tìm thợ phù hợp.",
      earlySafetySignals,
      language,
    );
    artifact = diagnosisScopeWithQuestion(artifact, ["address_district"], question, 0.25);
    await persistDiagnosisScopeArtifact(client, sessionId, artifact);
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "clarification",
      text: question,
      nextStatus: "active",
      metadata: {
        artifact_proposal: buildKaelMissingInfoArtifactProposal({
          missingFields: ["address_district"],
          question,
        }),
        diagnosis_scope: artifact,
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "clarification",
      status: "completed",
      progress: 1,
    });
    return;
  }

  // When smart clarification is on, let intake-diagnosis ask a CONTEXTUAL question
  // instead of this generic length-heuristic prompt (STRUCTURES.md A4).
  if (!llmClarificationEnabled && safeCustomerEvidence.length < 10 && problemChips.length === 0) {
    const question = prependDeterministicSafetyGuidance(
      buildFocusedClarificationQuestion("symptom", language),
      earlySafetySignals,
      language,
    );
    artifact = diagnosisScopeWithQuestion(artifact, ["description"], question, 0.3);
    await persistDiagnosisScopeArtifact(client, sessionId, artifact);
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "clarification",
      text: question,
      nextStatus: "active",
      metadata: {
        artifact_proposal: buildKaelMissingInfoArtifactProposal({
          missingFields: ["description"],
          question,
        }),
        diagnosis_scope: artifact,
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "clarification",
      status: "completed",
      progress: 1,
    });
    return;
  }

  let conversationContext: string | undefined;
  let priorClarificationCount = 0;
  let previousAnalysisReceipt: Record<string, unknown> | undefined;
  if (llmClarificationEnabled) {
    const convo = await buildKaelConversationContext(client, sessionId);
    conversationContext = convo.context;
    priorClarificationCount = convo.clarificationCount;
    previousAnalysisReceipt = convo.previousAnalysisReceipt;
  }
  const customerAnalysisDetail = mergeKaelCustomerDetailForReanalysis(
    artifact,
    durableCustomerDetail,
  );

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
        description: customerAnalysisDetail,
        district,
        photoUrls: input.photo_urls ?? [],
        intakeDiagnosisEnabled: llmClarificationEnabled,
        conversationContext,
        clarificationCount: priorClarificationCount,
        priorProfileFacts: artifact.facts,
        priorSafetySignals: earlySafetySignals,
        language,
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
      text: prependDeterministicSafetyGuidance(
        language === "en"
          ? "Kael cannot analyze this right now. Please try again in a few minutes."
          : "Kael chưa thể phân tích lúc này. Bạn thử gửi lại sau ít phút.",
        earlySafetySignals,
        language,
      ),
      nextStatus: "active",
    });
    return;
  }

  const responseSafetySignals = resolveKaelResponseSafetySignals({
    electricalPlaybookEnabled,
    earlySafetySignals,
    pipelineSafetySignals: pipeline.success ? pipeline.safetySignals : undefined,
    intakeObservation: pipeline.intakeObservation,
  });
  const criticalSafetyGuidance = deterministicSafetyGuidance(
    responseSafetySignals,
    language,
  );

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
      const missingSlots = pipeline.clarification?.missingSlots ?? [];
      const focusedFallback = buildFocusedClarificationQuestion(
        missingSlots[0] ?? "service_scope",
        language,
      );
      const checked = guardOutput({
        text: pipeline.clarification?.question ?? "",
        actor: "customer",
        language,
        surface: "kael_chat_clarification",
        fallbackText: focusedFallback,
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
      const safetyFirstClarification = buildSafetyFirstKaelClarification({
        providerText: checked.text,
        focusedFallback,
        safetySignals: responseSafetySignals,
        language,
      });
      const safeQuestion = safetyFirstClarification.question;
      const sentiment = pipeline.clarification?.customerSentiment;
      artifact = diagnosisScopeWithQuestion(
        artifact,
        missingSlots.length > 0 ? missingSlots : ["description"],
        safeQuestion,
        0.4,
        customerAnalysisDetail,
      );
      await Promise.all([
        persistDiagnosisScopeArtifact(client, sessionId, artifact),
        appendKaelSystemTurn(client, sessionId, {
          contentType: "clarification",
          text: safetyFirstClarification.visibleText,
          nextStatus: "active",
          metadata: {
            artifact_proposal: buildKaelMissingInfoArtifactProposal({
              missingFields: missingSlots.length > 0 ? missingSlots : ["description"],
              question: safeQuestion,
              confidence: 0.4,
              artifactType: "ai_notes",
            }),
            clarification_source: safetyFirstClarification.safetyFallbackUsed
              ? "safety_fallback"
              : checked.used_fallback
              ? "fallback"
              : "ai",
            diagnosis_scope: artifact,
            ...intakeObservationMetadata(pipeline.intakeObservation),
            ...(sentiment ? { customer_sentiment: sentiment } : {}),
          },
          ...(sentiment
            ? { sessionMetadata: { last_customer_sentiment: sentiment } }
            : {}),
        }),
        updateKaelProgress(client, progressTarget, {
          stage: "clarification",
          status: "completed",
          progress: 1,
        }),
      ]);
      return;
    }
    if (pipeline.code === "SERVICE_MISMATCH") {
      const suggested = pipeline.suggestedService;
      const mismatchText = language === "en"
        ? (suggested
          ? `Your description appears to match ${kaelServiceLabelEn(suggested)}. Go back and select that service so Kael can analyze it accurately.`
          : "Your description does not match the selected service. Go back and select the appropriate service for an accurate analysis.")
        : (suggested
          ? `Mô tả của bạn nghiêng về dịch vụ ${kaelServiceLabelVi(suggested)}. Bạn quay lại chọn đúng dịch vụ để Kael ước tính chính xác.`
          : "Mô tả của bạn không khớp với dịch vụ đang chọn. Bạn quay lại chọn đúng dịch vụ phù hợp để Kael ước tính.");
      await appendKaelSystemTurn(client, sessionId, {
        contentType: "error",
        text: withIntakeSafetyGuidance(
          mismatchText,
          responseSafetySignals,
          language,
        ),
        nextStatus: "unsupported",
        metadata: {
          boundary_reason: "service_mismatch_llm",
          ...(pipeline.policyReasonCode
            ? { policy_reason_code: pipeline.policyReasonCode }
            : {}),
          ...intakeObservationMetadata(pipeline.intakeObservation),
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
    if (pipeline.code === "NO_BASELINE") {
      artifact = buildPriceEvidenceUnavailableArtifact(artifact, {
        customerDetail: customerAnalysisDetail,
        scopeSummary: customerAnalysisDetail,
      });
      await persistDiagnosisScopeArtifact(client, sessionId, artifact);
      await appendKaelSystemTurn(client, sessionId, {
        contentType: "error",
        text: withIntakeSafetyGuidance(
          language === "en"
            ? "Kael has identified the scope but does not have validated price evidence for this case. It needs review before any offer is shown."
            : "Kael đã xác định phạm vi nhưng chưa có dữ liệu giá đã kiểm chứng cho trường hợp này. Yêu cầu cần được rà soát trước khi hiển thị báo giá.",
          responseSafetySignals,
          language,
        ),
        nextStatus: "active",
        metadata: {
          diagnosis_scope: artifact,
          quote_readiness: "validated_price_evidence_unavailable",
          ...intakeObservationMetadata(pipeline.intakeObservation),
        },
      });
      await updateKaelProgress(client, progressTarget, {
        stage: "price_synthesis",
        status: "failed",
        progress: 1,
        failureReason: "validated_price_evidence_unavailable",
      });
      return;
    }
    const clarificationText = pipeline.code === "UNSUPPORTED"
      ? pipeline.error
      : (language === "en"
        ? "Kael does not yet have enough safe evidence to estimate. Add more detail or send a clearer photo."
        : "Kael chưa đủ dữ liệu an toàn để ước tính. Bạn mô tả thêm hoặc gửi ảnh rõ hơn.");
    if (pipeline.code !== "UNSUPPORTED") {
      artifact = diagnosisScopeWithQuestion(
        artifact,
        ["description_or_photo"],
        clarificationText,
        0.35,
        customerAnalysisDetail,
      );
      await persistDiagnosisScopeArtifact(client, sessionId, artifact);
    }
    await appendKaelSystemTurn(client, sessionId, {
      contentType: pipeline.code === "UNSUPPORTED" ? "error" : "clarification",
      text: withIntakeSafetyGuidance(
        clarificationText,
        responseSafetySignals,
        language,
      ),
      nextStatus: "active",
      metadata: {
        ...intakeObservationMetadata(pipeline.intakeObservation),
        ...(pipeline.policyReasonCode
          ? { policy_reason_code: pipeline.policyReasonCode }
          : {}),
        ...(pipeline.code === "UNSUPPORTED" ? {} : {
          artifact_proposal: buildKaelMissingInfoArtifactProposal({
            missingFields: ["description_or_photo"],
            question: clarificationText,
            confidence: 0.35,
            artifactType: "ai_notes",
          }),
          diagnosis_scope: artifact,
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
  const estimate = buildSafetyFirstElectricalEstimate(
    pipeline.estimate,
    responseSafetySignals,
    language,
  );
  const profile = getKaelPerformanceProfile(input.service_type);
  if (!profile) {
    apiFailure("UNSUPPORTED_SERVICE", language === "en" ? "This service does not have a valid Case Work profile" : "Dịch vụ chưa có hồ sơ Case Work hợp lệ", 400);
  }
  const evidenceGateDecision = artifact.facts.evidence_gate_decision;
  const evidenceRequest = resolveCaseWorkEvidenceRequest({
    serviceType: input.service_type,
    problemCategory: estimate.problem_category,
    customerMessage: safeCustomerEvidence,
    evidence: artifact.evidence,
    evidenceDecision: evidenceGateDecision === "confirmed" || evidenceGateDecision === "skipped"
      ? evidenceGateDecision
      : undefined,
    language,
  });
  if (evidenceRequest && !criticalSafetyGuidance) {
    artifact = diagnosisScopeWithEvidenceRequest(
      artifact,
      evidenceRequest,
      {
        customerDetail: customerAnalysisDetail,
        problemSummary: estimate.problem_summary,
        complexity: estimate.complexity,
        problemChips,
        workerRequirements: profile.worker_capabilities,
        confidence: estimate.confidence,
      },
    );
    await persistDiagnosisScopeArtifact(client, sessionId, artifact);
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "clarification",
      text: withIntakeSafetyGuidance(
        evidenceRequest.prompt,
        responseSafetySignals,
        language,
      ),
      nextStatus: "active",
      metadata: {
        artifact_proposal: buildKaelMissingInfoArtifactProposal({
          missingFields: [evidenceRequest.blocker],
          question: evidenceRequest.prompt,
          confidence: Math.min(estimate.confidence, 0.65),
          artifactType: "ai_notes",
        }),
        diagnosis_scope: artifact,
        ...intakeObservationMetadata(pipeline.intakeObservation),
      },
    });
    await updateKaelProgress(client, progressTarget, {
      stage: "clarification",
      status: "completed",
      progress: 1,
    });
    return;
  }
  const profileFactCoverage = resolveIntakeFactCoverage({
    serviceType: input.service_type,
    problemSlug: estimate.problem_category,
    profileFacts: pipeline.profileFacts ?? {},
    providerMissingSlots: [],
    providerNeedsClarification: false,
    electricalPlaybookEnabled,
  });
  const safetyFlags = buildProfileSafetyFlags(profile, responseSafetySignals, language);
  const quoteBlockers = [
    ...profileFactCoverage.missing.map((driver) => `missing_profile_fact:${driver}`),
    ...safetyFlags.map((flag) => `safety_gate:${flag.code}`),
    ...(estimate.needs_inspection ? ["onsite_inspection_required"] : []),
  ];
  const quoteReady = quoteBlockers.length === 0;
  const quoteReadyArtifact = kaelDiagnosisScopeArtifactSchema.parse({
    ...artifact,
    case_phase: quoteReady ? "offer_review" : "analysis",
    facts: {
      ...artifact.facts,
      ...profileFactCoverage.facts,
      latest_customer_detail: customerAnalysisDetail,
      address_district: district,
      problem_summary: estimate.problem_summary,
      complexity: estimate.complexity,
      problem_chips: problemChips,
      needs_inspection: estimate.needs_inspection === true,
      safety_signals: responseSafetySignals,
    },
    missing_facts: [...profileFactCoverage.missing],
    evidence: artifact.evidence,
    safety_flags: safetyFlags,
    scope_summary: estimate.problem_summary,
    quote_ready: quoteReady,
    quote_blockers: quoteBlockers,
    worker_requirements: profile.worker_capabilities,
    confidence: estimate.confidence,
    next_action: quoteReady
      ? { kind: "prepare_offer" }
      : {
        kind: "escalate",
        reason: safetyFlags[0]?.customer_message ??
          estimate.needs_inspection_reason ??
          quoteBlockers[0] ??
          "manual_review_required",
      },
    updated_at: new Date().toISOString(),
  });
  await updateKaelSession(client, sessionId, {
    case_phase: quoteReady ? "offer_review" : "analysis",
    diagnosis_scope: quoteReadyArtifact,
  });
  const estimateCardV3 = buildEstimateCardOutput({
    estimate,
    language,
    priceSource: estimate.needs_inspection
      ? "inspection_required"
      : estimatePriceSourceFromStageLogs(pipeline.stageLogs),
    baselineUsed:
      `${input.service_type}:${pipeline.serviceProblemId}:${estimate.complexity}`,
    analysisEvidence: buildKaelEstimateAnalysisEvidence(
      artifact,
      input.vision_evidence,
    ),
    marketEvidence: buildKaelEstimateMarketEvidence(pipeline.stageLogs),
    marketSignals: estimate.market_signals ?? estimate.needs_inspection_reason,
    needsInspectionReason: estimate.needs_inspection_reason,
    previousAnalysisReceipt,
    visionAnalysis: pipeline.visionAnalysis,
    visionFindings: pipeline.visionAnalysis?.problemSummary,
  });
  await appendKaelSystemTurn(client, sessionId, {
    contentType: "estimate",
    text: withIntakeSafetyGuidance(
      formatKaelEstimateText(estimate, language),
      responseSafetySignals,
      language,
    ),
    nextStatus: quoteReady ? "estimate_ready" : "active",
    estimate,
    costUsd,
    metadata: {
      estimate,
      estimate_card_v3: estimateCardV3,
      artifact_proposal: estimateCardV3.artifact_proposal,
      diagnosis_scope: quoteReadyArtifact,
      fallback_used: pipeline.fallbackUsed,
      service_problem_id: pipeline.serviceProblemId,
      // Kept beside `estimate`, not inside it: the estimate object is the customer-facing
      // shape, and the reference band is server-only learning input. Turn reads for the
      // client select text columns and never safe_metadata.
      reference_price_min: pipeline.referencePriceMin ?? null,
      reference_price_max: pipeline.referencePriceMax ?? null,
      ...intakeObservationMetadata(pipeline.intakeObservation),
      photo_count: input.photo_urls?.length ?? 0,
      budget_soft_cap_reached:
        currentCostUsd + costUsd >= KAEL_CHAT_SOFT_COST_CAP_USD,
    },
    ...(pipeline.customerSentiment
      ? { sessionMetadata: { last_customer_sentiment: pipeline.customerSentiment } }
      : {}),
  });
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
    language?: "vi" | "en";
  },
) {
  if (isKaelAiKillSwitchEnabled()) return false;
  const alreadyHardStopped = input.metadata.demanding_customer_hard_escalation === true;
  const safeInteractionEvidence = sanitizeCustomerCaseEvidenceText(input.message);
  const detection = detectDemandingCustomerPatterns({
    message: safeInteractionEvidence,
    qaCount: input.qaCount,
    cancelCount: asNumber(input.metadata.demanding_customer_cancel_count),
    // Prior-turn intake-diagnosis sentiment fills a keyword
    // gap (soft only). Keyword detection above stays the primary, deterministic path.
    llmSentiment: asKaelStoredSentiment(input.metadata.last_customer_sentiment),
  });
  const hasExplicitDemandSignal = detection.pressureSignals.length > 0 ||
    detection.legitimateConcernSignals.some((signal) => signal !== "qa_loop_above_3");
  if (!alreadyHardStopped && !hasExplicitDemandSignal) return false;

  const effectiveDetection = alreadyHardStopped && detection.escalationLevel !== "hard"
    ? {
      ...detection,
      nuance: detection.nuance === "none" ? "pressure" as const : detection.nuance,
      expectedNuance: detection.expectedNuance === "none" ? "pressure" as const : detection.expectedNuance,
      pressureScore: Math.max(detection.pressureScore, 1),
      escalationLevel: "hard" as const,
    }
    : detection;
  const language = input.language ?? (input.metadata.language === "en" ? "en" : "vi");
  const response = buildDemandingCustomerResponse(effectiveDetection, {}, language);
  const guarded = guardDemandingResponseText(response.responseText, language);
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
    message: safeInteractionEvidence,
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

export {
  assertKaelSessionOwnership,
  findExistingKaelSessionByClientRequest,
  insertKaelTurn,
  updateKaelSession,
} from "./kael-chat-session-store.ts";
