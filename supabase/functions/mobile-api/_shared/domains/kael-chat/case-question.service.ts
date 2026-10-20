// Answers what the customer asked in the middle of a case without re-running price research and
// without changing the case: the answer is grounded on the case summary and recent turns only.

import type { EdgeKaelNextAction, EdgeKaelTurnIntent } from "../../../../_shared/contracts/kael-next-actions.ts";
import { kaelDiagnosisScopeArtifactSchema, type EdgeAiSecrets } from "../../kael/index.ts";
import type { CaseTurnIntentResult } from "../../kael/tools/case-turn-intent.ts";
import { telemetryFromTrace } from "./turn-telemetry.ts";
import type { NormalChatPreviousTurn } from "../../kael/kael-memory/normal-chat-session.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { asKaelChatStatus, asNumber, asRecord, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { answerKaelAssistant } from "../customer/assistant.ts";
import { assertCaseContextOwner, buildCaseAssistantContext, type CaseContextRefusal } from "./case-context.ts";
import { buildEvidenceGapNextActions, firstMissingSlot } from "./evidence-gap-response.ts";
import {
  EVIDENCE_GAP_QUOTE_READINESS,
  evidenceGapPolicyState,
  latestQuoteReadinessTurn,
} from "./evidence-gap-policy.ts";
import { appendKaelSystemTurn } from "./session-store.ts";
import { assistantTraceFields } from "../../kael/agents/customer-assistant-trace.ts";
import { buildKaelTurnTrace, logKaelTurnTrace, type KaelTurnTrace, type KaelTurnTraceInput } from "../../platform/turn-trace.ts";
import { pendingClarificationSlotOf, slotAskCountsOf } from "./case-work-artifact.ts";

export type CaseTurnRouting = {
  readonly intent: EdgeKaelTurnIntent;
  readonly source: "chip" | "ai" | "fallback";
  readonly confidence: number;
  readonly fallbackReason?: CaseTurnIntentResult["fallbackReason"];
  readonly fallbackBasis?: CaseTurnIntentResult["fallbackBasis"];
  readonly telemetry?: CaseTurnIntentResult["telemetry"];
  readonly slotUnderstanding?: CaseTurnIntentResult["slotUnderstanding"];
};

export async function readCaseRecentTurns(
  client: DbClient,
  sessionId: string,
): Promise<NormalChatPreviousTurn[]> {
  const turns = await dbQuery<Array<Record<string, unknown>>>(
    client.from("kael_chat_turns")
      .select("id, turn_index, role, text_content")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: false })
      .limit(8),
  );
  if (turns.error || !Array.isArray(turns.data)) return [];
  return turns.data.reverse().flatMap((turn) => {
    const role = turn.role === "customer" || turn.role === "kael" ? turn.role : null;
    const id = nullableString(turn.id);
    return role && id
      ? [{ id, turnIndex: asNumber(turn.turn_index), role, text: nullableString(turn.text_content) }]
      : [];
  });
}

// The next steps that fit where the case is now; never a confirmation, matching or payment control.
export async function caseStateNextActions(input: {
  client: DbClient;
  session: Record<string, unknown>;
  quoteTurn: Record<string, unknown> | null;
  language: "vi" | "en";
  exclude?: readonly EdgeKaelNextAction["kind"][];
}): Promise<EdgeKaelNextAction[]> {
  const vi = input.language === "vi";
  const exclude = new Set(input.exclude ?? []);
  let actions: EdgeKaelNextAction[];
  if (input.quoteTurn?.quote_readiness === EVIDENCE_GAP_QUOTE_READINESS) {
    const serviceProblemId = nullableString(input.quoteTurn.service_problem_id);
    const artifact = kaelDiagnosisScopeArtifactSchema.safeParse(input.session.diagnosis_scope);
    const policyState = serviceProblemId
      ? await evidenceGapPolicyState(input.client, serviceProblemId)
      : { rfqAvailable: false, enrichmentSlots: [] };
    actions = buildEvidenceGapNextActions({
      language: input.language,
      rfqAvailable: policyState.rfqAvailable,
      hasPhoto: artifact.success &&
        artifact.data.evidence.some((item) => item.kind === "photo" || item.kind === "video_frame"),
      missingSlot: artifact.success ? firstMissingSlot(policyState.enrichmentSlots, artifact.data.facts) : null,
    });
  } else if (asKaelChatStatus(input.session.status) === "estimate_ready") {
    actions = [{ id: "review_offer", kind: "review_offer", label: vi ? "Xem lại đề xuất" : "Review the offer" }];
  } else {
    actions = [
      { id: "provide_detail", kind: "provide_detail", label: vi ? "Bổ sung thông tin" : "Add details" },
      { id: "attach_photo", kind: "attach_photo", label: vi ? "Gửi thêm ảnh" : "Add a photo" },
    ];
  }
  return actions.filter((action) => !exclude.has(action.kind)).slice(0, 4);
}

// Supplemental wording only: the service, phase, facts and blockers travel as the typed case context.
function caseSummaryForAnswer(
  session: Record<string, unknown>,
): string {
  const artifact = kaelDiagnosisScopeArtifactSchema.safeParse(session.diagnosis_scope);
  const metadata = asRecord(session.safe_metadata);
  return JSON.stringify({
    scope_summary: artifact.success ? artifact.data.scope_summary ?? null : null,
    quote_mode: nullableString(asRecord(metadata.intake_coverage).quote_mode),
    rules: "Kael never invents a price. A worker quote needs the customer's explicit confirmation.",
  }).slice(0, 3_000);
}

// The saved request could not be read, so Kael says that instead of guessing what it is. Nothing about
// the case changes and no provider is called.
function unreadableCaseText(language: "vi" | "en") {
  return language === "en"
    ? "Kael could not read your saved request, so it cannot answer this question yet. Your request is unchanged. Reopen it or contact support so the details can be checked."
    : "Kael chưa đọc được thông tin yêu cầu đã lưu của bạn nên chưa thể trả lời câu hỏi này. Yêu cầu của bạn vẫn giữ nguyên. Bạn hãy mở lại yêu cầu hoặc liên hệ hỗ trợ để Kael kiểm tra.";
}

type CaseQuestionInput = {
  ctx: MobileApiContext;
  client: DbClient;
  sessionId: string;
  session: Record<string, unknown>;
  message: string;
  language: "vi" | "en";
  secrets: EdgeAiSecrets;
  routing: CaseTurnRouting;
};

// Observability only: a failure to build the trace leaves the customer's turn untouched.
function caseTurnTrace(
  input: CaseQuestionInput,
  quoteTurn: Record<string, unknown> | null,
  fields: Omit<KaelTurnTraceInput, "identity" | "route">,
): KaelTurnTrace | null {
  try {
    const artifact = kaelDiagnosisScopeArtifactSchema.safeParse(input.session.diagnosis_scope);
    const nextAction = artifact.success ? artifact.data.next_action : null;
    return buildKaelTurnTrace({
      identity: input.ctx,
      route: "case_work_question",
      canonicalService: input.session.service_type,
      casePhase: input.session.case_phase,
      pendingSlot: artifact.success
        ? pendingClarificationSlotOf(artifact.data, slotAskCountsOf(input.session.safe_metadata))
        : undefined,
      missingFactCount: artifact.success ? artifact.data.missing_facts.length : undefined,
      intent: input.routing.intent,
      intentSource: input.routing.source,
      quoteReadiness: quoteTurn?.quote_readiness,
      priceGapReason: quoteTurn?.price_gap_reason,
      nextActionReason: nextAction?.kind === "escalate" ? nextAction.reason : undefined,
      ...fields,
    });
  } catch {
    return null;
  }
}

export async function answerKaelCaseQuestion(input: CaseQuestionInput) {
  assertCaseContextOwner(input.ctx, input.sessionId, input.session);
  const quoteTurn = await latestQuoteReadinessTurn(input.client, input.sessionId);
  const caseContext = buildCaseAssistantContext({ session: input.session, quoteTurn });
  if (!caseContext.ok) {
    await appendUnreadableCaseTurn(input, caseContext.reason);
    return;
  }
  let text: string;
  let fallbackUsed = false;
  let telemetry = telemetryFromTrace(undefined, "template");
  let traceFields: Omit<KaelTurnTraceInput, "identity" | "route"> = { stage: "answer_unavailable", fallbackUsed: true };
  try {
    const answer = await answerKaelAssistant(input.ctx, {
      language: input.language,
      message: input.message,
      surface: "customer_normal",
    }, input.secrets, {
      caseContext: caseContext.context,
      memorySummary: caseSummaryForAnswer(input.session),
      previousTurns: await readCaseRecentTurns(input.client, input.sessionId),
      includeTelemetry: true,
      traceHandledByCaller: true,
    });
    traceFields = assistantTraceFields(answer, {
      message: input.message,
      canonicalService: input.session.service_type,
      surface: "customer_normal",
    });
    const notes = answer.safety_notes.filter((note) => note.trim().length > 0);
    text = notes.length > 0
      ? `${answer.answer}\n\n${input.language === "en" ? "Note" : "Lưu ý"}: ${notes.join(" ")}`
      : answer.answer;
    fallbackUsed = answer.fallback_used;
    telemetry = telemetryFromTrace(answer.trace, fallbackUsed ? "fallback" : answer.regenerated ? "guard_regenerated" : "ai");
  } catch (error) {
    console.warn("kael case question answer unavailable", {
      sessionId: input.sessionId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    text = input.language === "en"
      ? "Kael could not answer that question right now. Your case is unchanged; you can pick a next step below or ask again shortly."
      : "Kael chưa trả lời được câu hỏi này lúc này. Yêu cầu của bạn vẫn giữ nguyên; bạn có thể chọn bước tiếp theo bên dưới hoặc hỏi lại sau ít phút.";
    fallbackUsed = true;
  }
  const nextActions = await caseStateNextActions({
    client: input.client,
    session: input.session,
    quoteTurn,
    language: input.language,
    exclude: ["ask_question"],
  });
  const currentStatus = asKaelChatStatus(input.session.status);
  const turnTrace = caseTurnTrace(input, quoteTurn, traceFields);
  if (turnTrace) logKaelTurnTrace(turnTrace);
  await appendKaelSystemTurn(input.client, input.sessionId, {
    contentType: "clarification",
    text: text.slice(0, 4_000),
    nextStatus: currentStatus === "estimate_ready" ? "estimate_ready" : "active",
    telemetry,
    metadata: {
      answered_turn_intent: input.routing.intent,
      turn_intent_source: input.routing.source,
      turn_intent_confidence: input.routing.confidence,
      ...(input.routing.fallbackReason ? { turn_intent_fallback_reason: input.routing.fallbackReason } : {}),
      next_actions: nextActions,
      fallback_used: fallbackUsed,
      ...(turnTrace ? { turn_trace: turnTrace } : {}),
    },
  });
}

async function appendUnreadableCaseTurn(
  input: { client: DbClient; sessionId: string; session: Record<string, unknown>; language: "vi" | "en"; routing: CaseTurnRouting },
  reason: CaseContextRefusal,
) {
  console.warn("kael case context unreadable", { sessionId: input.sessionId, reason });
  await appendKaelSystemTurn(input.client, input.sessionId, {
    contentType: "clarification",
    text: unreadableCaseText(input.language),
    nextStatus: asKaelChatStatus(input.session.status) === "estimate_ready" ? "estimate_ready" : "active",
    telemetry: telemetryFromTrace(undefined, "fallback"),
    metadata: {
      answered_turn_intent: input.routing.intent,
      turn_intent_source: input.routing.source,
      turn_intent_confidence: input.routing.confidence,
      next_actions: [],
      fallback_used: true,
      case_context_unreadable: reason,
    },
  });
}
