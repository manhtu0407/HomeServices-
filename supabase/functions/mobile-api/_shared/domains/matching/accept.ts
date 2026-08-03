import { asJobStatus, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { mapAcceptError } from "../../platform/domain-error-mappers.ts";
import { logJobEvent } from "../../platform/audit.ts";
import { notifyCustomerCandidateReady } from "./candidate.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import type { JobStatus } from "../../../../_shared/domain.ts";

export async function acceptBroadcast(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("accept_broadcast_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
  if (!row.ok) {
    if (row.error_code === "EXPIRED") {
      await logJobEvent(client, jobId, "broadcast_expired", ctx, null, null, {
        reason: "EXPIRED via RPC",
      });
    }
    mapAcceptError(nullableString(row.error_code));
  }
  const transition = validateWorkflowTransition({
    event: "worker_accepted",
    from: "broadcasting",
    to: asJobStatus(row.job_status),
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const candidateId = nullableString(row.candidate_id);
  if (!candidateId) apiFailure("DB_ERROR", "Lỗi khi ghi nhận thợ đề xuất", 500);
  const alreadyApplied = row.already_applied === true;
  if (!alreadyApplied) {
    await logJobEvent(
      client,
      jobId,
      "worker_accepted",
      ctx,
      "broadcasting",
      "worker_candidate_pending",
      { candidate_id: candidateId },
    );
    await notifyCustomerCandidateReady(client, jobId, candidateId);
  }
  return {
    job_id: jobId,
    status: row.job_status as JobStatus,
    candidate_id: candidateId,
    awaiting_customer_confirmation: true as const,
    already_applied: alreadyApplied,
  };
}
