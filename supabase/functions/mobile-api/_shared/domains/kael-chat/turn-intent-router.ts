// Decides what a customer's Work turn is asking for before price research runs again. New case
// information still goes to the estimate pipeline; questions, reference-price requests, worker-quote
// requests and "go ahead" are answered from the case as it stands. Nothing here confirms an offer.

import {
  kaelTurnIntentSchema,
  type EdgeKaelNextAction,
  type EdgeKaelTurnIntent,
} from "../../../../_shared/contracts/kael-next-actions.ts";
import { kaelDiagnosisScopeArtifactSchema, type EdgeAiSecrets } from "../../kael/index.ts";
import { classifyCaseTurnIntent } from "../../kael/tools/case-turn-intent.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { asKaelChatStatus, asRecord, nullableString } from "../../platform/coercions.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
import type { DbClient } from "../../platform/db.ts";
import {
  answerKaelCaseQuestion,
  caseStateNextActions,
  readCaseRecentTurns,
  type CaseTurnRouting,
} from "./case-question.service.ts";
import { pendingClarificationSlotOf, slotAskCountsOf } from "./case-work-artifact.ts";
import { applyEvidenceGapRfqFallback } from "./evidence-gap-fallback.ts";
import {
  EVIDENCE_GAP_QUOTE_READINESS,
  evidenceGapRfqFallbackAvailable,
  latestQuoteReadinessTurn,
} from "./evidence-gap-policy.ts";
import { evidenceGapProbe, parseReferencePriceNote, referencePriceText } from "./evidence-gap-response.ts";
import { canonicalReplyComposer, type ReplyComposer } from "./reply-composer.ts";
import { appendKaelSystemTurn, updateKaelSession, type KaelTurnTelemetry } from "./session-store.ts";

// Only these may arrive as an explicit chip choice; anything else is classified from the text.
const CHIP_INTENTS = new Set<EdgeKaelTurnIntent>(["request_reference_price", "request_worker_quote", "ask_question"]);

export async function resolveCaseTurnRouting(input: {
  ctx: MobileApiContext;
  client: DbClient;
  sessionId: string;
  session: Record<string, unknown>;
  message: string;
  language: "vi" | "en";
  chipIntent?: string;
  secrets: EdgeAiSecrets;
}): Promise<{ routing: CaseTurnRouting; quoteTurn: Record<string, unknown> | null }> {
  const chip = kaelTurnIntentSchema.safeParse(input.chipIntent);
  const isChip = chip.success && CHIP_INTENTS.has(chip.data);
  // Two independent reads; the classifier needs both, a chip only the first.
  const [quoteTurn, recentTurns] = await Promise.all([
    latestQuoteReadinessTurn(input.client, input.sessionId),
    isChip ? Promise.resolve([]) : readCaseRecentTurns(input.client, input.sessionId),
  ]);
  if (chip.success && isChip) {
    return { routing: { intent: chip.data, source: "chip", confidence: 1 }, quoteTurn };
  }
  const artifact = kaelDiagnosisScopeArtifactSchema.safeParse(input.session.diagnosis_scope);
  const pendingSlot = artifact.success
    ? pendingClarificationSlotOf(artifact.data, slotAskCountsOf(input.session.safe_metadata))
    : null;
  const classified = await classifyCaseTurnIntent({
    actorId: input.ctx.user.id,
    hasLinkedJob: nullableString(input.session.job_id) !== null,
    language: input.language,
    message: input.message,
    pendingSlot: pendingSlot && artifact.success && artifact.data.next_action.kind === "ask_question"
      ? { slot: pendingSlot, question: artifact.data.next_action.question }
      : null,
    openSlots: artifact.success ? artifact.data.missing_facts.filter((slot) => slot !== pendingSlot) : [],
    recentTurns,
    state: {
      casePhase: nullableString(input.session.case_phase),
      quoteReadiness: nullableString(quoteTurn?.quote_readiness),
      missingFacts: artifact.success ? artifact.data.missing_facts : [],
      hasEstimate: asKaelChatStatus(input.session.status) === "estimate_ready",
      quoteMode: nullableString(asRecord(asRecord(input.session.safe_metadata).intake_coverage).quote_mode),
    },
    client: input.client,
    secrets: input.secrets,
  });
  return {
    routing: {
      intent: classified.intent,
      source: classified.fallbackUsed ? "fallback" : "ai",
      confidence: classified.confidence,
      telemetry: classified.telemetry,
      slotUnderstanding: classified.slotUnderstanding,
    },
    quoteTurn,
  };
}

// Returns true when the turn was answered here; false sends it to the estimate pipeline as before.
export async function routeKaelChatTurnIntent(input: {
  // The routing the caller already resolved for this turn, so the classifier runs once.
  resolved?: Awaited<ReturnType<typeof resolveCaseTurnRouting>>;
  composeReply?: ReplyComposer;
  ctx: MobileApiContext;
  client: DbClient;
  sessionId: string;
  session: Record<string, unknown>;
  persistedMetadata: Record<string, unknown>;
  message: string;
  language: "vi" | "en";
  chipIntent?: string;
  secrets: EdgeAiSecrets;
}): Promise<boolean> {
  const { routing, quoteTurn } = input.resolved ?? await resolveCaseTurnRouting(input);
  await updateKaelSession(input.client, input.sessionId, {
    safe_metadata: compactMetadata({
      ...input.persistedMetadata,
      last_turn_intent: {
        intent: routing.intent,
        source: routing.source,
        confidence: routing.confidence,
        ...(routing.telemetry
          ? {
            provider: routing.telemetry.provider,
            model: routing.telemetry.model,
            latency_ms: Math.round(routing.telemetry.latencyMs),
            cost_usd: routing.telemetry.costUsd,
          }
          : {}),
        at: new Date().toISOString(),
      },
    }),
  });
  const inGap = quoteTurn?.quote_readiness === EVIDENCE_GAP_QUOTE_READINESS;
  const offerReady = asKaelChatStatus(input.session.status) === "estimate_ready";
  switch (routing.intent) {
    case "provide_information":
    case "correction":
      return false;
    case "ask_question":
    case "off_topic_or_smalltalk":
    case "request_human_or_complaint":
      await answerKaelCaseQuestion({ ...input, routing });
      await restoreReviewPhase(input);
      return true;
    case "request_reference_price":
      if (!inGap && !offerReady) return false;
      await respondReferencePrice(input, routing, quoteTurn, inGap);
      await restoreReviewPhase(input);
      return true;
    case "proceed_or_confirm":
      if (!inGap && !offerReady) return false;
      await respondProceed(input, routing, quoteTurn, inGap);
      await restoreReviewPhase(input);
      return true;
    case "request_worker_quote":
      await respondWorkerQuote(input, routing, quoteTurn, offerReady);
      return true;
  }
}

// An incoming turn always parks the session in analysis; a reply that did not re-analyse the case
// puts an offer that was under review back where the customer left it.
async function restoreReviewPhase(input: { client: DbClient; sessionId: string; session: Record<string, unknown> }) {
  const casePhase = nullableString(input.session.case_phase);
  if (asKaelChatStatus(input.session.status) !== "estimate_ready" || !casePhase || casePhase === "analysis") return;
  await updateKaelSession(input.client, input.sessionId, { case_phase: casePhase });
}

async function appendRoutedReply(
  input: { client: DbClient; sessionId: string; session: Record<string, unknown> },
  routing: CaseTurnRouting,
  text: string,
  nextActions: EdgeKaelNextAction[],
  extra: Record<string, unknown> = {},
  telemetry: KaelTurnTelemetry = { replySource: "template" },
) {
  await appendKaelSystemTurn(input.client, input.sessionId, {
    contentType: "clarification",
    text,
    nextStatus: asKaelChatStatus(input.session.status) === "estimate_ready" ? "estimate_ready" : "active",
    telemetry,
    metadata: {
      answered_turn_intent: routing.intent,
      turn_intent_source: routing.source,
      turn_intent_confidence: routing.confidence,
      next_actions: nextActions,
      ...extra,
    },
  });
}

// Notices about the case state are returned as written.
function composeNotice(
  input: Parameters<typeof routeKaelChatTurnIntent>[0],
  canonical: string,
  mustKeep: readonly string[] = [],
) {
  // These sentences state where the case stands (offer ready, nothing sent yet); a reworded version could
  // invert that, so they stay canned. Only the injected composer (tests) may handle them.
  return (input.composeReply ?? canonicalReplyComposer)({ kind: "notice", canonical, customerSaid: input.message, mustKeep });
}

async function respondReferencePrice(
  input: Parameters<typeof routeKaelChatTurnIntent>[0],
  routing: CaseTurnRouting,
  quoteTurn: Record<string, unknown> | null,
  inGap: boolean,
) {
  const vi = input.language === "vi";
  const nextActions = await caseStateNextActions({
    client: input.client,
    session: input.session,
    quoteTurn,
    language: input.language,
    exclude: ["request_reference_price"],
  });
  if (!inGap) {
    const offered = await composeNotice(input, vi
      ? "Kael đã có đề xuất giá cho việc này ở thẻ phía trên. Bạn xem lại phạm vi và xác nhận nếu đồng ý; Kael không tự xác nhận thay bạn."
      : "Kael already has a price offer for this case in the card above. Review the scope and confirm if you agree; Kael never confirms for you.", [vi ? "xác nhận" : "confirm"]);
    await appendRoutedReply(input, routing, offered.text, nextActions, {}, offered.telemetry);
    return;
  }
  const reference = parseReferencePriceNote(quoteTurn?.reference_price);
  const serviceProblemId = nullableString(quoteTurn?.service_problem_id);
  const rfqAvailable = serviceProblemId
    ? await evidenceGapRfqFallbackAvailable(input.client, serviceProblemId)
    : false;
  // A reference range carries a figure and the price disclaimer, so it is never reworded.
  const noSources = reference ? null : await composeNotice(input, vi
    ? "Hiện Kael chưa có đủ nguồn giá công khai cho đúng việc này để đưa ra khoảng tham khảo, và Kael không đoán giá khi chưa có nguồn."
    : "Kael does not yet have enough public price sources for this exact work to show a reference range, and it does not guess a price without sources.", [vi ? "không đoán" : "guess"]);
  const opening = reference ? referencePriceText(reference, input.language) : noSources?.text ?? "";
  await appendRoutedReply(
    input,
    routing,
    [opening, ...(rfqAvailable ? [evidenceGapProbe(input.language)] : [])].join("\n\n"),
    nextActions,
    reference ? { reference_price: reference } : {},
    noSources?.telemetry,
  );
}

async function respondProceed(
  input: Parameters<typeof routeKaelChatTurnIntent>[0],
  routing: CaseTurnRouting,
  quoteTurn: Record<string, unknown> | null,
  inGap: boolean,
) {
  const vi = input.language === "vi";
  const nextActions = await caseStateNextActions({
    client: input.client,
    session: input.session,
    quoteTurn,
    language: input.language,
  });
  const text = inGap
    ? (vi
      ? "Kael chưa có giá đã kiểm chứng nên chưa thể tạo đề xuất để bạn xác nhận. Bạn có thể nhờ thợ phù hợp báo giá từ ảnh, hoặc bổ sung thông tin để Kael tìm lại."
      : "Kael has no verified price yet, so there is no offer to confirm. You can ask a suitable worker to quote from your photos, or add details so Kael can search again.")
    : (vi
      ? "Để Kael bắt đầu tìm thợ, bạn bấm nút xác nhận trên thẻ đề xuất. Kael không tự xác nhận thay bạn."
      : "To let Kael start finding a worker, press the confirm button on the offer card. Kael never confirms for you.");
  const proceed = await composeNotice(input, text, [vi ? (inGap ? "báo giá" : "xác nhận") : (inGap ? "quote" : "confirm")]);
  await appendRoutedReply(input, routing, proceed.text, nextActions, {}, proceed.telemetry);
}

async function respondWorkerQuote(
  input: Parameters<typeof routeKaelChatTurnIntent>[0],
  routing: CaseTurnRouting,
  quoteTurn: Record<string, unknown> | null,
  offerReady: boolean,
) {
  const outcome = await applyEvidenceGapRfqFallback({
    client: input.client,
    sessionId: input.sessionId,
    session: input.session,
    language: input.language,
  });
  if (outcome.status !== "not_eligible") return;
  const vi = input.language === "vi";
  const nextActions = await caseStateNextActions({
    client: input.client,
    session: input.session,
    quoteTurn,
    language: input.language,
    exclude: ["request_worker_quote"],
  });
  const text = offerReady
    ? (vi
      ? "Kael đã có đề xuất cho việc này. Sau khi bạn bấm xác nhận trên thẻ đề xuất, Kael mới bắt đầu tìm thợ phù hợp."
      : "Kael already has an offer for this case. Kael starts finding a worker only after you confirm it on the offer card.")
    : outcome.reason === "policy_disallows"
    ? (vi
      ? "Với loại việc này, Kael cần một mức giá đã kiểm chứng trước khi gửi thợ. Bạn có thể bổ sung ảnh hoặc thông tin để Kael tìm lại."
      : "For this kind of work Kael needs a verified price before sending it to workers. Add photos or details so Kael can search again.")
    : (vi
      ? "Kael cần hoàn tất phân tích yêu cầu trước khi gửi cho thợ. Bạn bổ sung thông tin còn thiếu để Kael tiếp tục nhé."
      : "Kael needs to finish analysing the request before sending it to workers. Add the missing details so Kael can continue.");
  const notice = await composeNotice(input, text, offerReady ? [vi ? "xác nhận" : "confirm"] : []);
  await appendRoutedReply(input, routing, notice.text, nextActions, { worker_quote_unavailable_reason: outcome.reason }, notice.telemetry);
  await restoreReviewPhase(input);
}
