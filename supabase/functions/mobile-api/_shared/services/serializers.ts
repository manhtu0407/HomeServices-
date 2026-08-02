import type { EdgeKaelCaseWorkPhase, KaelChatNextAction, KaelChatStatus } from "../../../_shared/contracts.ts";
import { KAEL_CASE_WORK_PHASES, kaelDiagnosisScopeArtifactSchema } from "../kael/artifact-contract.ts";
import { kaelIntakeConfirmationSchema } from "../kael/intake-confirmation.ts";
import {
  PRICE_DISCLAIMER,
  intakeEvalObservationSchema,
  isIntakeEvalObservationExposureEnabled,
} from "../kael/index.ts";
import { apiFailure } from "../router.ts";
import {
  asComplexityOrNull,
  asRecord,
  asStringArray,
  nullableServiceType,
  nullableString,
} from "./coercions.ts";

export const KAEL_CHAT_HARD_COST_CAP_USD = 1;

export function serializeKaelTurn(row: Record<string, unknown>) {
  const metadata = asRecord(row.safe_metadata);
  const contentType = requiredKaelContentType(row.content_type);
  const turnIndex = finiteDbNumber(row.turn_index);
  if (
    turnIndex === null || !Number.isSafeInteger(turnIndex) || turnIndex <= 0 ||
    (row.text_content !== null && row.text_content !== undefined &&
      typeof row.text_content !== "string") ||
    !Array.isArray(row.media_refs) ||
    !row.media_refs.every((item) => typeof item === "string")
  ) {
    apiFailure("DB_ERROR", "Dữ liệu lượt chat Kael không hợp lệ", 500);
  }
  return {
    id: requiredDbString(row.id, "Dữ liệu lượt chat Kael không hợp lệ"),
    session_id: requiredDbString(
      row.session_id,
      "Dữ liệu lượt chat Kael không hợp lệ",
    ),
    turn_index: turnIndex,
    role: requiredKaelTurnRole(row.role),
    content_type: contentType,
    text_content: nullableString(row.text_content),
    media_refs: row.media_refs,
    estimate: serializeKaelEstimate(metadata.estimate, metadata.estimate_card_v3),
    // Surface what Kael still needs so the mobile
    // thread can render slot-hint chips. Drawn from the missing-info artifact proposal.
    clarification: serializeKaelClarification(contentType, metadata.artifact_proposal),
    ...(isIntakeEvalObservationExposureEnabled()
      ? { intake_observation: serializeIntakeEvalObservation(metadata.intake_observation) }
      : {}),
    created_at: requiredDbString(
      row.created_at,
      "Dữ liệu lượt chat Kael không hợp lệ",
    ),
  };
}

export function serializeIntakeEvalObservation(value: unknown) {
  const parsed = intakeEvalObservationSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    scope_signal: parsed.data.scopeSignal,
    suggested_service: parsed.data.suggestedService,
    problem_slug: parsed.data.problemSlug,
    needs_clarification: parsed.data.needsClarification,
    safety_signals: parsed.data.safetySignals,
    model_id: parsed.data.modelId,
    prompt_version: parsed.data.promptVersion,
    playbook_version: parsed.data.playbookVersion,
  };
}

export function serializeKaelClarification(
  contentType: string,
  artifactProposal: unknown,
): { question: string | null; missing_slots: string[] } | null {
  if (contentType !== "clarification") return null;
  const proposal = asRecord(artifactProposal);
  const question = nullableString(proposal.recommended_next_question);
  const missingSlots = asStringArray(proposal.missing_fields);
  if (!question && missingSlots.length === 0) return null;
  return { question, missing_slots: missingSlots };
}

export function serializeKaelSession(
  row: Record<string, unknown>,
  estimate: ReturnType<typeof serializeKaelEstimate>,
  turns: Array<ReturnType<typeof serializeKaelTurn>>,
) {
  const status = requiredKaelChatStatus(row.status);
  const lastTurn = turns[turns.length - 1];
  const totalCostUsd = finiteDbNumber(row.total_cost_usd);
  const totalTurns = finiteDbNumber(row.total_turns);
  const serviceType = nullableServiceType(row.service_type);
  const diagnosisScopeResult = row.diagnosis_scope === null
    ? null
    : kaelDiagnosisScopeArtifactSchema.safeParse(row.diagnosis_scope);
  if (
    totalCostUsd === null || totalCostUsd < 0 ||
    totalTurns === null || !Number.isSafeInteger(totalTurns) || totalTurns < 0 ||
    !serviceType ||
    (diagnosisScopeResult !== null && !diagnosisScopeResult.success)
  ) {
    apiFailure("DB_ERROR", "Dữ liệu phiên Kael không hợp lệ", 500);
  }
  const diagnosisScope = diagnosisScopeResult?.success ? diagnosisScopeResult.data : null;
  const metadata = asRecord(row.safe_metadata);
  const intakeConfirmationResult = metadata.intake_confirmation === undefined ||
      metadata.intake_confirmation === null
    ? null
    : kaelIntakeConfirmationSchema.safeParse(metadata.intake_confirmation);
  if (intakeConfirmationResult && !intakeConfirmationResult.success) {
    apiFailure("DB_ERROR", "Dữ liệu xác nhận đầu vào Kael không hợp lệ", 500);
  }
  const intakeConfirmation = intakeConfirmationResult?.success
    ? intakeConfirmationResult.data
    : null;
  const rowCasePhase = typeof row.case_phase === "string" &&
      (KAEL_CASE_WORK_PHASES as readonly string[]).includes(row.case_phase)
    ? row.case_phase as EdgeKaelCaseWorkPhase
    : null;
  if (!rowCasePhase) {
    apiFailure("DB_ERROR", "Dữ liệu phiên Kael không hợp lệ", 500);
  }
  return {
    id: requiredDbString(row.id, "Dữ liệu phiên Kael không hợp lệ"),
    job_id: nullableString(row.job_id),
    customer_id: requiredDbString(
      row.customer_id,
      "Dữ liệu phiên Kael không hợp lệ",
    ),
    service_type: serviceType,
    status,
    case_phase: rowCasePhase,
    diagnosis_scope: diagnosisScope,
    scheduled_at: nullableString(row.scheduled_at),
    estimate,
    started_at: requiredDbString(
      row.started_at,
      "Dữ liệu phiên Kael không hợp lệ",
    ),
    estimate_ready_at: nullableString(row.estimate_ready_at),
    total_turns: totalTurns,
    total_cost_usd: totalCostUsd,
    next_action: kaelNextAction(
      status,
      lastTurn?.content_type,
      totalCostUsd,
      diagnosisScope,
      intakeConfirmation,
    ),
    intake_confirmation: intakeConfirmation,
  };
}

export function serializeKaelEstimate(value: unknown, cardV3?: unknown) {
  const estimate = asRecord(value);
  if (Object.keys(estimate).length === 0) return null;
  // Surface the honesty fields already computed in estimate_card_v3 so the
  // customer sees a real inspection requirement without treating low price
  // confidence alone as a workflow blocker. Older turns default to false.
  const cardEnvelope = asRecord(cardV3);
  const nestedCard = asRecord(cardEnvelope.card);
  const card = Object.keys(nestedCard).length > 0 ? nestedCard : cardEnvelope;
  const reasoning = asRecord(card.kael_reasoning);
  const serviceType = nullableServiceType(estimate.service_type);
  const problemCategory = requiredDbString(
    estimate.problem_category,
    "Dữ liệu ước tính Kael không hợp lệ",
  );
  const problemSummary = requiredDbString(
    estimate.problem_summary,
    "Dữ liệu ước tính Kael không hợp lệ",
  );
  const complexity = asComplexityOrNull(estimate.complexity);
  const priceMin = finiteDbNumber(estimate.price_min);
  const priceMax = finiteDbNumber(estimate.price_max);
  const confidence = finiteDbNumber(estimate.confidence);
  if (
    !serviceType || !complexity || priceMin === null || priceMax === null ||
    !Number.isInteger(priceMin) || !Number.isInteger(priceMax) ||
    priceMin <= 0 || priceMax < priceMin || confidence === null ||
    confidence < 0 || confidence > 1
  ) {
    apiFailure("DB_ERROR", "Dữ liệu ước tính Kael không hợp lệ", 500);
  }
  return {
    service_type: serviceType,
    problem_category: problemCategory,
    problem_summary: problemSummary,
    complexity,
    price_min: priceMin,
    price_max: priceMax,
    confidence,
    advisory: nullableString(estimate.advisory),
    disclaimer: nonEmptyString(estimate.disclaimer) ?? PRICE_DISCLAIMER,
    needs_inspection: card.needs_inspection === true,
    price_source: nullableString(card.price_source),
    complexity_reasoning: nullableString(reasoning.complexity_reasoning),
    market_signals: nullableString(reasoning.market_signals),
    needs_inspection_reason: nullableString(reasoning.needs_inspection_reason),
    analysis_receipt: serializeEstimateAnalysisReceipt(card.analysis_receipt),
  };
}

function serializeEstimateAnalysisReceipt(value: unknown) {
  const receipt = asRecord(value);
  if (Object.keys(receipt).length === 0) return null;
  if (receipt.schema_version !== "analysis_receipt.v1") return null;
  const evidence = asRecord(receipt.evidence);
  const market = asRecord(receipt.market);
  const photoCount = finiteDbNumber(evidence.photo_count);
  const videoFrameCount = finiteDbNumber(evidence.video_frame_count);
  const voiceTranscriptCount = finiteDbNumber(evidence.voice_transcript_count);
  const acceptedSourceCount = finiteDbNumber(market.accepted_source_count);
  const highTrustSourceCount = finiteDbNumber(market.high_trust_source_count);
  const analysisStatus = evidence.analysis_status;
  const validAnalysisStatus = analysisStatus === undefined ||
    analysisStatus === "analyzed" ||
    analysisStatus === "not_provided" ||
    analysisStatus === "unavailable";
  const validEvidenceCounts = [photoCount, videoFrameCount, voiceTranscriptCount]
    .every((count) => count !== null && Number.isSafeInteger(count) && count >= 0);
  const validMarketCounts = [
    [market.accepted_source_count, acceptedSourceCount],
    [market.high_trust_source_count, highTrustSourceCount],
  ].every(([raw, count]) => isNullableNonNegativeInteger(raw, count));
  if (
    !validEvidenceCounts ||
    !validAnalysisStatus ||
    typeof evidence.skipped !== "boolean" ||
    !validMarketCounts ||
    (market.quorum_met !== null && typeof market.quorum_met !== "boolean")
  ) {
    apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
  }
  const findings = serializeEstimateEvidenceFindings(evidence.findings, {
    photo: photoCount as number,
    video_frame: videoFrameCount as number,
  });
  if (
    (analysisStatus === "not_provided" || analysisStatus === "unavailable") &&
    findings && findings.length > 0
  ) {
    apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
  }
  if (evidence.skipped && analysisStatus !== undefined && analysisStatus !== "not_provided") {
    apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
  }
  const problem = serializeEstimateProblemReceipt(receipt.problem);
  return {
    schema_version: "analysis_receipt.v1" as const,
    evidence: {
      ...(analysisStatus ? { analysis_status: analysisStatus } : {}),
      ...(findings ? { findings } : {}),
      photo_count: photoCount as number,
      video_frame_count: videoFrameCount as number,
      voice_transcript_count: voiceTranscriptCount as number,
      skipped: evidence.skipped,
    },
    market: {
      accepted_source_count: market.accepted_source_count === null
        ? null
        : acceptedSourceCount,
      high_trust_source_count: market.high_trust_source_count === null
        ? null
        : highTrustSourceCount,
      quorum_met: market.quorum_met,
    },
    ...(problem ? { problem } : {}),
  };
}

function serializeEstimateEvidenceFindings(
  value: unknown,
  evidenceCount: { photo: number; video_frame: number },
) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 5) {
    apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
  }
  const seen = new Set<string>();
  return value.map((item) => {
    const finding = asRecord(item);
    const kind = finding.evidence_kind;
    const index = finiteDbNumber(finding.evidence_index);
    const observation = boundedNonEmptyString(finding.observation, 240);
    const possibleMeaning = finding.possible_meaning === null
      ? null
      : boundedNonEmptyString(finding.possible_meaning, 240);
    const confidence = finding.confidence;
    const validKind = kind === "photo" || kind === "video_frame";
    const key = `${kind}:${index}`;
    if (
      !validKind ||
      (confidence !== "low" && confidence !== "medium" && confidence !== "high") ||
      index === null ||
      !Number.isSafeInteger(index) ||
      index < 1 ||
      index > evidenceCount[kind] ||
      !observation ||
      (finding.possible_meaning !== null && !possibleMeaning) ||
      seen.has(key)
    ) {
      apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
    }
    seen.add(key);
    return {
      confidence,
      evidence_index: index,
      evidence_kind: kind,
      observation,
      possible_meaning: possibleMeaning,
    };
  });
}

function serializeEstimateProblemReceipt(value: unknown) {
  if (value === undefined) return undefined;
  const problem = asRecord(value);
  const summary = boundedNonEmptyString(problem.summary, 500);
  const remainingUncertainty = problem.remaining_uncertainty === null
    ? null
    : boundedNonEmptyString(problem.remaining_uncertainty, 300);
  const recommendedScope = problem.recommended_scope === null
    ? null
    : boundedNonEmptyString(problem.recommended_scope, 400);
  const indicators = Array.isArray(problem.severity_indicators)
    ? problem.severity_indicators.map((item) => boundedNonEmptyString(item, 200))
    : [];
  if (
    !summary ||
    !Array.isArray(problem.severity_indicators) ||
    indicators.length > 5 ||
    indicators.some((item) => !item) ||
    (problem.remaining_uncertainty !== null && !remainingUncertainty) ||
    (problem.recommended_scope !== null && !recommendedScope)
  ) {
    apiFailure("DB_ERROR", "Dữ liệu biên nhận phân tích Kael không hợp lệ", 500);
  }
  return {
    remaining_uncertainty: remainingUncertainty,
    recommended_scope: recommendedScope,
    severity_indicators: indicators as string[],
    summary,
  };
}

function isNullableNonNegativeInteger(raw: unknown, parsed: unknown) {
  return raw === null ||
    (typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0);
}

export function serializeJobMessage(row: Record<string, unknown>) {
  const senderRole = requiredMessageSenderRole(row.sender_role);
  if (
    typeof row.is_read !== "boolean" ||
    (row.sender_id !== null && row.sender_id !== undefined &&
      typeof row.sender_id !== "string")
  ) {
    apiFailure("DB_ERROR", "Dữ liệu tin nhắn không hợp lệ", 500);
  }
  return {
    id: requiredDbString(row.id, "Dữ liệu tin nhắn không hợp lệ"),
    job_id: requiredDbString(row.job_id, "Dữ liệu tin nhắn không hợp lệ"),
    sender_id: nullableString(row.sender_id),
    sender_role: senderRole,
    content: requiredDbString(row.content, "Dữ liệu tin nhắn không hợp lệ"),
    is_read: row.is_read,
    created_at: requiredDbString(
      row.created_at,
      "Dữ liệu tin nhắn không hợp lệ",
    ),
  };
}

function requiredDbString(value: unknown, message: string): string {
  const parsed = nonEmptyString(value);
  if (!parsed) apiFailure("DB_ERROR", message, 500);
  return parsed;
}

function requiredMessageSenderRole(
  value: unknown,
): "customer" | "worker" | "kael" {
  if (value === "customer" || value === "worker" || value === "kael") {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu tin nhắn không hợp lệ", 500);
}

function requiredKaelChatStatus(value: unknown): KaelChatStatus {
  if (
    value === "active" || value === "collecting_evidence" ||
    value === "estimate_ready" || value === "confirmed" ||
    value === "abandoned" || value === "unsupported"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu phiên Kael không hợp lệ", 500);
}

function requiredKaelTurnRole(
  value: unknown,
): "customer" | "kael" | "system" {
  if (value === "customer" || value === "kael" || value === "system") {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu lượt chat Kael không hợp lệ", 500);
}

function requiredKaelContentType(
  value: unknown,
): "text" | "photo_request" | "video_request" | "photo_attached" |
  "video_attached" | "clarification" | "analysis" | "estimate" | "error" {
  if (
    value === "text" || value === "photo_request" ||
    value === "video_request" || value === "photo_attached" ||
    value === "video_attached" || value === "clarification" ||
    value === "analysis" || value === "estimate" || value === "error"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu lượt chat Kael không hợp lệ", 500);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function boundedNonEmptyString(value: unknown, maxLength: number): string | null {
  const parsed = nonEmptyString(value);
  return parsed && parsed.length <= maxLength ? parsed : null;
}

function finiteDbNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function kaelNextAction(
  status: KaelChatStatus,
  lastContentType: string | undefined,
  totalCostUsd: number,
  diagnosisScope?: unknown,
  intakeConfirmation?: unknown,
): KaelChatNextAction {
  if (status === "confirmed") return "confirmed";
  if (status === "unsupported") return "unsupported";
  if (totalCostUsd >= KAEL_CHAT_HARD_COST_CAP_USD) return "budget_exceeded";
  const intake = kaelIntakeConfirmationSchema.safeParse(intakeConfirmation);
  if (intake.success && intake.data.status === "pending") return "confirm_intake";
  if (status === "collecting_evidence") return "collect_evidence";
  if (status === "estimate_ready") return "estimate_ready";
  const artifact = kaelDiagnosisScopeArtifactSchema.safeParse(diagnosisScope);
  if (artifact.success && artifact.data.next_action.kind === "ask_question") return "ask_question";
  if (artifact.success && artifact.data.next_action.kind === "request_evidence") return "request_evidence";
  if (lastContentType === "photo_request") return "ask_photo";
  if (lastContentType === "video_request") return "ask_video";
  if (lastContentType === "error") return "unsupported";
  return "await_input";
}
