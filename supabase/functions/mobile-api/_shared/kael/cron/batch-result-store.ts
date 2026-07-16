import type {
  LearningQueueDbClient,
  QueuedLearningRow,
} from "./process-learning-queue.ts";

const CLAIM_LEASE_SECONDS = 30 * 60;
const RETRY_DELAY_MS = 5 * 60 * 1000;

export type ClaimedBatchRow = {
  id: string;
  provider_batch_id: string;
  status: string;
  next_poll_at: string | null;
  created_at: string;
};

export type BatchItemRow = {
  id: string;
  batch_id: string;
  queue_id: string | null;
  custom_id: string;
  skill_id: string;
  status?: string;
  request_payload?: unknown;
};

export type BatchItemCommitInput = {
  batchId: string;
  itemId: string;
  queueId: string | null;
  claimToken: string;
  itemStatus: "succeeded" | "errored" | "canceled" | "expired";
  responsePayload: Record<string, unknown>;
  errorPayload: Record<string, unknown>;
  queueState: "processed" | "manual_review" | "rejected" | "failed" | null;
  queueErrorCode: string | null;
  processedAt: string;
};

export type BatchClaimResult =
  | { ok: true; claimToken: string; batches: ClaimedBatchRow[] }
  | { ok: false; errorCode: string };

export type BatchPollStatusInput = {
  batchId: string;
  claimToken: string;
  status: "in_progress" | "ended";
  processingCount: number;
  succeededCount: number;
  erroredCount: number;
  canceledCount: number;
  expiredCount: number;
  resultsUrl: string | null;
  endedAt: string | null;
  expiresAt: string | null;
  nextPollAt: string;
};

export async function claimBatchResults(
  client: LearningQueueDbClient,
  options: { limit?: number; now: Date; forcePoll?: boolean },
): Promise<BatchClaimResult> {
  if (!client.rpc) return { ok: false, errorCode: "BATCH_CLAIM_RPC_UNAVAILABLE" };
  const claimToken = crypto.randomUUID();
  let result;
  try {
    result = await client.rpc("claim_kael_ai_batch_results", {
      p_limit: normalizeBatchLimit(options.limit),
      p_now: options.now.toISOString(),
      p_force_poll: options.forcePoll === true,
      p_lease_seconds: CLAIM_LEASE_SECONDS,
      p_claim_token: claimToken,
    });
  } catch {
    return { ok: false, errorCode: "BATCH_CLAIM_FAILED" };
  }
  if (result.error) return { ok: false, errorCode: "BATCH_CLAIM_FAILED" };
  if (!Array.isArray(result.data) || !result.data.every(isClaimedBatchRow)) {
    await releaseBatchClaims(client, claimToken, "BATCH_CLAIM_RESULT_INVALID");
    return { ok: false, errorCode: "BATCH_CLAIM_RESULT_INVALID" };
  }
  return { ok: true, claimToken, batches: result.data };
}

export async function releaseBatchClaims(
  client: LearningQueueDbClient,
  claimToken: string,
  errorCode: string,
): Promise<void> {
  if (!client.rpc) return;
  try {
    const result = await client.rpc("release_kael_ai_batch_results_claims", {
      p_claim_token: claimToken,
      p_retry_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
      p_error_code: errorCode,
    });
    if (result.error) {
      console.warn("Kael batch-result claim release failed", { errorCode: result.error.code });
    }
  } catch {
    // The lease expires independently, so a failed cleanup cannot strand the batch.
  }
}

export async function recordBatchPollStatus(
  client: LearningQueueDbClient,
  input: BatchPollStatusInput,
): Promise<boolean> {
  if (!client.rpc) return false;
  try {
    const result = await client.rpc("record_kael_ai_batch_poll", {
      p_batch_id: input.batchId,
      p_claim_token: input.claimToken,
      p_status: input.status,
      p_processing_count: input.processingCount,
      p_succeeded_count: input.succeededCount,
      p_errored_count: input.erroredCount,
      p_canceled_count: input.canceledCount,
      p_expired_count: input.expiredCount,
      p_results_url: input.resultsUrl,
      p_ended_at: input.endedAt,
      p_expires_at: input.expiresAt,
      p_next_poll_at: input.nextPollAt,
    });
    return !result.error;
  } catch {
    return false;
  }
}

export async function completeBatchResultClaim(
  client: LearningQueueDbClient,
  batchId: string,
  claimToken: string,
): Promise<boolean> {
  if (!client.rpc) return false;
  try {
    const result = await client.rpc("complete_kael_ai_batch_results_claim", {
      p_batch_id: batchId,
      p_claim_token: claimToken,
    });
    return !result.error;
  } catch {
    return false;
  }
}

export async function commitBatchItemResult(
  client: LearningQueueDbClient,
  input: BatchItemCommitInput,
): Promise<{ ok: true } | { ok: false; errorCode: string }> {
  if (!client.rpc) return { ok: false, errorCode: "BATCH_CLAIM_RPC_UNAVAILABLE" };
  try {
    const commit = await client.rpc("commit_kael_ai_batch_item_result", {
      p_batch_id: input.batchId,
      p_item_id: input.itemId,
      p_queue_id: input.queueId,
      p_claim_token: input.claimToken,
      p_item_status: input.itemStatus,
      p_response_payload: input.responsePayload,
      p_error_payload: input.errorPayload,
      p_queue_state: input.queueState,
      p_queue_error_code: input.queueErrorCode,
      p_processed_at: input.processedAt,
    });
    if (commit.error) return { ok: false, errorCode: "BATCH_ITEM_COMMIT_FAILED" };
    return { ok: true };
  } catch {
    return { ok: false, errorCode: "BATCH_ITEM_COMMIT_FAILED" };
  }
}

export async function renewBatchResultClaim(
  client: LearningQueueDbClient,
  batchId: string,
  claimToken: string,
): Promise<boolean> {
  if (!client.rpc) return false;
  try {
    const result = await client.rpc("renew_kael_ai_batch_results_claim", {
      p_batch_id: batchId,
      p_claim_token: claimToken,
      p_claimed_at: new Date().toISOString(),
    });
    return !result.error;
  } catch {
    return false;
  }
}

export async function fetchBatchItems(
  client: LearningQueueDbClient,
  batchId: string,
): Promise<{ ok: true; rows: BatchItemRow[] } | { ok: false }> {
  try {
    const result = await client
      .from("kael_ai_batch_items")
      .select("id,batch_id,queue_id,custom_id,skill_id,status,request_payload")
      .eq("batch_id", batchId);
    if (result.error || !Array.isArray(result.data)) return { ok: false };
    return { ok: true, rows: result.data as BatchItemRow[] };
  } catch {
    return { ok: false };
  }
}

export async function fetchQueueRows(
  client: LearningQueueDbClient,
  ids: string[],
): Promise<{ ok: true; rows: QueuedLearningRow[] } | { ok: false }> {
  if (ids.length === 0) return { ok: true, rows: [] };
  try {
    const result = await client
      .from("kael_learning_queue")
      .select("id,event_type,skill_id,job_id,actor_id,actor_role,queue_state,input_payload,candidate_payload,attempts,created_at")
      .in("id", ids);
    if (result.error || !Array.isArray(result.data)) return { ok: false };
    return { ok: true, rows: result.data as QueuedLearningRow[] };
  } catch {
    return { ok: false };
  }
}

function normalizeBatchLimit(limit: number | undefined): number {
  if (!Number.isInteger(limit)) return 10;
  return Math.min(50, Math.max(1, limit as number));
}

function isClaimedBatchRow(value: unknown): value is ClaimedBatchRow {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" &&
    typeof value.provider_batch_id === "string" &&
    typeof value.status === "string" &&
    (value.next_poll_at === null || typeof value.next_poll_at === "string") &&
    typeof value.created_at === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
