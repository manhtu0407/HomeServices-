import type { ServiceType } from "../../../../_shared/domain.ts";
import {
  buildInitialDiagnosisScopeArtifact,
  type CaseWorkEvidenceRequest,
  getKaelPerformanceProfile,
  type KaelDiagnosisScopeArtifact,
  kaelDiagnosisScopeArtifactSchema,
} from "../../kael/index.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { asNumber } from "../../platform/coercions.ts";
import { type DbClient, dbQuery } from "../../platform/db.ts";
import { sanitizeCustomerCaseEvidenceText } from "../../kael/evidence/untrusted-evidence.ts";

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
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  const parsed = kaelDiagnosisScopeArtifactSchema.safeParse(
    result.data.diagnosis_scope,
  );
  let artifact = parsed.success && parsed.data.service_type === serviceType
    ? parsed.data
    : null;
  if (!artifact) {
    const profile = getKaelPerformanceProfile(serviceType);
    if (!profile) {
      apiFailure(
        "UNSUPPORTED_SERVICE",
        "Dịch vụ chưa có hồ sơ Case Work hợp lệ",
        400,
      );
    }
    artifact = buildInitialDiagnosisScopeArtifact({
      serviceType: profile.service_type,
      customerGoal,
    });
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
      ...(latestCustomerDetail?.trim()
        ? { latest_customer_detail: latestCustomerDetail.trim() }
        : {}),
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
    missing_facts: artifact.missing_facts.filter((fact) =>
      fact !== missingFact
    ),
    quote_ready: false,
    quote_blockers: artifact.quote_blockers.filter((blocker) =>
      blocker !== missingFact &&
      blocker !== `missing_profile_fact:${missingFact}`
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
  const normalizedFact = missingFact.trim().slice(0, 120) ||
    "unverified_detail";
  const reviewReason = reason.trim().slice(0, 500) ||
    "Cần xác minh tại chỗ trước khi chốt phạm vi.";
  return kaelDiagnosisScopeArtifactSchema.parse({
    ...artifact,
    case_phase: "analysis",
    facts: {
      ...artifact.facts,
      latest_unavailable_fact: normalizedFact,
    },
    missing_facts: [...new Set([normalizedFact, ...artifact.missing_facts])]
      .slice(0, 64),
    quote_ready: false,
    quote_blockers: [
      ...new Set([
        `missing_profile_fact:${normalizedFact}`,
        "onsite_inspection_required",
        ...artifact.quote_blockers,
      ]),
    ].slice(0, 30),
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
    ? sanitizeCustomerCaseEvidenceText(input.voiceTranscript).slice(0, 2000) ||
      null
    : null;
  const preservePendingQuestion =
    artifact.next_action.kind === "ask_question" &&
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
    next_action: preservePendingQuestion
      ? artifact.next_action
      : { kind: "wait" },
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
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể cập nhật phiên Kael", 500);
  }
}
