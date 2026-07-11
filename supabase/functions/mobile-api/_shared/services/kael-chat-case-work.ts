import type { ServiceType } from "../../../_shared/domain.ts";
import {
  buildDemandingCustomerResponse,
  buildInitialDiagnosisScopeArtifact,
  detectDemandingCustomerPatterns,
  getKaelPerformanceProfile,
  kaelDiagnosisScopeArtifactSchema,
  requiredCaseWorkEvidenceRequest,
  type KaelDiagnosisScopeArtifact,
} from "../kael/index.ts";
import { apiFailure } from "../router.ts";
import { compactMetadata, type KaelChatTurnRole } from "./_shared.ts";
import { asKaelTurnRole, asNumber, asString, nullableString } from "./coercions.ts";
import { dbQuery, type DbClient } from "./db.ts";

export async function loadDiagnosisScopeArtifact(
  client: DbClient,
  sessionId: string,
  serviceType: ServiceType,
  customerGoal: string,
): Promise<KaelDiagnosisScopeArtifact> {
  const result = await dbQuery<Record<string, unknown>>(
    client.from("kael_chat_sessions").select("id, diagnosis_scope").eq("id", sessionId).single(),
  );
  if (result.error || !result.data) apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  const parsed = kaelDiagnosisScopeArtifactSchema.safeParse(result.data.diagnosis_scope);
  if (parsed.success && parsed.data.service_type === serviceType) return parsed.data;
  const profile = getKaelPerformanceProfile(serviceType);
  if (!profile) apiFailure("UNSUPPORTED_SERVICE", "Dịch vụ chưa có hồ sơ Case Work hợp lệ", 400);
  return buildInitialDiagnosisScopeArtifact({ serviceType: profile.service_type, customerGoal });
}

export async function getKaelChatTurnCount(client: DbClient, sessionId: string): Promise<number> {
  const result = await dbQuery<Record<string, unknown>>(
    client.from("kael_chat_sessions").select("id, total_turns").eq("id", sessionId).single(),
  );
  if (result.error || !result.data) apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  return asNumber(result.data.total_turns);
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

export function diagnosisScopeWithEvidenceRequest(
  artifact: KaelDiagnosisScopeArtifact,
  request: NonNullable<ReturnType<typeof requiredCaseWorkEvidenceRequest>>,
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
    next_action: { kind: "request_evidence", evidence_kind: request.evidenceKind, prompt: request.prompt },
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
): Promise<{ context: string | undefined; clarificationCount: number }> {
  const turnsResult = await dbQuery<Array<Record<string, unknown>>>(
    client.from("kael_chat_turns").select("turn_index, role, content_type, text_content")
      .eq("session_id", sessionId).order("turn_index", { ascending: true }),
  );
  const rows = Array.isArray(turnsResult.data) ? turnsResult.data : [];
  const clarificationCount = rows.filter((row) =>
    asString(row.content_type) === "clarification" && asKaelTurnRole(row.role) !== "customer"
  ).length;
  const recent = rows.map((row) => ({ role: asKaelTurnRole(row.role), text: nullableString(row.text_content) }))
    .filter((turn): turn is { role: KaelChatTurnRole; text: string } => Boolean(turn.text))
    .slice(-8)
    .map((turn) => `${turn.role === "customer" ? "khách" : "kael"}: ${turn.text}`);
  return { context: recent.length > 0 ? recent.join("\n") : undefined, clarificationCount };
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
