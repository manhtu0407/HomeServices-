import { KAEL_ROUTING_CONFIG } from "../kael-providers/routing.config.ts";
import {
  callStructuredAI,
  type StructuredAIResponse,
} from "../kael-providers/structured-call.ts";
import type { SpendGateClient } from "../kael-guardrails/spend-gate.ts";
import type { EdgeAiSecrets } from "../contracts/types.ts";
import { commitLearningEffectResult } from "./cron/learning-effect-store.ts";
import { processLearningCandidateResponse } from "./cron/process-batch-results.ts";
import {
  learningSkillCandidateSchema,
  type LearningSkillCandidate,
} from "./skills/registry.ts";
import {
  buildPostJobLearningMessages,
  type LearningQueueDbClient,
  type QueuedLearningRow,
} from "./queue-read.ts";
import {
  isRecord,
  queueCustomId,
  releaseQueueRows,
  updateAiBatch,
  updateDeepSeekBatchItem,
} from "./queue-write.ts";
type DeepSeekLearningQueueResult = {
  batchId: string | null;
  completed: number;
  fallbackRows: QueuedLearningRow[];
  terminalErrorCode?: string;
};

type DeepSeekLearningRowResult = {
  completed: boolean;
  fallback: boolean;
  terminalErrorCode?: string;
  persistenceError?: string;
};

const DEEPSEEK_LEARNING_CONCURRENCY = 4;

export async function processDeepSeekLearningQueue(
  client: LearningQueueDbClient,
  secrets: EdgeAiSecrets,
  rows: readonly QueuedLearningRow[],
  claimId: string,
  now: Date,
  model: string,
): Promise<DeepSeekLearningQueueResult> {
  const batchInsert = await client
    .from("kael_ai_batches")
    .insert({
      provider: "deepseek",
      purpose: "post_job_learning",
      status: "in_progress",
      request_count: rows.length,
      processing_count: rows.length,
      submitted_at: now.toISOString(),
      safe_metadata: {
        source: "kael_learning_queue",
        q4: true,
        execution_mode: "synchronous_group",
        model,
      },
    })
    .select("id")
    .single();
  const batchId = isRecord(batchInsert.data) && typeof batchInsert.data.id === "string"
    ? batchInsert.data.id
    : null;
  if (batchInsert.error || !batchId) {
    return { batchId: null, completed: 0, fallbackRows: [...rows] };
  }

  const batchItems = rows.map((row) => ({
    id: crypto.randomUUID(),
    batch_id: batchId,
    queue_id: row.id,
    custom_id: queueCustomId(row.id),
    skill_id: row.skill_id,
    request_payload: {
      provider: "deepseek",
      model,
      purpose: "post_job_learning",
      schema: "learning_candidate.v1",
    },
  }));
  const itemInsert = await client.from("kael_ai_batch_items").insert(batchItems);
  if (itemInsert.error) {
    await updateAiBatch(client, batchId, {
      status: "failed",
      processing_count: 0,
      error_code: itemInsert.error.code ?? "BATCH_ITEM_ROW_FAILED",
      ended_at: now.toISOString(),
    });
    return { batchId, completed: 0, fallbackRows: [...rows] };
  }
  const itemIdsByQueue = new Map(batchItems.map((item) => [item.queue_id, item.id]));
  const results = await processDeepSeekRows({
    client,
    secrets,
    rows,
    claimId,
    now,
    model,
    batchId,
    itemIdsByQueue,
  });

  const completed = results.filter((result) => result.completed).length;
  const persistenceError = results.find((result) => result.persistenceError)
    ?.persistenceError;
  if (persistenceError) {
    await updateAiBatch(client, batchId, {
      status: "failed",
      processing_count: 0,
      error_code: persistenceError.slice(0, 120),
      ended_at: now.toISOString(),
      next_poll_at: null,
    });
    throw new Error(persistenceError);
  }
  const fallbackRows = rows.filter((_, index) => results[index]?.fallback);
  const terminalErrorCode = results.find((result) => result.terminalErrorCode)
    ?.terminalErrorCode;
  await updateAiBatch(client, batchId, {
    status: "results_processed",
    processing_count: 0,
    succeeded_count: completed,
    errored_count: rows.length - completed,
    ended_at: now.toISOString(),
    next_poll_at: null,
  });
  return { batchId, completed, fallbackRows, terminalErrorCode };
}

async function processDeepSeekRows(input: {
  client: LearningQueueDbClient;
  secrets: EdgeAiSecrets;
  rows: readonly QueuedLearningRow[];
  claimId: string;
  now: Date;
  model: string;
  batchId: string;
  itemIdsByQueue: ReadonlyMap<string, string>;
}): Promise<DeepSeekLearningRowResult[]> {
  return mapWithConcurrency(input.rows, DEEPSEEK_LEARNING_CONCURRENCY, async (row) => {
    const result = await callStructuredAI(
      {
        purpose: "post_job_learning",
        provider: "deepseek",
        model: input.model,
        messages: buildPostJobLearningMessages(row),
        maxTokens: KAEL_ROUTING_CONFIG.post_job_learning.maxTokens,
        temperature: 0,
        timeoutMs: KAEL_ROUTING_CONFIG.post_job_learning.latencyBudgetMs,
        maxRetries: 0,
      },
      learningCandidateResponseSchema,
      input.secrets,
      { client: input.client as SpendGateClient, actorId: row.actor_id },
    );
    if (!result.success) {
      return recordDeepSeekProviderFailure(input, row, result.code);
    }
    return commitDeepSeekCandidate(input, row, result);
  });
}

async function recordDeepSeekProviderFailure(
  input: Pick<
    Parameters<typeof processDeepSeekRows>[0],
    "client" | "batchId" | "claimId" | "now"
  >,
  row: QueuedLearningRow,
  code: string,
): Promise<DeepSeekLearningRowResult> {
  await updateDeepSeekBatchItem(input.client, input.batchId, row.id, {
    status: "errored",
    error_payload: { provider_code: code },
    processed_at: input.now.toISOString(),
  });
  const terminalErrorCode = isGlobalLearningPolicyBlock(code) ? code : undefined;
  if (terminalErrorCode) {
    await releaseQueueRows(input.client, input.claimId, [row.id], terminalErrorCode);
  }
  return {
    completed: false,
    fallback: terminalErrorCode === undefined,
    terminalErrorCode,
  };
}

async function commitDeepSeekCandidate(
  input: Pick<
    Parameters<typeof processDeepSeekRows>[0],
    "client" | "now" | "model" | "batchId" | "claimId" | "itemIdsByQueue"
  >,
  row: QueuedLearningRow,
  result: StructuredAIResponse<{ candidate: LearningSkillCandidate }>,
): Promise<DeepSeekLearningRowResult> {
  const outcome = await processLearningCandidateResponse(
    input.client,
    row,
    { candidate: result.data.candidate },
    input.now,
  );
  const itemId = input.itemIdsByQueue.get(row.id);
  if (!itemId) {
    return {
      completed: false,
      fallback: false,
      persistenceError: "DEEPSEEK_BATCH_ITEM_WRITE_FAILED:ROW_NOT_FOUND",
    };
  }
  const commit = await commitLearningEffectResult(input.client, {
    sourceMode: "deepseek_direct",
    batchId: input.batchId,
    itemId,
    queueId: row.id,
    ownerToken: input.claimId,
    itemStatus: outcome.ok ? "succeeded" : "errored",
    responsePayload: safeLearningResponseMetadata(input.model, result),
    errorPayload: outcome.ok ? {} : { processing_code: outcome.error_code },
    queueState: outcome.queue_state,
    queueErrorCode: outcome.ok ? null : outcome.error_code,
    processedAt: input.now.toISOString(),
    effect: outcome.effect,
  });
  if (!commit.ok) {
    return { completed: false, fallback: false, persistenceError: commit.errorCode };
  }
  return { completed: outcome.ok, fallback: false };
}
const learningCandidateResponseSchema = {
  safeParse(value: unknown) {
    const candidate = isRecord(value) ? value.candidate : undefined;
    const parsed = learningSkillCandidateSchema.safeParse(candidate);
    return parsed.success
      ? { success: true as const, data: { candidate: parsed.data } }
      : parsed;
  },
};
function safeLearningResponseMetadata(
  model: string,
  result: { usage: { inputTokens: number; outputTokens: number; costUsd: number } },
) {
  return {
    model,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cost_usd: result.usage.costUsd,
  };
}

function isGlobalLearningPolicyBlock(code: string): boolean {
  return code === "AI_DISABLED" || code === "SPEND_CAP";
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapper(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}
