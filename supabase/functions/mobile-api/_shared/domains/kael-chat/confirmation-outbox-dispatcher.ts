import { kaelDiagnosisScopeArtifactSchema, type EdgeAiSecrets } from "../../kael/index.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { executeConfirmedKaelMatching } from "./confirm.service.ts";

export type ConfirmationOutboxClaim = {
  outboxId: string;
  leaseToken: string;
  operationId: string;
  customerId: string;
  sessionId: string;
  jobId: string;
  diagnosisScope: unknown;
  preferredWorkerId: string | null;
  attemptCount: number;
};

type SettlementOutcome = "completed" | "retry_scheduled" | "dead_letter" | "lease_lost";

type DispatchOptions = {
  dispatcherId: string;
  limit?: number;
  leaseSeconds?: number;
  concurrency?: number;
  processClaim?: (
    claim: ConfirmationOutboxClaim,
    runtime: { client: DbClient; secrets: EdgeAiSecrets },
  ) => Promise<SettlementOutcome>;
};

export async function dispatchConfirmationMatchingOutbox(
  client: DbClient,
  secrets: EdgeAiSecrets,
  options: DispatchOptions,
) {
  const limit = options.limit ?? 20;
  const leaseSeconds = options.leaseSeconds ?? 45;
  const claimed = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("claim_confirmation_matching_outbox_batch", {
      p_dispatcher_id: options.dispatcherId,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    }),
  );
  if (claimed.error) throw new Error("CONFIRMATION_OUTBOX_CLAIM_FAILED");
  const claims = (claimed.data ?? []).map(parseClaim);
  const processClaim = options.processClaim ?? processConfirmationOutboxClaim;
  const concurrency = options.concurrency ?? 4;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("CONFIRMATION_OUTBOX_CONCURRENCY_INVALID");
  }
  const summary = {
    claimed: claims.length,
    completed: 0,
    retryScheduled: 0,
    deadLettered: 0,
    leaseLost: 0,
  };
  for (let offset = 0; offset < claims.length; offset += concurrency) {
    const outcomes = await Promise.all(
      claims.slice(offset, offset + concurrency).map((claim) =>
        processClaim(claim, { client, secrets })
      ),
    );
    for (const outcome of outcomes) {
      if (outcome === "completed") summary.completed += 1;
      else if (outcome === "retry_scheduled") summary.retryScheduled += 1;
      else if (outcome === "dead_letter") summary.deadLettered += 1;
      else summary.leaseLost += 1;
    }
  }
  return summary;
}

async function processConfirmationOutboxClaim(
  claim: ConfirmationOutboxClaim,
  runtime: { client: DbClient; secrets: EdgeAiSecrets },
): Promise<SettlementOutcome> {
  let state: "broadcasting" | "no_reachable_worker" | "recovery_required";
  let errorCode: string | null = null;
  try {
    const diagnosis = kaelDiagnosisScopeArtifactSchema.safeParse(claim.diagnosisScope);
    const ctx: MobileApiContext = {
      success: true,
      user: { id: claim.customerId },
      role: "customer",
      supabase: runtime.client,
      privilegedSupabase: runtime.client,
      userSupabase: runtime.client,
    };
    state = await executeConfirmedKaelMatching({
      ctx,
      diagnosisScope: diagnosis.success ? diagnosis.data : null,
      input: {},
      jobId: claim.jobId,
      preferredWorkerId: claim.preferredWorkerId,
      sessionId: claim.sessionId,
      secrets: runtime.secrets,
    });
  } catch {
    state = "recovery_required";
    errorCode = "MATCHING_RECONCILIATION_FAILED";
  }
  const settled = await dbQuery<string>(
    runtime.client.rpc("settle_confirmation_matching_outbox_claim", {
      p_outbox_id: claim.outboxId,
      p_lease_token: claim.leaseToken,
      p_operation_id: claim.operationId,
      p_state: state,
      p_error_code: errorCode,
    }),
  );
  if (settled.error || !isSettlementOutcome(settled.data)) return "lease_lost";
  return settled.data;
}

function parseClaim(row: Record<string, unknown>): ConfirmationOutboxClaim {
  const required = (field: string) => {
    const value = row[field];
    if (typeof value !== "string" || !value) throw new Error("CONFIRMATION_OUTBOX_CLAIM_INVALID");
    return value;
  };
  const attemptCount = row.attempt_count;
  if (!Number.isSafeInteger(attemptCount) || Number(attemptCount) < 1) {
    throw new Error("CONFIRMATION_OUTBOX_CLAIM_INVALID");
  }
  return {
    outboxId: required("outbox_id"),
    leaseToken: required("lease_token"),
    operationId: required("operation_id"),
    customerId: required("customer_id"),
    sessionId: required("session_id"),
    jobId: required("job_id"),
    diagnosisScope: row.diagnosis_scope ?? null,
    preferredWorkerId: typeof row.preferred_worker_id === "string" ? row.preferred_worker_id : null,
    attemptCount: Number(attemptCount),
  };
}

function isSettlementOutcome(value: unknown): value is SettlementOutcome {
  return value === "completed" || value === "retry_scheduled" ||
    value === "dead_letter" || value === "lease_lost";
}
