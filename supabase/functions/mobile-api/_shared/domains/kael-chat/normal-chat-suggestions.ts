import type {
  EdgeNormalChatSuggestionsRequest,
  EdgeNormalChatSuggestionsResponse,
} from "../../../../_shared/customer-kael-conversation-contract.ts";
import type { NormalChatSessionRole } from "../../kael/kael-memory/normal-chat-session.ts";
import {
  loadNormalChatSessionContext,
  type NormalChatSessionContext,
  type EdgeAiSecrets,
} from "../../kael/index.ts";
import { takeDurableKaelChatRateLimit } from "../../kael/kael-guardrails/durable-guards.ts";
import type { StructuredAIInvoker } from "../../kael/kael-providers/structured-call.ts";
import { generateNormalChatSuggestions } from "../../kael/tools/normal-chat-suggestions.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { asString, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";

type NormalChatSuggestionRole = NormalChatSessionRole;

export async function createNormalChatSuggestions(
  ctx: MobileApiContext,
  actorRole: NormalChatSuggestionRole,
  sessionId: string,
  input: EdgeNormalChatSuggestionsRequest,
  secrets: EdgeAiSecrets,
  invoke?: StructuredAIInvoker,
): Promise<EdgeNormalChatSuggestionsResponse> {
  if (ctx.role !== actorRole || (actorRole !== "customer" && actorRole !== "worker")) {
    apiFailure("NOT_FOUND", unavailableSessionMessage(input.language), 404);
  }

  const client = db(ctx);
  const actorId = ctx.user.id;
  await readActiveNormalChatSession(client, ctx, actorRole, sessionId, input.language);
  const sourceTurn = await readLatestTurn(client, actorRole, sessionId, actorId, input.language);
  if (sourceTurn.role !== "kael" || sourceTurn.id !== input.source_turn_id) {
    apiFailure("STALE_SOURCE", staleSourceMessage(input.language), 409);
  }

  const rate = await takeDurableKaelChatRateLimit(client, `suggestions:${actorRole}:${actorId}`);
  if (!rate.allowed) {
    apiFailure("RATE_LIMITED", rate.reason === "hour"
      ? input.language === "vi" ? "Bạn đã đạt giới hạn gợi ý trong 1 giờ. Vui lòng thử lại sau." : "You have reached the suggestion limit for this hour. Please try again later."
      : input.language === "vi" ? "Bạn đang yêu cầu gợi ý quá nhanh. Vui lòng thử lại sau ít phút." : "Suggestions are being requested too quickly. Please try again in a few minutes.", 429);
  }

  let context: NormalChatSessionContext;
  try {
    context = await loadNormalChatSessionContext(client, {
      actorRole,
      actorId,
      sessionId,
    }, { strictDatabaseReads: true });
  } catch (error) {
    console.warn("normal-chat suggestion context unavailable", {
      actorRole,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    apiFailure("DB_ERROR", contextUnavailableMessage(input.language), 503);
  }
  const latestContextTurn = context.previousTurns.at(-1);
  if (!latestContextTurn || latestContextTurn.role !== "kael" || latestContextTurn.id !== input.source_turn_id) {
    apiFailure("STALE_SOURCE", staleSourceMessage(input.language), 409);
  }

  const suggestions = await generateNormalChatSuggestions({
    actorRole,
    actorId,
    sessionId,
    sourceTurnId: input.source_turn_id,
    language: input.language,
    context,
    client,
    secrets,
    invoke,
  });

  await readActiveNormalChatSession(client, ctx, actorRole, sessionId, input.language);
  const latestTurn = await readLatestTurn(client, actorRole, sessionId, actorId, input.language);
  if (latestTurn.role !== "kael" || latestTurn.id !== input.source_turn_id) {
    apiFailure("STALE_SOURCE", staleSourceMessage(input.language), 409);
  }

  return {
    status: suggestions ? "ready" : "unavailable",
    session_id: sessionId,
    source_turn_id: input.source_turn_id,
    language: input.language,
    suggestions: [...(suggestions ?? [])],
  };
}

async function readActiveNormalChatSession(
  client: DbClient,
  ctx: MobileApiContext,
  actorRole: NormalChatSuggestionRole,
  sessionId: string,
  language: "vi" | "en",
) {
  const table = actorRole === "customer" ? "kael_customer_conversations" : "kael_worker_chat_sessions";
  const actorColumn = actorRole === "customer" ? "customer_id" : "worker_id";
  let query = client.from(table).select(
    actorRole === "customer" ? "id, customer_id, chat_mode, case_session_id, archived_at" : "id, worker_id, chat_mode, job_id, status, closed_at, archived_at",
  )
    .eq("id", sessionId)
    .eq(actorColumn, ctx.user.id)
    .eq("chat_mode", "normal")
    .is("archived_at", null);
  if (actorRole === "worker") {
    query = query.is("job_id", null).eq("status", "active").is("closed_at", null);
  }
  const result = await dbQuery<Record<string, unknown>>(query.maybeSingle());
  if (result.error) apiFailure("DB_ERROR", contextUnavailableMessage(language), 503);
  const row = result.data;
  if (!row || (actorRole === "customer" && nullableString(row.case_session_id))) {
    apiFailure("NOT_FOUND", unavailableSessionMessage(language), 404);
  }
  return row;
}

async function readLatestTurn(
  client: DbClient,
  actorRole: NormalChatSuggestionRole,
  sessionId: string,
  actorId: string,
  language: "vi" | "en",
) {
  const table = actorRole === "customer" ? "kael_customer_conversation_turns" : "kael_worker_chat_turns";
  const sessionColumn = actorRole === "customer" ? "conversation_id" : "session_id";
  let query = client.from(table).select("id, role, turn_index")
    .eq(sessionColumn, sessionId)
    .order("turn_index", { ascending: false })
    .limit(1);
  if (actorRole === "customer") query = query.eq("customer_id", actorId);
  else query = query.is("job_id", null);
  const result = await dbQuery<Record<string, unknown>>(query.maybeSingle());
  if (result.error) apiFailure("DB_ERROR", contextUnavailableMessage(language), 503);
  if (!result.data) apiFailure("STALE_SOURCE", staleSourceMessage(language), 409);
  return { id: asString(result.data.id), role: asString(result.data.role) };
}

function unavailableSessionMessage(language: "vi" | "en") {
  return language === "vi" ? "Không tìm thấy phiên Chat thường này." : "This normal-chat session was not found.";
}

function staleSourceMessage(language: "vi" | "en") {
  return language === "vi" ? "Phiên trò chuyện đã có nội dung mới. Hãy tải lại gợi ý." : "The conversation has changed. Refresh suggestions to continue.";
}

function contextUnavailableMessage(language: "vi" | "en") {
  return language === "vi" ? "Chưa thể tải gợi ý lúc này. Chat vẫn dùng bình thường." : "Suggestions are unavailable right now. Chat is still ready to use.";
}
