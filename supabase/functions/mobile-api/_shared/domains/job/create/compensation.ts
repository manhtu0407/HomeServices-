import { logJobEvent } from "../../../platform/audit.ts";
import { dbQuery, type DbClient } from "../../../platform/db.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import { validateWorkflowTransition } from "../../../workflow-orchestrator.ts";

type RetireAnalyzingJobInput = {
  readonly client: DbClient;
  readonly jobId: string;
  readonly actor: MobileApiContext;
  readonly reasonCode: string;
  readonly cleanupFailureMessage: string;
  readonly metadata?: Record<string, unknown>;
};

export async function retireAnalyzingJobOrFail(
  input: RetireAnalyzingJobInput,
) {
  const cleanupOk = await cancelAnalyzingJob(
    input.client,
    input.jobId,
    input.actor,
    input.reasonCode,
    input.metadata,
  );
  if (!cleanupOk) {
    apiFailure("DB_ERROR", input.cleanupFailureMessage, 500);
  }
}

async function cancelAnalyzingJob(
  client: DbClient,
  jobId: string,
  actor: MobileApiContext,
  reasonCode: string,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const cancelledAt = new Date().toISOString();
  const transition = validateWorkflowTransition({
    event: "kael_failed",
    from: "analyzing",
    to: "cancelled",
  });
  if (!transition.valid) {
    console.warn("mobile-api analyzing job cleanup transition rejected", {
      jobId,
      reasonCode,
      error: transition.error,
    });
    return false;
  }
  const cancelResult = await dbQuery(
    client
      .from("jobs")
      .update({
        status: "cancelled",
        cancelled_at: cancelledAt,
        // A terminal create failure must release the idempotency key. The
        // mobile client intentionally keeps that key across retries; retaining
        // it here would make every retry resolve to this cancelled shell and
        // return JOB_PENDING forever.
        client_request_id: null,
      })
      .eq("id", jobId)
      .eq("status", "analyzing")
      .select("id")
      .maybeSingle(),
  ).catch((error) => ({
    data: null,
    error: {
      code: "CLEANUP_THROW",
      message: error instanceof Error ? error.name : "cleanup failed",
    },
  }));

  if (cancelResult.error) {
    console.warn("mobile-api analyzing job cleanup failed", {
      jobId,
      reasonCode,
      errorCode: cancelResult.error.code,
    });
    return false;
  }
  if (!cancelResult.data) {
    console.warn("mobile-api analyzing job cleanup matched no rows", {
      jobId,
      reasonCode,
    });
    return false;
  }

  await logJobEvent(
    client,
    jobId,
    "kael_failed",
    actor,
    "analyzing",
    "cancelled",
    { reason_code: reasonCode, ...metadata },
  );
  return true;
}
