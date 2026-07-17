import { db, dbQuery } from "../_runtime/db.ts";
import {
  parseKaelProgressSnapshot,
  serializeKaelSession,
  serializeKaelTurn,
} from "../_runtime/shared.ts";
import { assertKaelSessionOwnership } from "./session-store.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";

export async function getKaelChat(ctx: MobileApiContext, sessionId: string) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, job_id, customer_id, service_type, status, case_phase, diagnosis_scope, scheduled_at, started_at, estimate_ready_at, total_turns, total_cost_usd, safe_metadata, created_at",
      )
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  assertKaelSessionOwnership(sessionResult.data, ctx);

  const turnsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_chat_turns")
      .select(
        "id, session_id, turn_index, role, content_type, text_content, media_refs, safe_metadata, created_at",
      )
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true }),
  );
  if (turnsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải lịch sử Kael", 500);
  }

  const turns = (turnsResult.data ?? []).map(serializeKaelTurn);
  const latestEstimate = [...turns]
    .reverse()
    .find((turn) => turn.content_type === "estimate")?.estimate ?? null;

  return {
    session: serializeKaelSession(sessionResult.data, latestEstimate, turns),
    turns,
  };
}

export async function getKaelChatProgress(
  ctx: MobileApiContext,
  sessionId: string,
) {
  return readKaelChatProgressSnapshot(ctx, sessionId);
}

export async function readKaelChatProgressSnapshot(
  ctx: MobileApiContext,
  sessionId: string,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, customer_id, kael_progress")
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  assertKaelSessionOwnership(sessionResult.data, ctx);

  return {
    session_id: sessionId,
    progress: parseKaelProgressSnapshot(sessionResult.data.kael_progress, sessionId),
  };
}
