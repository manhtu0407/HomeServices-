import type { KaelChatCreateInput } from "../../../../_shared/domain.ts";
import type { KaelDiagnosisScopeArtifact } from "../../kael/index.ts";
import { buildVoiceTranscriptRow } from "../../kael/tools/voice-transcript.ts";
import { ensureCustomerCaseConversation } from "../customer/kael-conversation.ts";
import { asString } from "../../platform/coercions.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { findExistingKaelSessionByClientRequest } from "./session-store.ts";

type CreateKaelChatSessionInput = KaelChatCreateInput & {
  readonly client: DbClient;
  readonly ctx: MobileApiContext;
  readonly metadata: Record<string, unknown>;
  readonly initialDiagnosisScope: KaelDiagnosisScopeArtifact;
  readonly initialEvidenceItems: Parameters<typeof persistInitialVoiceTranscripts>[3];
};

export async function createKaelChatSession(
  input: CreateKaelChatSessionInput,
) {
  const {
    client,
    ctx,
    metadata,
    initialDiagnosisScope,
    initialEvidenceItems,
  } = input;
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .insert({
        customer_id: ctx.user.id,
        service_type: input.service_type,
        status: "active",
        case_phase: "analysis",
        diagnosis_scope: initialDiagnosisScope,
        scheduled_at: input.scheduled_at ?? null,
        preferred_worker_id: input.preferred_worker_id ?? null,
        safe_metadata: metadata,
        client_request_id: input.client_request_id ?? null,
      })
      .select(
        "id, job_id, customer_id, service_type, status, case_phase, diagnosis_scope, scheduled_at, started_at, estimate_ready_at, total_turns, total_cost_usd, safe_metadata, created_at",
      )
      .single(),
  );
  // Lost race against a concurrent create with the same client_request_id ->
  // fall back to the winner instead of bubbling 23505 to the mobile client.
  if (
    sessionResult.error?.code === "23505" && input.client_request_id
  ) {
    const recovered = await findExistingKaelSessionByClientRequest(
      client,
      ctx.user.id,
      input.client_request_id,
    );
    if (recovered?.kind === "ready") {
      await ensureCustomerCaseConversation(
        ctx,
        recovered.sessionId,
        input.client_request_id,
      );
      return { kind: "existing" as const, sessionId: recovered.sessionId };
    }
    if (recovered?.kind === "pending") {
      apiFailure(
        "SESSION_PENDING",
        "Phiên Kael đang được tạo. Vui lòng thử lại sau.",
        409,
      );
    }
  }
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("DB_ERROR", "Không thể tạo phiên Kael", 500);
  }
  const createdSessionId = asString(sessionResult.data.id);
  await persistInitialVoiceTranscripts(
    client,
    ctx.user.id,
    createdSessionId,
    initialEvidenceItems,
  );

  return { kind: "created" as const, sessionId: createdSessionId };
}

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
