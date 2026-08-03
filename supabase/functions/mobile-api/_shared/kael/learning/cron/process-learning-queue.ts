import { readKaelOptimizationFlags } from "../../kael-usage/cost-tracking.ts";
import { KAEL_ROUTING_CONFIG } from "../../kael-providers/routing.config.ts";
import type { EdgeAiSecrets } from "../../contracts/types.ts";
import {
  claimLearningQueueRows,
  type LearningQueueDbClient,
  type ProcessLearningQueueSummary,
} from "../queue-read.ts";
import {
  completeRealtimeFallbackRows,
  releaseQueueRows,
} from "../queue-write.ts";
import { processDeepSeekLearningQueue } from "../provider-deepseek.ts";
import { submitAnthropicLearningBatch } from "../provider-anthropic-batch.ts";

export type {
  LearningQueueDbClient,
  ProcessLearningQueueSummary,
  QueueLearningForBatchSummary,
  QueuedLearningRow,
} from "../queue-read.ts";
export { queueLearningForBatch } from "../queue-write.ts";

export async function processLearningQueue(
  client: LearningQueueDbClient,
  secrets: EdgeAiSecrets,
  options: {
    limit?: number;
    now?: Date;
    forceRealtime?: boolean;
    model?: string;
  } = {},
): Promise<ProcessLearningQueueSummary> {
  const flags = readKaelOptimizationFlags();
  if (!flags.KAEL_OPT_BATCH_LEARNING_ENABLED) {
    return { selected: 0, submitted: 0, realtime_fallback: 0, skipped_reason: "batch_learning_disabled" };
  }

  const now = options.now ?? new Date();
  const claim = await claimLearningQueueRows(client, {
    limit: options.limit ?? 50,
    now,
  });
  if (claim.errorCode) {
    return { selected: 0, submitted: 0, realtime_fallback: 0, error_code: claim.errorCode };
  }
  const { claimId, rows } = claim;
  if (rows.length === 0) return { selected: 0, submitted: 0, realtime_fallback: 0 };

  if (options.forceRealtime || !flags.KAEL_OPT_BATCH_API_ENABLED) {
    await completeRealtimeFallbackRows(
      client,
      claimId,
      rows.map((row) => row.id),
      now,
    );
    return { selected: rows.length, submitted: 0, realtime_fallback: rows.length };
  }

  const route = KAEL_ROUTING_CONFIG.post_job_learning;
  if (!options.model && route.primary.provider === "deepseek") {
    const direct = await processDeepSeekLearningQueue(
      client,
      secrets,
      rows,
      claimId,
      now,
      route.primary.model,
    );
    if (direct.fallbackRows.length > 0 && route.fallback?.provider === "anthropic") {
      const fallback = await submitAnthropicLearningBatch(
        client,
        secrets,
        direct.fallbackRows,
        claimId,
        now,
        route.fallback.model,
      );
      return {
        ...fallback,
        selected: rows.length,
        submitted: direct.completed + fallback.submitted,
      };
    }
    if (direct.fallbackRows.length > 0) {
      await releaseQueueRows(
        client,
        claimId,
        direct.fallbackRows.map((row) => row.id),
        "DEEPSEEK_LEARNING_FAILED",
      );
    }
    return {
      selected: rows.length,
      submitted: direct.completed,
      realtime_fallback: 0,
      batch_id: direct.batchId ?? undefined,
      error_code: direct.terminalErrorCode ?? (direct.fallbackRows.length > 0
        ? "DEEPSEEK_LEARNING_FAILED"
        : undefined),
    };
  }

  return submitAnthropicLearningBatch(
    client,
    secrets,
    rows,
    claimId,
    now,
    options.model ?? route.fallback?.model ?? "claude-sonnet-5",
  );
}