import { dbQuery, type DbClient } from "../../platform/db.ts";
import { sendPushToUser } from "../../platform/push.ts";

type ReplyNudgeClaim = { nudge_id: string; job_id: string; worker_id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function parseClaim(value: unknown): ReplyNudgeClaim {
  const row = value as Record<string, unknown> | null;
  const ids = [row?.nudge_id, row?.job_id, row?.worker_id];
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) {
    throw new Error("REPLY_NUDGE_CLAIM_MALFORMED");
  }
  return { nudge_id: ids[0] as string, job_id: ids[1] as string, worker_id: ids[2] as string };
}

// The database has already written the reminder to the chat and the worker's inbox; the push
// only makes it reach a worker whose app is closed, so a failed push is logged, not retried.
export async function dispatchWorkerReplyNudges(
  client: DbClient,
  options: { limit: number; environment: string; releaseId: string },
) {
  const result = await dbQuery<unknown>(client.rpc("claim_worker_reply_nudges", { p_limit: options.limit }));
  if (result.error || !Array.isArray(result.data)) throw new Error("REPLY_NUDGE_CLAIM_FAILED");
  const claims = result.data.map(parseClaim);
  const summary = { claimed: claims.length, pushed: 0, pushFailed: 0 };
  for (const claim of claims) {
    const push = await sendPushToUser(client, claim.worker_id, {
      title: "Khách đang chờ bạn trả lời",
      body: "Khách đã nhắn trong phòng việc. Trả lời sớm để khách yên tâm.",
      data: {
        event_type: "worker_reply_nudge",
        job_id: claim.job_id,
        deep_link: `/(worker)/jobs?job_id=${claim.job_id}`,
      },
      sound: "default",
    }, {
      environment: options.environment,
      releaseId: options.releaseId,
      operationId: "notification.worker_reply_nudge",
      idempotencyKey: `reply-nudge:${claim.nudge_id}`,
    }).catch(() => ({ submitted: 0, failed: 1 }));
    if (push.failed > 0) summary.pushFailed += 1;
    else summary.pushed += 1;
  }
  return summary;
}
