import { type DbClient, dbQuery } from "../../platform/db.ts";
import type { JobStatus } from "../../../../_shared/domain.ts";

export async function rollbackFailedBroadcastStart(
  client: DbClient,
  jobId: string,
  customerId: string,
  previousStatus: JobStatus,
): Promise<boolean> {
  const result = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({
        status: previousStatus,
        broadcast_at: null,
        confirmed_search_at: null,
      })
      .eq("id", jobId)
      .eq("customer_id", customerId)
      .eq("status", "broadcasting")
      .select("id")
      .maybeSingle(),
  );
  return !result.error && Boolean(result.data);
}

export async function restoreKaelOfferAfterBroadcastFailure(
  client: DbClient,
  sessionId: string,
  jobId: string,
  customerId: string,
) {
  const result = await dbQuery<{ id: string }>(
    client
      .from("kael_chat_sessions")
      .update({ status: "estimate_ready", case_phase: "offer_review" })
      .eq("id", sessionId)
      .eq("job_id", jobId)
      .eq("customer_id", customerId)
      .eq("case_phase", "matching")
      .select("id")
      .maybeSingle(),
  );
  return !result.error && Boolean(result.data);
}
