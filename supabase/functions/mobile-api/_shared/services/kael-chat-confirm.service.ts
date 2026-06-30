// Edge service kael-chat confirm-bridge (C4 6a, services/* split): confirmKaelChat — the customer
// confirms a Kael chat estimate -> confirm_kael_chat_atomic creates the job -> geocode -> confirmSearch
// (matching) with a chat-matching autonomy decision. Internal: matching-decision builder +
// confirmed-state reader. Imported by services.ts for wiring.

import { asBoolean, asString, nullableString } from "./coercions.ts";
import { db, dbQuery } from "./db.ts";
import { mapConfirmKaelChatError } from "./_shared.ts";
import { geocodeConfirmedKaelJob } from "./places-geo.service.ts";
import { confirmSearch } from "./matching.service.ts";
import { hasActiveBroadcast } from "./broadcasts.service.ts";
import { requireJobAccess } from "../access.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { buildKaelAutonomyDecision, type EdgeAiSecrets, type KaelAutonomyDecision } from "../kael/index.ts";
import type { JobStatus } from "../../../_shared/domain.ts";

export async function confirmKaelChat(
  ctx: MobileApiContext,
  sessionId: string,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("confirm_kael_chat_atomic", {
      p_session_id: sessionId,
      p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  if (!asBoolean(row.ok)) {
    const errorCode = nullableString(row.error_code);
    let existingJobId = nullableString(row.job_id);
    // Safety-net. The RPC normally
    // returns the recovered job_id on ALREADY_CONFIRMED, but if it doesn't
    // (e.g. session marked confirmed before the row update propagated), fall
    // back to a direct session lookup so double-confirm still resolves to
    // 200-with-current-state instead of bubbling 409 to the user.
    if (errorCode === "ALREADY_CONFIRMED" && !existingJobId) {
      const sessionLookup = await dbQuery<{ job_id: string | null }>(
        client
          .from("kael_chat_sessions")
          .select("job_id")
          .eq("id", sessionId)
          .eq("customer_id", ctx.user.id)
          .maybeSingle(),
      );
      existingJobId = nullableString(sessionLookup.data?.job_id ?? null);
    }
    if (errorCode === "ALREADY_CONFIRMED" && existingJobId) {
      const currentState = await readConfirmedKaelChatState(ctx, existingJobId);
      if (currentState.status === "awaiting_customer_confirm") {
        return {
          session_id: sessionId,
          ...(await confirmSearch(ctx, existingJobId, {
            autonomyDecision: buildKaelChatMatchingDecision(sessionId, existingJobId),
          })),
        };
      }
      return {
        session_id: sessionId,
        ...currentState,
      };
    }
    mapConfirmKaelChatError(errorCode);
  }

  const jobId = asString(row.job_id);
  if (!jobId) apiFailure("DB_ERROR", "Phiên Kael chưa tạo được yêu cầu", 500);
  await geocodeConfirmedKaelJob(
    client,
    sessionId,
    jobId,
    ctx.user.id,
    nullableString(row.district_code),
    secrets,
  );
  const confirmed = await confirmSearch(ctx, jobId, {
    autonomyDecision: buildKaelChatMatchingDecision(sessionId, jobId),
  });
  return {
    session_id: sessionId,
    ...confirmed,
  };
}

function buildKaelChatMatchingDecision(
  sessionId: string,
  jobId: string,
): KaelAutonomyDecision {
  return buildKaelAutonomyDecision({
    action: "start_matching",
    policyId: "kael.autonomy.v2.chat_estimate_to_matching",
    evidence: [
      {
        kind: "artifact",
        reference_id: sessionId,
        summary: "Validated Kael chat estimate and customer intake.",
      },
      {
        kind: "artifact",
        reference_id: jobId,
        summary: "Server-created job has locked Kael estimate and district.",
      },
      {
        kind: "policy",
        reference_id: "RULES.md#rule-7",
        summary: "Kael Autonomy v2 allows server-validated matching after estimate.",
      },
    ],
    confidence: 0.86,
    reversible: true,
    appealable: true,
    resultingEvent: "kael_started_matching",
  });
}

async function readConfirmedKaelChatState(
  ctx: MobileApiContext,
  jobId: string,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id",
  });
  const status = job.status as JobStatus;
  const broadcastSent = status === "broadcasting"
    ? await hasActiveBroadcast(client, jobId, new Date().toISOString())
    : false;

  return {
    job_id: jobId,
    status,
    broadcast_sent: broadcastSent,
    worker: null,
    message: "Phiên Kael đã được xác nhận. Đang đồng bộ trạng thái hiện tại.",
  };
}
