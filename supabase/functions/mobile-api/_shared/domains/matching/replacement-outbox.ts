import { asServiceType, asString, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { notifyBroadcastWorkers, notifyCustomerWorkerReplacementSearch } from "../notification/notifications.ts";

type ReplacementClaim = { outboxId: string; leaseToken: string };
type ReplacementSettlement = "completed" | "retry_scheduled" | "dead_letter" | "lease_lost";

export async function dispatchWorkerReplacementOutbox(
  client: DbClient,
  options: { dispatcherId: string; limit?: number; leaseSeconds?: number },
) {
  const claimed = await dbQuery<Array<Record<string, unknown>>>(client.rpc("claim_worker_replacement_outbox_batch", {
    p_dispatcher_id: options.dispatcherId,
    p_limit: options.limit ?? 20,
    p_lease_seconds: options.leaseSeconds ?? 45,
  }));
  if (claimed.error) throw new Error("REPLACEMENT_OUTBOX_CLAIM_FAILED");
  const claims = (claimed.data ?? []).map((row): ReplacementClaim => {
    const outboxId = nullableString(row.outbox_id);
    const leaseToken = nullableString(row.lease_token);
    if (!outboxId || !leaseToken) throw new Error("REPLACEMENT_OUTBOX_CLAIM_INVALID");
    return { outboxId, leaseToken };
  });
  const summary = { claimed: claims.length, completed: 0, retryScheduled: 0, deadLettered: 0, leaseLost: 0 };
  for (let offset = 0; offset < claims.length; offset += 4) {
    const outcomes = await Promise.all(claims.slice(offset, offset + 4).map((claim) => processClaim(client, claim)));
    for (const outcome of outcomes) {
      if (outcome === "completed") summary.completed += 1;
      else if (outcome === "retry_scheduled") summary.retryScheduled += 1;
      else if (outcome === "dead_letter") summary.deadLettered += 1;
      else summary.leaseLost += 1;
    }
  }
  return summary;
}

async function processClaim(client: DbClient, claim: ReplacementClaim): Promise<ReplacementSettlement> {
  let state = "recovery_required";
  let errorCode: string | null = "REPLACEMENT_DISPATCH_FAILED";
  try {
    const activated = await dbQuery<Record<string, unknown>>(client.rpc("activate_worker_replacement_outbox_claim", {
      p_outbox_id: claim.outboxId, p_lease_token: claim.leaseToken,
    }));
    if (activated.error || !activated.data) throw new Error("REPLACEMENT_ACTIVATION_FAILED");
    const data = activated.data;
    if (data.state === "lease_lost") return "lease_lost";
    state = asString(data.state);
    errorCode = state === "recovery_required" ? nullableString(data.error_code) ?? errorCode : null;
    if (state === "broadcasting") {
      const matchingReason = data.matching_reason;
      if (matchingReason !== undefined && matchingReason !== "worker_cancellation" &&
        matchingReason !== "customer_retry" && matchingReason !== "saved_worker_fallback") {
        throw new Error("MATCHING_REASON_INVALID");
      }
      const targets = Array.isArray(data.targets) ? data.targets.map((value) => {
        const target = nullableRecord(value);
        const workerId = nullableString(target?.worker_id);
        const broadcastId = nullableString(target?.broadcast_id);
        const deliveryId = nullableString(target?.delivery_id);
        const operationId = nullableString(target?.operation_id);
        if (!workerId || !broadcastId || !deliveryId || !operationId) throw new Error("REPLACEMENT_TARGET_INVALID");
        return { workerId, broadcastId, deliveryId, operationId };
      }) : [];
      if (!targets.length || !nullableString(data.job_id) || !nullableString(data.expires_at)) {
        throw new Error("REPLACEMENT_RECEIPT_INVALID");
      }
      await notifyBroadcastWorkers(client, asString(data.job_id), asServiceType(data.service_type),
        asString(data.district), asString(data.expires_at), targets);
      if (matchingReason === undefined || matchingReason === "worker_cancellation") {
        await notifyCustomerWorkerReplacementSearch(client, asString(data.job_id), nullableString(data.customer_id), true);
      }
    }
  } catch {
    state = "recovery_required";
    errorCode = "REPLACEMENT_DISPATCH_FAILED";
  }
  const result = await dbQuery<string>(client.rpc("settle_worker_replacement_outbox_claim", {
    p_outbox_id: claim.outboxId, p_lease_token: claim.leaseToken,
    p_state: state, p_error_code: errorCode,
  }));
  if (result.error || !["completed", "retry_scheduled", "dead_letter", "lease_lost"].includes(result.data ?? "")) {
    return "lease_lost";
  }
  return result.data as ReplacementSettlement;
}
