import type { KaelChatEvidenceInput } from "../../../../_shared/domain.ts";
import {
  buildDemandingCustomerResponse,
  detectDemandingCustomerPatterns,
  type KaelDiagnosisScopeArtifact,
} from "../../kael/index.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
import { type KaelChatTurnRole } from "../../platform/coercions.ts";
import { asKaelTurnRole, asRecord, asString, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import {
  buildUntrustedCustomerCaseConversationContext,
  sanitizeCustomerCaseEvidenceItem,
  sanitizeCustomerCaseEvidenceText,
} from "../../kael/evidence/untrusted-evidence.ts";
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
  const latest = latestCustomerDetail.trim();
  const priorDetails = [
    artifact.facts.customer_goal,
    artifact.facts.latest_customer_detail,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => removeSupersededRedactedMeasurementClauses(value, latest))
    .filter((value) => value.length > 0);
  const details: string[] = [];
  const orderedDetails = latest ? [latest, ...priorDetails] : priorDetails;
  for (const detail of orderedDetails) {
    const normalized = normalizeCustomerDetail(detail);
    if (!normalized) continue;
    const coveringIndex = details.findIndex((current) =>
      normalizeCustomerDetail(current).includes(normalized)
    );
    if (coveringIndex >= 0) continue;
    const coveredIndex = details.findIndex((current) =>
      normalized.includes(normalizeCustomerDetail(current))
    );
    if (coveredIndex > 0 || (coveredIndex === 0 && !latest)) {
      details.splice(coveredIndex, 1, detail.trim());
    }
    else details.push(detail.trim());
  }
  const merged = details.join("\n\n");
  if (merged.length <= 2000) return merged;
  const newestBounded = details[0]?.slice(0, 1200).trim() ?? "";
  const priorBudget = Math.max(0, 2000 - newestBounded.length - 2);
  const priorBounded = details.slice(1).join("\n\n").slice(0, priorBudget).trim();
  return [newestBounded, priorBounded].filter(Boolean).join("\n\n");
}

function normalizeCustomerDetail(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
}

function removeSupersededRedactedMeasurementClauses(
  priorDetail: string,
  latestCustomerDetail: string,
) {
  const hasConcreteDeviceMeasurement = /\b\d+(?:[.,]\d+)?\s*(?:hp|btu|v|a|kw)\b/iu.test(
    latestCustomerDetail,
  );
  if (!hasConcreteDeviceMeasurement) return priorDetail.trim();
  return priorDetail
    .split(/(?:\r?\n)+|(?<=[.!?;])\s+/u)
    .map((clause) => clause.trim())
    .filter((clause) =>
      clause.length > 0 &&
      !/\[(?:house-no|unit|floor)\]\s*(?:hp|btu|v|a|kw)\b/iu.test(clause)
    )
    .join("\n\n");
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
