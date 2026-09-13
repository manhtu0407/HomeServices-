import { dbQuery, type DbClient } from "../../platform/db.ts";
import { sendPushToUser, type PushResult } from "../../platform/push.ts";

type PushDispatchIdentity = {
  environment: string;
  releaseId: string;
  deploymentId: string | null;
  dispatcherId: string;
};
type OfficialPushClaim = {
  notification_id: string;
  job_id: string;
  user_id: string;
  candidate_id: string;
  event_type: "worker_matched" | "customer_confirmed_worker";
  lease_token: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const RETRYABLE = ["PUSH_CIRCUIT_OPEN", "RATE_LIMITED", "TOKEN_LOOKUP_FAILED", "IDEMPOTENCY_UNAVAILABLE"];

export async function dispatchOfficialMatchPush(client: DbClient, identity: PushDispatchIdentity) {
  if (!["staging", "production"].includes(identity.environment) ||
    !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(identity.releaseId) ||
    !identity.deploymentId || identity.deploymentId.length < 30 || identity.deploymentId.length > 160 ||
    !identity.dispatcherId.trim() || identity.dispatcherId.length > 160) {
    throw new Error("OFFICIAL_MATCH_PUSH_RELEASE_UNAVAILABLE");
  }
  const releaseArgs = { p_environment: identity.environment, p_release_id: identity.releaseId,
    p_deployment_id: identity.deploymentId };
  const summary = { claimed: 0, submitted: 0, unreachable: 0, recoveryRequired: 0,
    retryScheduled: 0, notStarted: 0, leaseLost: 0 };
  const claimDeadline = Date.now() + 15_000;
  // Claim one at a time so a slow provider cannot consume the leases of waiting recipients.
  for (let index = 0; index < 10 && Date.now() < claimDeadline; index += 1) {
    const result = await dbQuery<unknown>(client.rpc("claim_official_match_push", {
      ...releaseArgs, p_dispatcher_id: identity.dispatcherId, p_limit: 1,
    }));
    if (result.error || !Array.isArray(result.data) || result.data.length > 1) {
      throw new Error("OFFICIAL_MATCH_PUSH_CLAIM_FAILED");
    }
    if (result.data.length === 0) break;
    const claim = parseClaim(result.data[0]);
    summary.claimed += 1;
    const leaseArgs = { p_notification_id: claim.notification_id,
      p_lease_token: claim.lease_token, p_dispatcher_id: identity.dispatcherId };
    const start = await dbQuery<boolean>(client.rpc("begin_official_match_push", { ...leaseArgs, ...releaseArgs }));
    if (start.error || typeof start.data !== "boolean") throw new Error("OFFICIAL_MATCH_PUSH_START_UNKNOWN");
    if (!start.data) { summary.notStarted += 1; continue; }
    let receipt: ReturnType<typeof pushReceipt>;
    try {
      const worker = claim.event_type === "customer_confirmed_worker";
      const pushed = await sendPushToUser(client, claim.user_id, {
        title: worker ? "Khách đã xác nhận bạn" : "Đã xác nhận thợ",
        body: worker
          ? "Công việc đã được ghép. Bạn có thể xem hướng dẫn và chuẩn bị di chuyển."
          : "Bạn đã xác nhận thợ cho yêu cầu này. Hãy theo dõi tiến độ trong ứng dụng.",
        data: {
          event_type: claim.event_type, job_id: claim.job_id, candidate_id: claim.candidate_id,
          notification_id: claim.notification_id,
          deep_link: `/(${worker ? "worker" : "customer"})/${worker ? "jobs" : "history"}?job_id=${claim.job_id}`,
        },
        sound: "default",
      }, { environment: identity.environment, releaseId: identity.releaseId,
        operationId: "notification.official_match", idempotencyKey: `official-match:${claim.notification_id}` });
      receipt = pushReceipt(pushed);
    } catch {
      receipt = { outcome: "recovery_required", count: 0, code: "PUSH_OUTCOME_UNKNOWN" };
    }
    const finish = await dbQuery<boolean>(client.rpc("finish_official_match_push", {
      ...leaseArgs, p_outcome: receipt.outcome, p_submitted_count: receipt.count, p_error_code: receipt.code,
    }));
    if (finish.error || typeof finish.data !== "boolean") throw new Error("OFFICIAL_MATCH_PUSH_SETTLEMENT_UNKNOWN");
    if (!finish.data) { summary.leaseLost += 1; continue; }
    if (receipt.outcome === "submitted") summary.submitted += 1;
    else if (receipt.outcome === "unreachable") summary.unreachable += 1;
    else if (receipt.outcome === "retry") summary.retryScheduled += 1;
    else summary.recoveryRequired += 1;
  }
  return summary;
}

function parseClaim(value: unknown): OfficialPushClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("OFFICIAL_MATCH_PUSH_CLAIM_INVALID");
  const row = value as Record<string, unknown>;
  if (!["notification_id", "job_id", "user_id", "candidate_id", "lease_token"].every(
    (key) => typeof row[key] === "string" && UUID.test(row[key] as string)) ||
    !["worker_matched", "customer_confirmed_worker"].includes(String(row.event_type))) {
    throw new Error("OFFICIAL_MATCH_PUSH_CLAIM_INVALID");
  }
  return row as OfficialPushClaim;
}

function pushReceipt(result: PushResult): {
  outcome: "submitted" | "unreachable" | "recovery_required" | "retry"; count: number; code: string | null;
} {
  if (!Number.isSafeInteger(result.submitted) || result.submitted < 0 ||
    !Number.isSafeInteger(result.failed) || result.failed < 0 || !Array.isArray(result.errors) ||
    !result.errors.every((code) => typeof code === "string")) {
    return { outcome: "recovery_required", count: 0, code: "PUSH_RECEIPT_INVALID" };
  }
  if (result.submitted > 0) return { outcome: "submitted", count: result.submitted,
    code: result.failed || result.degraded ? "PUSH_PARTIAL_OR_UNRECONCILED" : null };
  // A completed harness key stores only a hash, not proof of a device or provider delivery.
  if (result.replayed) return { outcome: "recovery_required", count: 0, code: "PUSH_REPLAY_REQUIRES_RECONCILIATION" };
  if (result.errors.length > 0 && result.errors.every((code) => RETRYABLE.includes(code))) {
    return { outcome: "retry", count: 0, code: result.errors[0] };
  }
  if (!result.failed && !result.degraded && result.errors.length === 0) {
    return { outcome: "unreachable", count: 0, code: "NO_REGISTERED_PUSH_TOKEN" };
  }
  if (result.errors.length > 0 && result.errors.every((code) => code === "DeviceNotRegistered")) {
    return { outcome: "unreachable", count: 0, code: "PUSH_TOKEN_UNAVAILABLE" };
  }
  return { outcome: "recovery_required", count: 0, code: "PUSH_OUTCOME_UNKNOWN" };
}
