import {
  asKaelChatStatus,
  asNumber,
  asRecord,
  asString,
  nullableNumber,
  nullableString,
} from "../../platform/coercions.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { normalizeKaelResponseBrand } from "../../kael/language/user-facing-copy.ts";
import { kaelIntakeConfirmationSchema } from "../../kael/pipeline/intake-confirmation.ts";
import { publishKaelChatReply } from "./reply-channel.ts";
import { clarificationNextActions } from "./clarification-next-actions.ts";

export type KaelReplySource = "ai" | "template" | "fallback" | "guard_regenerated";

// Which writer produced a Kael turn and what it cost, so replies can be compared across paths.
export type KaelTurnTelemetry = {
  readonly provider?: "anthropic" | "deepseek" | "perplexity" | null;
  readonly model?: string | null;
  readonly latencyMs?: number | null;
  readonly costUsd?: number | null;
  readonly replySource?: KaelReplySource;
};

type ExistingKaelSessionByClientRequest =
  | { kind: "ready"; sessionId: string }
  | { kind: "pending" }
  | null;

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

export function withoutEphemeralKaelMediaUrls(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const { photo_urls: _ephemeralSignedUrls, ...durableMetadata } = metadata;
  return durableMetadata;
}

export function isIntakeConfirmationPending(metadata: Record<string, unknown>) {
  const confirmation = kaelIntakeConfirmationSchema.safeParse(
    metadata.intake_confirmation,
  );
  return confirmation.success && confirmation.data.status === "pending";
}

export function assertIntakeConfirmationCompleted(metadata: Record<string, unknown>) {
  if (isIntakeConfirmationPending(metadata)) {
    apiFailure(
      "INTAKE_CONFIRMATION_REQUIRED",
      "Hãy xác nhận thông tin trước khi Kael tiếp tục.",
      409,
    );
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
      .select("id, job_id, status, estimate_ready_at, total_turns, safe_metadata")
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
  const intentionallyEmpty = asRecord(result.data.safe_metadata)
    .initial_turn_expected === false;
  if (!hasMaterializedTurn && !hasJob && !hasEstimate && !intentionallyEmpty) {
    return { kind: "pending" };
  }
  return { kind: "ready", sessionId };
}

export async function appendKaelSystemTurn(
  client: DbClient,
  sessionId: string,
  input: {
    contentType: "analysis" | "clarification" | "estimate" | "error";
    text: string;
    nextStatus: ReturnType<typeof asKaelChatStatus>;
    // The turn this reply follows, when the caller has just written it or found it in the table. Without it the
    // reply follows the session's counter, which a write that failed half-way leaves behind the table.
    afterTurnIndex?: number;
    // A reply that does not move the Case leaves the time its offer was made untouched.
    keepEstimateTimestamp?: boolean;
    estimate?: unknown;
    costUsd?: number;
    telemetry?: KaelTurnTelemetry;
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
  const nextIndex = (input.afterTurnIndex ?? asNumber(sessionResult.data.total_turns)) + 1;
  const textContent = normalizeKaelResponseBrand(input.text);
  // The pipeline cost and a composer or answer call on the same turn are separate spend.
  const totalCost = (input.costUsd ?? 0) + (input.telemetry?.costUsd ?? 0);
  const turnMetadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (input.telemetry?.replySource && turnMetadata.reply_source === undefined) {
    turnMetadata.reply_source = input.telemetry.replySource;
  }
  if (input.contentType === "clarification" && turnMetadata.next_actions === undefined) {
    const language = asRecord(sessionResult.data.safe_metadata).language === "en" ? "en" : "vi";
    const actions = clarificationNextActions(turnMetadata, language);
    if (actions.length > 0) turnMetadata.next_actions = actions;
  }
  const inserted = await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: nextIndex,
    role: "kael",
    content_type: input.contentType,
    text_content: textContent,
    media_refs: [],
    safe_metadata: turnMetadata,
    cost_usd: input.costUsd === undefined && input.telemetry?.costUsd === undefined ? null : totalCost,
    ai_provider: input.telemetry?.provider ?? null,
    ai_model: input.telemetry?.model ?? null,
    latency_ms: input.telemetry?.latencyMs === undefined || input.telemetry.latencyMs === null
      ? null
      : Math.max(0, Math.round(input.telemetry.latencyMs)),
  });
  // An estimate renders as its own card, not as streamed text.
  if (input.contentType !== "estimate" && typeof inserted.id === "string") {
    publishKaelChatReply(sessionId, { turnId: inserted.id, text: textContent });
  }
  const sessionUpdate: Record<string, unknown> = {
    total_turns: nextIndex,
    total_cost_usd: asNumber(sessionResult.data.total_cost_usd) +
      totalCost,
    status: input.nextStatus,
  };
  if (input.nextStatus === "estimate_ready" && !input.keepEstimateTimestamp) {
    sessionUpdate.estimate_ready_at = new Date().toISOString();
  }
  const askedSlot = askedClarificationSlot(input.contentType, turnMetadata);
  if (input.sessionMetadata || askedSlot) {
    const existing = asRecord(sessionResult.data.safe_metadata);
    const askCounts = asRecord(existing.slot_ask_counts);
    sessionUpdate.safe_metadata = compactMetadata({
      ...existing,
      ...(input.sessionMetadata ?? {}),
      ...(askedSlot
        ? { slot_ask_counts: { ...askCounts, [askedSlot]: asNumber(askCounts[askedSlot]) + 1 } }
        : {}),
    });
  }
  await updateKaelSession(client, sessionId, sessionUpdate);
}

// The detail a clarification turn asks for, so a question asked twice can be told from one asked once.
// An explanation of the same question is not a new ask.
function askedClarificationSlot(
  contentType: string,
  turnMetadata: Record<string, unknown>,
): string | null {
  if (contentType !== "clarification" || turnMetadata.clarification_source === "deterministic_explanation") {
    return null;
  }
  const scope = asRecord(turnMetadata.diagnosis_scope);
  if (asRecord(scope.next_action).kind !== "ask_question") return null;
  const first = Array.isArray(scope.missing_facts) ? scope.missing_facts[0] : null;
  return typeof first === "string" && first.length > 0 ? first.slice(0, 80) : null;
}

export function slotAskCount(sessionMetadata: unknown, slot: string): number {
  return asNumber(asRecord(asRecord(sessionMetadata).slot_ask_counts)[slot]);
}

export async function getKaelChatCostUsd(
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
