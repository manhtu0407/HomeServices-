import type { KaelChatEvidenceInput, ServiceType } from "../../../_shared/domain.ts";
import {
  buildDemandingCustomerResponse,
  buildInitialDiagnosisScopeArtifact,
  detectDemandingCustomerPatterns,
  getKaelPerformanceProfile,
  kaelDiagnosisScopeArtifactSchema,
  type CaseWorkEvidenceRequest,
  type KaelDiagnosisScopeArtifact,
} from "../kael/index.ts";
import { apiFailure } from "../router.ts";
import { compactMetadata, type KaelChatTurnRole } from "./_shared.ts";
import { asKaelTurnRole, asNumber, asRecord, asString, nullableString } from "./coercions.ts";
import { dbQuery, type DbClient } from "./db.ts";
import {
  buildUntrustedCustomerCaseConversationContext,
  sanitizeCustomerCaseEvidenceItem,
  sanitizeCustomerCaseEvidenceText,
} from "../kael/untrusted-evidence.ts";

export async function loadKaelChatAnalysisState(
  client: DbClient,
  sessionId: string,
  serviceType: ServiceType,
  customerGoal: string,
): Promise<{
  artifact: KaelDiagnosisScopeArtifact;
  currentCostUsd: number;
  persistedTurnCount: number;
}> {
  const result = await dbQuery<Record<string, unknown>>(
    client.from("kael_chat_sessions")
      .select("id, diagnosis_scope, total_turns, total_cost_usd")
      .eq("id", sessionId)
      .single(),
  );
  if (result.error || !result.data) apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  const parsed = kaelDiagnosisScopeArtifactSchema.safeParse(result.data.diagnosis_scope);
  let artifact = parsed.success && parsed.data.service_type === serviceType
    ? parsed.data
    : null;
  if (!artifact) {
    const profile = getKaelPerformanceProfile(serviceType);
    if (!profile) apiFailure("UNSUPPORTED_SERVICE", "Dịch vụ chưa có hồ sơ Case Work hợp lệ", 400);
    artifact = buildInitialDiagnosisScopeArtifact({ serviceType: profile.service_type, customerGoal });
  }
  return {
    artifact,
    currentCostUsd: asNumber(result.data.total_cost_usd),
    persistedTurnCount: asNumber(result.data.total_turns),
  };
}

export function diagnosisScopeWithQuestion(
  artifact: KaelDiagnosisScopeArtifact,
  missingFacts: readonly string[],
  question: string,
  confidence: number,
  latestCustomerDetail?: string,
): KaelDiagnosisScopeArtifact {
  return kaelDiagnosisScopeArtifactSchema.parse({
    ...artifact,
    case_phase: "analysis",
    facts: {
      ...artifact.facts,
      ...(latestCustomerDetail?.trim() ? { latest_customer_detail: latestCustomerDetail.trim() } : {}),
    },
    missing_facts: [...new Set(missingFacts)],
    quote_ready: false,
    quote_blockers: [...new Set(missingFacts)],
    confidence,
    next_action: { kind: "ask_question", question },
    updated_at: new Date().toISOString(),
  });
}

export function diagnosisScopeWithGroundedAnswer(
  artifact: KaelDiagnosisScopeArtifact,
  missingFact: string,
  answer: string,
): KaelDiagnosisScopeArtifact {
  const normalizedAnswer = answer.trim().slice(0, 2000);
  return kaelDiagnosisScopeArtifactSchema.parse({
    ...artifact,
    case_phase: "analysis",
    facts: {
      ...artifact.facts,
      [missingFact]: normalizedAnswer,
      latest_customer_detail: normalizedAnswer,
    },
    missing_facts: artifact.missing_facts.filter((fact) => fact !== missingFact),
    quote_ready: false,
    quote_blockers: artifact.quote_blockers.filter((blocker) =>
      blocker !== missingFact && blocker !== `missing_profile_fact:${missingFact}`
    ),
    confidence: Math.max(artifact.confidence, 0.45),
    next_action: { kind: "wait" },
    updated_at: new Date().toISOString(),
  });
}

export function diagnosisScopeWithUncertainAnswer(
  artifact: KaelDiagnosisScopeArtifact,
  missingFact: string,
  reason: string,
): KaelDiagnosisScopeArtifact {
  const normalizedFact = missingFact.trim().slice(0, 120) || "unverified_detail";
  const reviewReason = reason.trim().slice(0, 500) || "Cần xác minh tại chỗ trước khi chốt phạm vi.";
  return kaelDiagnosisScopeArtifactSchema.parse({
    ...artifact,
    case_phase: "analysis",
    facts: {
      ...artifact.facts,
      latest_unavailable_fact: normalizedFact,
    },
    missing_facts: [...new Set([normalizedFact, ...artifact.missing_facts])].slice(0, 64),
    quote_ready: false,
    quote_blockers: [...new Set([
      `missing_profile_fact:${normalizedFact}`,
      "onsite_inspection_required",
      ...artifact.quote_blockers,
    ])].slice(0, 30),
    confidence: Math.max(artifact.confidence, 0.4),
    next_action: { kind: "escalate", reason: reviewReason },
    updated_at: new Date().toISOString(),
  });
}

export function diagnosisScopeForIncomingTurn(
  artifact: KaelDiagnosisScopeArtifact,
  input: {
    evidence: KaelDiagnosisScopeArtifact["evidence"];
    hasNewEvidence?: boolean;
    voiceTranscript?: string | null;
  },
): KaelDiagnosisScopeArtifact {
  const voiceTranscript = input.voiceTranscript
    ? sanitizeCustomerCaseEvidenceText(input.voiceTranscript).slice(0, 2000) || null
    : null;
  const preservePendingQuestion = artifact.next_action.kind === "ask_question" &&
    input.hasNewEvidence !== true && !voiceTranscript;
  return kaelDiagnosisScopeArtifactSchema.parse({
    ...artifact,
    case_phase: "analysis",
    evidence: input.evidence,
    facts: {
      ...artifact.facts,
      ...(voiceTranscript ? { latest_voice_transcript: voiceTranscript } : {}),
    },
    quote_ready: false,
    quote_blockers: preservePendingQuestion ? artifact.quote_blockers : [],
    next_action: preservePendingQuestion ? artifact.next_action : { kind: "wait" },
    updated_at: new Date().toISOString(),
  });
}

export function diagnosisScopeWithEvidenceRequest(
  artifact: KaelDiagnosisScopeArtifact,
  request: CaseWorkEvidenceRequest,
  input: {
    customerDetail: string;
    problemSummary: string;
    complexity: string;
    problemChips: string[];
    workerRequirements: readonly string[];
    confidence: number;
  },
): KaelDiagnosisScopeArtifact {
  return kaelDiagnosisScopeArtifactSchema.parse({
    ...artifact,
    case_phase: "analysis",
    facts: {
      ...artifact.facts,
      latest_customer_detail: input.customerDetail,
      problem_summary: input.problemSummary,
      complexity: input.complexity,
      problem_chips: input.problemChips,
    },
    missing_facts: [request.blocker],
    scope_summary: input.problemSummary,
    quote_ready: false,
    quote_blockers: [request.blocker],
    worker_requirements: [...input.workerRequirements],
    confidence: Math.min(input.confidence, 0.65),
    next_action: {
      kind: "request_evidence",
      evidence_kind: request.evidenceKind,
      prompt: request.prompt,
      required: request.required,
    },
    updated_at: new Date().toISOString(),
  });
}

export async function persistDiagnosisScopeArtifact(
  client: DbClient,
  sessionId: string,
  artifact: KaelDiagnosisScopeArtifact,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client.from("kael_chat_sessions")
      .update({ case_phase: artifact.case_phase, diagnosis_scope: artifact })
      .eq("id", sessionId).select("id").maybeSingle(),
  );
  if (result.error || !result.data) apiFailure("DB_ERROR", "Không thể cập nhật phiên Kael", 500);
}

export async function buildKaelConversationContext(
  client: DbClient,
  sessionId: string,
): Promise<{
  context: string | undefined;
  clarificationCount: number;
  previousAnalysisReceipt: Record<string, unknown> | undefined;
}> {
  const turnsResult = await dbQuery<Array<Record<string, unknown>>>(
    client.from("kael_chat_turns").select(
      "turn_index, role, content_type, text_content, safe_metadata",
    )
      .eq("session_id", sessionId).order("turn_index", { ascending: true }),
  );
  if (turnsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải lịch sử trao đổi Kael", 500);
  }
  const rows = Array.isArray(turnsResult.data) ? turnsResult.data : [];
  const clarificationCount = rows.filter((row) =>
    asString(row.content_type) === "clarification" && asKaelTurnRole(row.role) !== "customer"
  ).length;
  const recent = rows.map((row) => ({ role: asKaelTurnRole(row.role), text: nullableString(row.text_content) }))
    .filter((turn): turn is { role: KaelChatTurnRole; text: string } => Boolean(turn.text))
    .slice(-8);
  const previousAnalysisReceipt = [...rows].reverse().flatMap((row) => {
    if (asString(row.content_type) !== "estimate") return [];
    const estimateMetadata = asRecord(row.safe_metadata);
    const estimateEnvelope = asRecord(estimateMetadata.estimate_card_v3);
    const estimateCard = asRecord(estimateEnvelope.card);
    const receipt = asRecord(estimateCard.analysis_receipt);
    const evidence = asRecord(receipt.evidence);
    return evidence.analysis_status === "analyzed" ? [receipt] : [];
  })[0];
  return {
    context: buildUntrustedCustomerCaseConversationContext(recent),
    clarificationCount,
    previousAnalysisReceipt,
  };
}

export function mergeKaelCustomerDetailForReanalysis(
  artifact: KaelDiagnosisScopeArtifact,
  latestCustomerDetail: string,
): string {
  const priorDetails = [
    artifact.facts.customer_goal,
    artifact.facts.latest_customer_detail,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const latest = latestCustomerDetail.trim();
  const details: string[] = [];
  for (const detail of [...priorDetails, latest]) {
    const normalized = normalizeCustomerDetail(detail);
    if (!normalized) continue;
    const coveringIndex = details.findIndex((current) =>
      normalizeCustomerDetail(current).includes(normalized)
    );
    if (coveringIndex >= 0) continue;
    const coveredIndex = details.findIndex((current) =>
      normalized.includes(normalizeCustomerDetail(current))
    );
    if (coveredIndex >= 0) details.splice(coveredIndex, 1, detail.trim());
    else details.push(detail.trim());
  }
  const merged = details.join("\n\n");
  if (merged.length <= 2000) return merged;
  const latestBounded = latest.slice(0, 1200).trim();
  const priorBudget = Math.max(0, 2000 - latestBounded.length - 2);
  const priorBounded = details.slice(0, -1).join("\n\n").slice(0, priorBudget).trim();
  return [priorBounded, latestBounded].filter(Boolean).join("\n\n");
}

function normalizeCustomerDetail(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
}

export function demandingCustomerTurnMetadata(
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

export function demandingCustomerSessionMetadata(
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

export function sanitizeCaseWorkEvidenceItems(
  evidenceItems: NonNullable<KaelChatEvidenceInput["evidence_items"]>,
): KaelDiagnosisScopeArtifact["evidence"] {
  return evidenceItems.map((evidence) => {
    const ref = evidence.ref ?? "";
    const expectedPurpose = evidence.kind === "video_original_private"
      ? "/private_video_original/"
      : evidence.kind === "photo" || evidence.kind === "video_frame"
      ? "/model_vision/"
      : null;
    if (expectedPurpose && !ref.includes(expectedPurpose)) {
      apiFailure("VALIDATION", "Loại media bằng chứng không khớp mục đích upload", 400);
    }
    const sanitizedEvidence = sanitizeCustomerCaseEvidenceItem(evidence);
    if (
      (evidence.kind === "voice_transcript" || evidence.kind === "text_note") &&
      !sanitizedEvidence.transcript
    ) {
      apiFailure("VALIDATION", "Nội dung bằng chứng không có quan sát hợp lệ", 400);
    }
    return sanitizedEvidence;
  });
}

export function caseWorkVoiceTranscript(
  evidenceItems: KaelDiagnosisScopeArtifact["evidence"],
) {
  return evidenceItems
    .filter((evidence) => evidence.kind === "voice_transcript")
    .map((evidence) => evidence.transcript)
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export function mergeCaseWorkEvidence(
  current: KaelDiagnosisScopeArtifact["evidence"],
  incoming: KaelDiagnosisScopeArtifact["evidence"],
): KaelDiagnosisScopeArtifact["evidence"] {
  const result = [...current];
  const keys = new Set(current.map((evidence) =>
    `${evidence.kind}:${evidence.ref ?? evidence.transcript ?? evidence.summary ?? ""}`
  ));
  for (const evidence of incoming) {
    const key = `${evidence.kind}:${evidence.ref ?? evidence.transcript ?? evidence.summary ?? ""}`;
    if (keys.has(key)) continue;
    keys.add(key);
    result.push(evidence);
    if (result.length >= 20) break;
  }
  return result;
}
