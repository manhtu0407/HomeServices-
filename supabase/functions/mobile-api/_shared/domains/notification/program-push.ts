import { dbQuery, type DbClient } from "../../platform/db.ts";
import { sendPushToUser } from "../../platform/push.ts";

// The mobile twin is apps/mobile/lib/program-notification-routes.ts; the push path allowlist in
// apps/mobile/lib/push-notifications.ts accepts exactly these two.
const CUSTOMER_COMPENSATION_ROUTE = "/(customer)/history?section=compensation";
const WORKER_VIOLATIONS_ROUTE = "/(worker)/earnings?ns_worker_screen=4.7-violations";

type ProgramPushClaim = {
  notification_id: string;
  user_id: string;
  recipient_role: "customer" | "worker";
  event_type: string;
  title: string;
  body: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function parseClaim(value: unknown): ProgramPushClaim | null {
  const row = value as Record<string, unknown> | null;
  if (
    typeof row?.notification_id !== "string" || !UUID.test(row.notification_id)
    || typeof row.user_id !== "string" || !UUID.test(row.user_id)
    || (row.recipient_role !== "customer" && row.recipient_role !== "worker")
    || typeof row.event_type !== "string" || typeof row.title !== "string" || typeof row.body !== "string"
  ) {
    return null;
  }
  return row as ProgramPushClaim;
}

// The notice is already in the inbox; the push only reaches a closed app, so a failed push is
// counted and logged by the maintainer, never retried under a new key. A malformed row is
// skipped rather than pushed to an unknown user, without dropping the rest of the batch.
export async function dispatchProgramPushes(
  client: DbClient,
  options: { limit: number; environment: string; releaseId: string },
) {
  const result = await dbQuery<unknown>(client.rpc("claim_program_pushes", { p_limit: options.limit }));
  if (result.error || !Array.isArray(result.data)) throw new Error("PROGRAM_PUSH_CLAIM_FAILED");
  const summary = { claimed: result.data.length, pushed: 0, pushFailed: 0, malformed: 0 };
  for (const row of result.data) {
    const claim = parseClaim(row);
    if (!claim) {
      summary.malformed += 1;
      continue;
    }
    const push = await sendPushToUser(client, claim.user_id, {
      title: claim.title,
      body: claim.body,
      data: {
        event_type: claim.event_type,
        notification_id: claim.notification_id,
        deep_link: claim.recipient_role === "worker" ? WORKER_VIOLATIONS_ROUTE : CUSTOMER_COMPENSATION_ROUTE,
      },
      sound: "default",
    }, {
      environment: options.environment,
      releaseId: options.releaseId,
      operationId: "notification.program_push",
      idempotencyKey: `program-push:${claim.notification_id}`,
    }).catch(() => ({ submitted: 0, failed: 1 }));
    if (push.failed > 0) summary.pushFailed += 1;
    else summary.pushed += 1;
  }
  return summary;
}
