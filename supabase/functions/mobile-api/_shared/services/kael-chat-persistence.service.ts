import type { KaelDiagnosisScopeArtifact } from "../kael/index.ts";
import { buildVoiceTranscriptRow } from "../kael/voice-transcript.ts";
import { apiFailure } from "../router.ts";
import { dbQuery, type DbClient } from "./db.ts";

export async function persistInitialVoiceTranscripts(
  client: DbClient,
  userId: string,
  sessionId: string,
  evidenceItems: KaelDiagnosisScopeArtifact["evidence"],
) {
  try {
    await persistReviewedVoiceTranscripts(client, userId, sessionId, evidenceItems);
  } catch (error) {
    await retireFailedKaelSessionCreate(client, sessionId, userId);
    throw error;
  }
}

export async function persistReviewedVoiceTranscripts(
  client: DbClient,
  userId: string,
  sessionId: string,
  evidenceItems: KaelDiagnosisScopeArtifact["evidence"],
) {
  const transcripts = evidenceItems
    .filter((evidence) => evidence.kind === "voice_transcript")
    .map((evidence) => evidence.transcript)
    .filter((value): value is string => Boolean(value));
  if (transcripts.length === 0) return;

  const builtRows = transcripts.map((text) => buildVoiceTranscriptRow({
    actorRole: "customer",
    sessionId,
    source: "on_device_stt",
    text,
    userId,
  }));
  if (builtRows.some((row) => row === null)) {
    apiFailure("VALIDATION", "Bản chép lời giọng nói chưa an toàn để lưu", 400);
  }
  const rows = builtRows.flatMap((row) => row ? [{
    actor_role: row.actor_role,
    region_hint: row.region_hint,
    safe_metadata: row.safe_metadata,
    scrubbed_text: row.scrubbed_text,
    session_id: row.session_id,
    source: row.source,
    user_id: row.user_id,
  }] : []);
  const stored = await dbQuery<Array<{ id: string }>>(
    client.from("kael_voice_transcript").insert(rows).select("id"),
  );
  if (stored.error) {
    apiFailure("DB_ERROR", "Không thể lưu bản chép lời giọng nói", 500);
  }
}

export async function retireFailedKaelSessionCreate(
  client: DbClient,
  sessionId: string,
  customerId: string,
) {
  const retired = await dbQuery<{ id: string }>(
    client
      .from("kael_chat_sessions")
      .update({ client_request_id: null, status: "abandoned" })
      .eq("id", sessionId)
      .eq("customer_id", customerId)
      .eq("status", "active")
      .eq("total_turns", 0)
      .select("id")
      .maybeSingle(),
  );
  if (retired.error) {
    console.warn("mobile-api Kael session create cleanup failed", {
      sessionId,
      errorCode: retired.error.code,
    });
    return;
  }
  if (!retired.data) return;

  const archived = await dbQuery<{ id: string }>(
    client
      .from("kael_customer_conversations")
      .update({ archived_at: new Date().toISOString(), pinned_at: null })
      .eq("customer_id", customerId)
      .eq("case_session_id", sessionId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle(),
  );
  if (archived.error) {
    console.warn("mobile-api Kael catalog create cleanup failed", {
      sessionId,
      errorCode: archived.error.code,
    });
  }
}
