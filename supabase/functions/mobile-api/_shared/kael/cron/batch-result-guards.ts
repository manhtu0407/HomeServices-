import { KAEL_CIRCUIT_BREAKER } from "../kael-providers/circuit-breaker.ts";
import {
  recordDurableCircuitFailure,
  recordDurableCircuitSuccess,
} from "../durable-guards.ts";
import {
  anthropicMessageBatchCostUsd,
  calculateModelCostUsd,
} from "../kael-usage/model-pricing.ts";
import type { AnthropicBatchResult } from "../kael-providers/provider-batch.ts";
import { finalizeAiSpend, type SpendGateClient } from "../kael-guardrails/spend-gate.ts";
import type { EdgeAiSecrets } from "../types.ts";
import type { LearningQueueDbClient } from "./process-learning-queue.ts";

type BatchSpendItem = {
  request_payload?: unknown;
};

export async function finalizeBatchItemSpend(
  client: LearningQueueDbClient,
  item: BatchSpendItem,
  actorId: string | null | undefined,
  result: AnthropicBatchResult,
): Promise<void> {
  const payload = isRecord(item.request_payload) ? item.request_payload : {};
  const params = isRecord(payload.params) ? payload.params : {};
  const reservationId = strictNumberFrom(payload.kael_spend_reservation_id);
  const model = typeof params.model === "string" ? params.model : "claude-sonnet-5";
  const message = result.result.type === "succeeded" && isRecord(result.result.message)
    ? result.result.message
    : null;
  const usage = message && isRecord(message.usage) ? message.usage : {};
  const actualUsd = message
    ? anthropicMessageBatchCostUsd(calculateModelCostUsd({
      provider: "anthropic",
      model,
      inputTokens: strictNumberFrom(usage.input_tokens),
      outputTokens: strictNumberFrom(usage.output_tokens),
      cacheCreationInputTokens: strictNumberFrom(usage.cache_creation_input_tokens),
      cacheReadInputTokens: strictNumberFrom(usage.cache_read_input_tokens),
    }))
    : 0;
  await finalizeAiSpend(client as SpendGateClient, {
    reservationId,
    actorId: actorId ?? null,
    purpose: "post_job_learning",
    actualUsd,
  });
}

export async function recordBatchLearningOutputHealth(
  secrets: EdgeAiSecrets,
  schemaFailureReason: string | null,
): Promise<void> {
  if (schemaFailureReason === null) {
    if (secrets.durableGuardsEnabled === true) {
      await recordDurableCircuitSuccess(
        secrets.durableGuardClient,
        "post_job_learning",
        "anthropic",
      );
    } else {
      KAEL_CIRCUIT_BREAKER.recordSuccess("post_job_learning", "anthropic");
    }
    return;
  }

  const failure = {
    purpose: "post_job_learning" as const,
    provider: "anthropic" as const,
    errorCode: schemaFailureReason,
    kind: "schema" as const,
  };
  if (secrets.durableGuardsEnabled === true) {
    await recordDurableCircuitFailure(secrets.durableGuardClient, failure);
  } else {
    KAEL_CIRCUIT_BREAKER.recordFailure(failure);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strictNumberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
