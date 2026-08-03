import {
  type LearningSkillInput,
  type LearningSkillTrigger,
  planLearningSkillTriggers,
} from "./skills/registry.ts";
import type {
  LearningQueueDbClient,
  QueueLearningForBatchSummary,
} from "./queue-read.ts";
export async function queueLearningForBatch(
  client: LearningQueueDbClient,
  event: LearningSkillTrigger,
  input: LearningSkillInput,
): Promise<QueueLearningForBatchSummary> {
  const planned = planLearningSkillTriggers(event, input);
  const summary = {
    queued: planned.filter((item) => item.queue_state === "queued").length,
    manual_review: planned.filter((item) => item.queue_state === "manual_review").length,
    rejected: planned.filter((item) => item.queue_state === "rejected").length,
    skill_ids: planned.map((item) => item.skill.id),
  };
  if (planned.length === 0) return summary;

  const rows = planned.map((item) => ({
    event_type: event,
    skill_id: item.skill.id,
    job_id: nullableString(input.job_id),
    actor_id: nullableString(input.actor_id) ?? nullableString(input.customer_id) ??
      nullableString(input.worker_id),
    actor_role: nullableString(input.actor_role),
    queue_state: item.queue_state === "queued" ? "pending" : item.queue_state,
    input_payload: safeRecord(input),
    candidate_payload: item.candidate,
    run_after: new Date().toISOString(),
  }));

  const result = await client.from("kael_learning_queue").insert(rows);
  if (result.error) return { ...summary, error_code: result.error.code ?? "DB_ERROR" };
  return summary;
}
export async function updateDeepSeekBatchItem(
  client: LearningQueueDbClient,
  batchId: string,
  queueId: string,
  patch: Record<string, unknown>,
) {
  const result = await client
    .from("kael_ai_batch_items")
    .update(patch)
    .eq("batch_id", batchId)
    .eq("queue_id", queueId)
    .select("id");
  if (result.error) {
    throw new Error(
      `DEEPSEEK_BATCH_ITEM_WRITE_FAILED:${result.error.code ?? "DB_ERROR"}`,
    );
  }
  if (Array.isArray(result.data) && result.data.length !== 1) {
    throw new Error("DEEPSEEK_BATCH_ITEM_WRITE_FAILED:ROW_NOT_FOUND");
  }
}

export async function updateAiBatch(
  client: LearningQueueDbClient,
  batchId: string,
  patch: Record<string, unknown>,
) {
  const result = await client
    .from("kael_ai_batches")
    .update(patch)
    .eq("id", batchId)
    .select("id");
  if (result.error) {
    throw new Error(`LEARNING_BATCH_WRITE_FAILED:${result.error.code ?? "DB_ERROR"}`);
  }
  if (Array.isArray(result.data) && result.data.length !== 1) {
    throw new Error("LEARNING_BATCH_WRITE_FAILED:ROW_NOT_FOUND");
  }
}
export async function completeRealtimeFallbackRows(
  client: LearningQueueDbClient,
  claimId: string,
  ids: string[],
  now: Date,
) {
  if (ids.length === 0) return;
  if (!client.rpc) {
    throw new Error("LEARNING_QUEUE_COMPLETION_FAILED:RPC_UNAVAILABLE");
  }
  const result = await client.rpc("complete_kael_learning_queue_realtime_atomic", {
    p_claim_id: claimId,
    p_queue_ids: ids,
    p_now: now.toISOString(),
  });
  if (result.error) {
    throw new Error(`LEARNING_QUEUE_COMPLETION_FAILED:${result.error.code ?? "DB_ERROR"}`);
  }
  if (!Array.isArray(result.data) || result.data.length !== ids.length) {
    throw new Error("LEARNING_QUEUE_COMPLETION_FAILED:RESULT_MISMATCH");
  }
}

export async function updateQueueRows(
  client: LearningQueueDbClient,
  claimId: string,
  ids: string[],
  patch: Record<string, unknown>,
) {
  if (ids.length === 0) return;
  const result = await client
    .from("kael_learning_queue")
    .update({ ...patch, claim_id: null, claimed_at: null })
    .in("id", ids)
    .eq("claim_id", claimId)
    .eq("queue_state", "processing")
    .select("id");
  if (result.error) {
    throw new Error(`LEARNING_QUEUE_WRITE_FAILED:${result.error.code ?? "DB_ERROR"}`);
  }
  if (Array.isArray(result.data) && result.data.length !== ids.length) {
    throw new Error("LEARNING_QUEUE_WRITE_FAILED:CLAIM_STALE");
  }
}

export async function releaseQueueRows(
  client: LearningQueueDbClient,
  claimId: string,
  ids: string[],
  errorCode: string,
) {
  await updateQueueRows(client, claimId, ids, {
    queue_state: "pending",
    error_code: errorCode.slice(0, 120),
    processed_at: null,
  });
}

export function queueCustomId(id: string): string {
  return `lq_${id.replace(/-/g, "").slice(0, 61)}`;
}

function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
