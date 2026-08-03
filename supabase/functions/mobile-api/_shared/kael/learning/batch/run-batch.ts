import { readKaelOptimizationFlags } from "../../kael-usage/cost-tracking.ts";
import {
  retrieveAnthropicBatchResults,
  retrieveAnthropicMessageBatch,
  type AnthropicBatchResult,
  type AnthropicBatchSummary,
} from "../../kael-providers/provider-batch.ts";
import {
  finalizeBatchItemSpend,
  recordBatchLearningOutputHealth,
} from "../cron/batch-result-guards.ts";
import { parseBatchLearningCandidate } from "../cron/batch-learning-candidate.ts";
import {
  claimBatchResults,
  commitBatchItemResult,
  completeBatchResultClaim,
  fetchBatchItems,
  fetchQueueRows,
  recordBatchPollStatus,
  releaseBatchClaims,
  renewBatchResultClaim,
  type BatchItemRow,
  type ClaimedBatchRow,
} from "../cron/batch-result-store.ts";
import {
  candidateStatusForGate,
  type BatchLearningCandidateStatus,
} from "../cron/batch-learning-lifecycle.ts";
import {
  commitLearningEffectResult,
  type LearningEffectCandidate,
  type LearningEffectPlan,
} from "../cron/learning-effect-store.ts";
import type { EdgeAiSecrets } from "../../contracts/types.ts";
import {
  KAEL_CASE_WORK_SERVICE_TYPES,
  type KaelCaseWorkServiceType,
} from "../performance-profiles.ts";
import {
  type LearningQueueDbClient,
  type QueuedLearningRow,
} from "../cron/process-learning-queue.ts";
import {
  enforceLearningScopeLimits,
  evaluateLearningEvidenceGate,
  getLearningSkill,
  resolveLearningRuntimeConfig,
  type LearningEvidenceSnapshot,
  type LearningLifecycleState,
  type LearningSkillCandidate,
} from "../skills/registry.ts";

import { processLearningCandidateResponse } from "./effect-plan.ts";
import type { LearningEvidenceCache } from "./evidence-stats.ts";

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
  const claim = await claimBatchResults(client, {
    limit: options.limit,
    now,
    forcePoll: options.forcePoll,
  });
  if (!claim.ok) return emptyBatchSummary(claim.errorCode);
  return processClaimedBatchResults(client, secrets, now, claim.batches, claim.claimToken);
}

type BatchResultProcessingOutcome = {
  ok: boolean;
  errorCode?: string;
  ended: number;
  processedItems: number;
  failedItems: number;
};

async function processClaimedBatchResults(
  client: LearningQueueDbClient,
  secrets: EdgeAiSecrets,
  now: Date,
  batches: ClaimedBatchRow[],
  claimToken: string,
): Promise<ProcessBatchResultsSummary> {
  let ended = 0;
  let processedItems = 0;
  let failedItems = 0;
  for (const batch of batches) {
    const outcome = await processSingleBatchResult({
      client, secrets, now, batch, claimToken,
    });
    ended += outcome.ended;
    processedItems += outcome.processedItems;
    failedItems += outcome.failedItems;
    if (!outcome.ok) {
      return failBatchSummary(
        client,
        claimToken,
        now,
        batches.length,
        ended,
        processedItems,
        failedItems,
        outcome.errorCode ?? "BATCH_RESULT_PROCESSING_FAILED",
      );
    }
  }
  return {
    checked: batches.length,
    ended,
    processed_items: processedItems,
    failed_items: failedItems,
  };
}

async function processSingleBatchResult(input: {
  client: LearningQueueDbClient;
  secrets: EdgeAiSecrets;
  now: Date;
  batch: ClaimedBatchRow;
  claimToken: string;
}): Promise<BatchResultProcessingOutcome> {
  let remote: AnthropicBatchSummary;
  try {
    remote = await retrieveAnthropicMessageBatch(input.secrets, input.batch.provider_batch_id);
  } catch {
    return batchFailure("BATCH_PROVIDER_POLL_FAILED");
  }
  if (!await writeBatchPollStatus(input.client, input.batch, input.claimToken, input.now, remote)) {
    return batchFailure("BATCH_STATUS_WRITE_FAILED");
  }
  if (remote.processing_status !== "ended") return batchSuccess();
  const loaded = await loadCompletedBatchData(input.client, input.secrets, input.batch);
  if (!loaded.ok) return batchFailure(loaded.errorCode, 1);
  const itemOutcome = await processCompletedBatchItems({
    ...input,
    results: loaded.results,
    itemsByCustomId: loaded.itemsByCustomId,
    queuesById: loaded.queuesById,
  });
  if (!itemOutcome.ok) return { ...itemOutcome, ended: 1 };
  if (!await completeBatchResultClaim(input.client, input.batch.id, input.claimToken)) {
    return batchFailure("BATCH_FINALIZE_FAILED", 1, itemOutcome.processedItems, itemOutcome.failedItems);
  }
  return { ...itemOutcome, ended: 1 };
}

async function writeBatchPollStatus(
  client: LearningQueueDbClient,
  batch: ClaimedBatchRow,
  claimToken: string,
  now: Date,
  remote: AnthropicBatchSummary,
) {
  const remoteStatus = remote.processing_status === "ended" ? "ended" : "in_progress";
  return recordBatchPollStatus(client, {
    batchId: batch.id,
    claimToken,
    status: remoteStatus,
    processingCount: remote.request_counts?.processing ?? 0,
    succeededCount: remote.request_counts?.succeeded ?? 0,
    erroredCount: remote.request_counts?.errored ?? 0,
    canceledCount: remote.request_counts?.canceled ?? 0,
    expiredCount: remote.request_counts?.expired ?? 0,
    resultsUrl: remote.results_url ?? null,
    endedAt: remote.ended_at ?? null,
    expiresAt: remote.expires_at ?? null,
    nextPollAt: remoteStatus === "ended"
      ? now.toISOString()
      : new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  });
}

type CompletedBatchData =
  | {
    ok: true;
    results: AnthropicBatchResult[];
    itemsByCustomId: Map<string, BatchItemRow>;
    queuesById: Map<string, QueuedLearningRow>;
  }
  | { ok: false; errorCode: string };

async function loadCompletedBatchData(
  client: LearningQueueDbClient,
  secrets: EdgeAiSecrets,
  batch: ClaimedBatchRow,
): Promise<CompletedBatchData> {
  let results: AnthropicBatchResult[];
  try {
    results = await retrieveAnthropicBatchResults(secrets, batch.provider_batch_id);
  } catch {
    return { ok: false, errorCode: "BATCH_PROVIDER_RESULTS_FAILED" };
  }
  const itemResult = await fetchBatchItems(client, batch.id);
  if (!itemResult.ok) return { ok: false, errorCode: "BATCH_ITEM_LOAD_FAILED" };
  const queueResult = await fetchQueueRows(
    client,
    itemResult.rows.map((item) => item.queue_id).filter((id): id is string => typeof id === "string"),
  );
  if (!queueResult.ok) return { ok: false, errorCode: "LEARNING_QUEUE_LOAD_FAILED" };
  const queuesById = new Map(queueResult.rows.map((row) => [row.id, row]));
  const itemsByCustomId = new Map(itemResult.rows.map((item) => [item.custom_id, item]));
  if (itemResult.rows.some((item) => item.queue_id !== null && !queuesById.has(item.queue_id))) {
    return { ok: false, errorCode: "LEARNING_QUEUE_ROW_MISSING" };
  }
  const resultCustomIds = results.map((result) => result.custom_id);
  if (new Set(resultCustomIds).size !== resultCustomIds.length ||
    resultCustomIds.some((customId) => !itemsByCustomId.has(customId))) {
    return { ok: false, errorCode: "BATCH_RESULTS_MISMATCH" };
  }
  const resultCustomIdSet = new Set(resultCustomIds);
  if (itemResult.rows.some((item) => !resultCustomIdSet.has(item.custom_id))) {
    return { ok: false, errorCode: "BATCH_RESULTS_INCOMPLETE" };
  }
  return { ok: true, results, itemsByCustomId, queuesById };
}

async function processCompletedBatchItems(input: {
  client: LearningQueueDbClient;
  secrets: EdgeAiSecrets;
  now: Date;
  batch: ClaimedBatchRow;
  claimToken: string;
  results: AnthropicBatchResult[];
  itemsByCustomId: Map<string, BatchItemRow>;
  queuesById: Map<string, QueuedLearningRow>;
}): Promise<BatchResultProcessingOutcome> {
  let processedItems = 0;
  let failedItems = 0;
  const evidenceCache: LearningEvidenceCache = new Map();
  for (const result of input.results) {
    const item = input.itemsByCustomId.get(result.custom_id);
    if (!item || (item.status !== undefined && item.status !== "pending")) continue;
    if (!await renewBatchResultClaim(input.client, input.batch.id, input.claimToken)) {
      return batchFailure("BATCH_CLAIM_RENEW_FAILED", 0, processedItems, failedItems);
    }
    const queue = item.queue_id ? input.queuesById.get(item.queue_id) : undefined;
    await finalizeBatchItemSpend(input.client, item, queue?.actor_id, result);
    const committed = result.result.type === "succeeded" && queue
      ? await commitSuccessfulBatchItem(input, item, queue, result, evidenceCache)
      : await commitFailedBatchItem(input, item, queue, result);
    if (!committed.ok) return batchFailure(committed.errorCode, 0, processedItems, failedItems);
    if (committed.processed) processedItems += 1;
    else failedItems += 1;
  }
  return batchSuccess(0, processedItems, failedItems);
}

async function commitSuccessfulBatchItem(
  input: Parameters<typeof processCompletedBatchItems>[0],
  item: BatchItemRow,
  queue: QueuedLearningRow,
  result: AnthropicBatchResult,
  evidenceCache: LearningEvidenceCache,
) {
  const parsedOutput = parseBatchLearningCandidate(result.result.message);
  await recordBatchLearningOutputHealth(input.secrets, parsedOutput.ok ? null : parsedOutput.reason);
  const outcome = await processLearningCandidateResponse(
    input.client, queue, result.result.message, input.now, evidenceCache,
  );
  const commit = await commitLearningEffectResult(input.client, {
    sourceMode: "anthropic_batch", batchId: input.batch.id, itemId: item.id, queueId: queue.id,
    ownerToken: input.claimToken, itemStatus: outcome.ok ? "succeeded" : "errored",
    responsePayload: result.result.message ?? {},
    errorPayload: outcome.ok ? {} : { type: "processing_error", error_code: outcome.error_code },
    queueState: outcome.queue_state, queueErrorCode: outcome.ok ? null : outcome.error_code,
    processedAt: input.now.toISOString(), effect: outcome.effect,
  });
  return commit.ok
    ? { ok: true as const, processed: outcome.ok }
    : { ok: false as const, errorCode: commit.errorCode };
}

async function commitFailedBatchItem(
  input: Parameters<typeof processCompletedBatchItems>[0],
  item: BatchItemRow,
  queue: QueuedLearningRow | undefined,
  result: AnthropicBatchResult,
) {
  const providerErrorCode = result.result.type === "succeeded"
    ? "LEARNING_QUEUE_ROW_MISSING"
    : result.result.type.toUpperCase();
  const commit = await commitBatchItemResult(input.client, {
    batchId: input.batch.id, itemId: item.id, queueId: queue?.id ?? null,
    claimToken: input.claimToken,
    itemStatus: result.result.type === "succeeded" ? "errored" : result.result.type,
    responsePayload: result.result.message ?? {},
    errorPayload: result.result.error ?? {
      type: result.result.type === "succeeded" ? "processing_error" : result.result.type,
      error_code: providerErrorCode,
    },
    queueState: queue ? "failed" : null,
    queueErrorCode: queue ? providerErrorCode : null,
    processedAt: input.now.toISOString(),
  });
  return commit.ok
    ? { ok: true as const, processed: false }
    : { ok: false as const, errorCode: commit.errorCode };
}

function batchSuccess(
  ended = 0,
  processedItems = 0,
  failedItems = 0,
): BatchResultProcessingOutcome {
  return { ok: true, ended, processedItems, failedItems };
}

function batchFailure(
  errorCode: string,
  ended = 0,
  processedItems = 0,
  failedItems = 0,
): BatchResultProcessingOutcome {
  return { ok: false, errorCode, ended, processedItems, failedItems };
}

function emptyBatchSummary(errorCode: string): ProcessBatchResultsSummary {
  return {
    checked: 0,
    ended: 0,
    processed_items: 0,
    failed_items: 0,
    error_code: errorCode,
  };
}

async function failBatchSummary(
  client: LearningQueueDbClient,
  claimToken: string,
  _now: Date,
  checked: number,
  ended: number,
  processedItems: number,
  failedItems: number,
  errorCode: string,
): Promise<ProcessBatchResultsSummary> {
  await releaseBatchClaims(client, claimToken, errorCode);
  return {
    checked,
    ended,
    processed_items: processedItems,
    failed_items: failedItems,
    error_code: errorCode,
  };
}

