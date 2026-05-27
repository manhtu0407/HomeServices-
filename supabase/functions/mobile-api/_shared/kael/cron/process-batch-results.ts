import { readKaelOptimizationFlags } from "../cost-tracking.ts";
import {
  retrieveAnthropicBatchResults,
  retrieveAnthropicMessageBatch,
  type AnthropicBatchResult,
} from "../provider-batch.ts";
import type { EdgeAiSecrets } from "../types.ts";
import {
  insertLearningLifecycleRows,
  type LearningQueueDbClient,
  type QueuedLearningRow,
} from "./process-learning-queue.ts";

type BatchRow = {
  id: string;
  provider_batch_id: string | null;
  status: string;
  next_poll_at: string | null;
  created_at: string;
};

type BatchItemRow = {
  id: string;
  batch_id: string;
  queue_id: string | null;
  custom_id: string;
  skill_id: string;
};

export type ProcessBatchResultsSummary = {
  checked: number;
  ended: number;
  processed_items: number;
  failed_items: number;
  skipped_reason?: string;
  error_code?: string;
};

export async function processBatchResults(
  client: LearningQueueDbClient,
  secrets: EdgeAiSecrets,
  options: { limit?: number; now?: Date; forcePoll?: boolean } = {},
): Promise<ProcessBatchResultsSummary> {
  const flags = readKaelOptimizationFlags();
  if (!flags.KAEL_OPT_BATCH_API_ENABLED) {
    return { checked: 0, ended: 0, processed_items: 0, failed_items: 0, skipped_reason: "batch_api_disabled" };
  }
  const now = options.now ?? new Date();
  let batchesQuery = client
    .from("kael_ai_batches")
    .select("id,provider_batch_id,status,next_poll_at,created_at")
    .in("status", ["submitted", "in_progress", "ended"])
  if (!options.forcePoll) {
    batchesQuery = batchesQuery.lte("next_poll_at", now.toISOString());
  }
  const batchesResult = await batchesQuery
    .order("created_at", { ascending: true })
    .limit(options.limit ?? 10);

  if (batchesResult.error) {
    return { checked: 0, ended: 0, processed_items: 0, failed_items: 0, error_code: batchesResult.error.code ?? "DB_ERROR" };
  }

  const batches = Array.isArray(batchesResult.data)
    ? batchesResult.data as BatchRow[]
    : [];
  let ended = 0;
  let processedItems = 0;
  let failedItems = 0;

  for (const batch of batches) {
    if (!batch.provider_batch_id) continue;
    const remote = await retrieveAnthropicMessageBatch(secrets, batch.provider_batch_id);
    const remoteStatus = remote.processing_status === "ended" ? "ended" : "in_progress";
    await client.from("kael_ai_batches").update({
      status: remoteStatus,
      processing_count: remote.request_counts?.processing ?? 0,
      succeeded_count: remote.request_counts?.succeeded ?? 0,
      errored_count: remote.request_counts?.errored ?? 0,
      canceled_count: remote.request_counts?.canceled ?? 0,
      expired_count: remote.request_counts?.expired ?? 0,
      results_url: remote.results_url ?? null,
      ended_at: remote.ended_at ?? null,
      expires_at: remote.expires_at ?? null,
      next_poll_at: remoteStatus === "ended"
        ? now.toISOString()
        : new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    }).eq("id", batch.id);

    if (remote.processing_status !== "ended") continue;
    ended += 1;

    const results = await retrieveAnthropicBatchResults(secrets, batch.provider_batch_id);
    const itemRows = await fetchBatchItems(client, batch.id);
    const queueRows = await fetchQueueRows(
      client,
      itemRows.map((item) => item.queue_id).filter((id): id is string => typeof id === "string"),
    );
    const queuesById = new Map(queueRows.map((row) => [row.id, row]));
    const itemsByCustomId = new Map(itemRows.map((item) => [item.custom_id, item]));

    for (const result of results) {
      const item = itemsByCustomId.get(result.custom_id);
      if (!item) continue;
      const queue = item.queue_id ? queuesById.get(item.queue_id) : undefined;
      if (result.result.type === "succeeded" && queue) {
        await insertLearningLifecycleRows(client, [queue], "batch_processed");
        await client.from("kael_ai_batch_items").update({
          status: "succeeded",
          response_payload: result.result.message ?? {},
          processed_at: now.toISOString(),
        }).eq("id", item.id);
        await client.from("kael_learning_queue").update({
          queue_state: "processed",
          processed_at: now.toISOString(),
        }).eq("id", queue.id);
        processedItems += 1;
      } else {
        await markItemFailed(client, item.id, result, now);
        if (queue) {
          await client.from("kael_learning_queue").update({
            queue_state: "failed",
            error_code: result.result.type.toUpperCase(),
          }).eq("id", queue.id);
        }
        failedItems += 1;
      }
    }

    await client.from("kael_ai_batches").update({
      status: "results_processed",
      next_poll_at: null,
    }).eq("id", batch.id);
  }

  return {
    checked: batches.length,
    ended,
    processed_items: processedItems,
    failed_items: failedItems,
  };
}

async function fetchBatchItems(
  client: LearningQueueDbClient,
  batchId: string,
): Promise<BatchItemRow[]> {
  const result = await client
    .from("kael_ai_batch_items")
    .select("id,batch_id,queue_id,custom_id,skill_id")
    .eq("batch_id", batchId);
  return Array.isArray(result.data) ? result.data as BatchItemRow[] : [];
}

async function fetchQueueRows(
  client: LearningQueueDbClient,
  ids: string[],
): Promise<QueuedLearningRow[]> {
  if (ids.length === 0) return [];
  const result = await client
    .from("kael_learning_queue")
    .select("id,event_type,skill_id,job_id,actor_id,actor_role,queue_state,input_payload,candidate_payload,attempts,created_at")
    .in("id", ids);
  return Array.isArray(result.data) ? result.data as QueuedLearningRow[] : [];
}

async function markItemFailed(
  client: LearningQueueDbClient,
  itemId: string,
  result: AnthropicBatchResult,
  now: Date,
) {
  await client.from("kael_ai_batch_items").update({
    status: result.result.type,
    error_payload: result.result.error ?? { type: result.result.type },
    processed_at: now.toISOString(),
  }).eq("id", itemId);
}
