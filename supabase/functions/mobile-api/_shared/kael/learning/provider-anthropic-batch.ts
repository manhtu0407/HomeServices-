import { KAEL_CIRCUIT_BREAKER } from "../kael-providers/circuit-breaker.ts";
import { isDurableCircuitOpen } from "../kael-guardrails/durable-guards.ts";
import {
  anthropicMessageBatchCostUsd,
  estimateModelRequestCostUsd,
} from "../kael-usage/model-pricing.ts";
import {
  createAnthropicMessageBatch,
  type AnthropicBatchRequest,
} from "../kael-providers/provider-batch.ts";
import { KAEL_ROUTING_CONFIG } from "../kael-providers/routing.config.ts";
import {
  finalizeAiSpend,
  isKaelAiKillSwitchEnabled,
  reserveAiSpend,
  type SpendGateClient,
} from "../kael-guardrails/spend-gate.ts";
import type { EdgeAiSecrets } from "../contracts/types.ts";
import {
  buildPostJobLearningMessages,
  type LearningQueueDbClient,
  type ProcessLearningQueueSummary,
  type QueuedLearningRow,
} from "./queue-read.ts";
import {
  isRecord,
  queueCustomId,
  releaseQueueRows,
  updateAiBatch,
  updateQueueRows,
} from "./queue-write.ts";

type BatchSpendReservation = {
  reservationId: number | null;
  estimatedCostUsd: number;
  actorId: string | null;
};

export async function submitAnthropicLearningBatch(
  client: LearningQueueDbClient,
  secrets: EdgeAiSecrets,
  rows: readonly QueuedLearningRow[],
  claimId: string,
  now: Date,
  model: string,
): Promise<ProcessLearningQueueSummary> {
  if (isKaelAiKillSwitchEnabled()) {
    await releaseQueueRows(client, claimId, rows.map((row) => row.id), "AI_DISABLED");
    return {
      selected: rows.length,
      submitted: 0,
      realtime_fallback: 0,
      error_code: "AI_DISABLED",
    };
  }
  const circuitOpen = secrets.durableGuardsEnabled === true
    ? await isDurableCircuitOpen(
      secrets.durableGuardClient,
      "post_job_learning",
      "anthropic",
    )
    : KAEL_CIRCUIT_BREAKER.isOpen("post_job_learning", "anthropic");
  if (circuitOpen) {
    await releaseQueueRows(client, claimId, rows.map((row) => row.id), "OPEN_CIRCUIT");
    return {
      selected: rows.length,
      submitted: 0,
      realtime_fallback: 0,
      error_code: "OPEN_CIRCUIT",
    };
  }
  const batchInsert = await client
    .from("kael_ai_batches")
    .insert({
      provider: "anthropic",
      purpose: "post_job_learning",
      status: "queued",
      request_count: rows.length,
      safe_metadata: { source: "kael_learning_queue", q4: true },
    })
    .select("id")
    .single();
  const localBatchId = isRecord(batchInsert.data) && typeof batchInsert.data.id === "string"
    ? batchInsert.data.id
    : null;
  if (batchInsert.error || !localBatchId) {
    await releaseQueueRows(
      client,
      claimId,
      rows.map((row) => row.id),
      batchInsert.error?.code ?? "BATCH_ROW_FAILED",
    );
    return { selected: rows.length, submitted: 0, realtime_fallback: 0, error_code: batchInsert.error?.code ?? "BATCH_ROW_FAILED" };
  }

  const requests = rows.map((row) => buildBatchRequest(row, model));
  const spend = await reserveBatchSpend(client, rows, claimId, localBatchId, model);
  if (!spend.ok) return spend.summary;
  const reservations = spend.reservations;
  let providerSubmitted = false;
  try {
    const providerBatch = await createAnthropicMessageBatch(secrets, requests);
    providerSubmitted = true;
    const itemsInsert = await client.from("kael_ai_batch_items").insert(rows.map((row, index) => ({
      batch_id: localBatchId,
      queue_id: row.id,
      custom_id: requests[index].custom_id,
      skill_id: row.skill_id,
      request_payload: {
        ...requests[index],
        kael_spend_reservation_id: reservations[index].reservationId,
        kael_spend_estimated_usd: reservations[index].estimatedCostUsd,
      },
    })));
    if (itemsInsert.error) {
      throw new Error("BATCH_ITEM_ROW_FAILED");
    }
    await updateAiBatch(client, localBatchId, {
      provider_batch_id: providerBatch.id,
      status: providerBatch.processing_status === "ended" ? "ended" : "submitted",
      processing_count: providerBatch.request_counts?.processing ?? rows.length,
      succeeded_count: providerBatch.request_counts?.succeeded ?? 0,
      errored_count: providerBatch.request_counts?.errored ?? 0,
      canceled_count: providerBatch.request_counts?.canceled ?? 0,
      expired_count: providerBatch.request_counts?.expired ?? 0,
      results_url: providerBatch.results_url ?? null,
      submitted_at: now.toISOString(),
      ended_at: providerBatch.ended_at ?? null,
      expires_at: providerBatch.expires_at ?? null,
      next_poll_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    });
    await updateQueueRows(client, claimId, rows.map((row) => row.id), {
      queue_state: "batched",
      batch_id: localBatchId,
      provider_batch_id: providerBatch.id,
      error_code: null,
    });
    return {
      selected: rows.length,
      submitted: rows.length,
      realtime_fallback: 0,
      batch_id: localBatchId,
      provider_batch_id: providerBatch.id,
    };
  } catch (error) {
    await Promise.all(reservations.map((item) =>
      finalizeAiSpend(client as SpendGateClient, {
        reservationId: item.reservationId,
        actorId: item.actorId,
        purpose: "post_job_learning",
        actualUsd: providerSubmitted ? item.estimatedCostUsd : 0,
      })
    ));
    await updateAiBatch(client, localBatchId, {
      status: "failed",
      error_code: error instanceof Error ? error.message.slice(0, 120) : "BATCH_SUBMIT_FAILED",
    });
    await updateQueueRows(client, claimId, rows.map((row) => row.id), {
      queue_state: "failed",
      error_code: "BATCH_SUBMIT_FAILED",
    });
    return { selected: rows.length, submitted: 0, realtime_fallback: 0, batch_id: localBatchId, error_code: "BATCH_SUBMIT_FAILED" };
  }
}

async function reserveBatchSpend(
  client: LearningQueueDbClient,
  rows: readonly QueuedLearningRow[],
  claimId: string,
  batchId: string,
  model: string,
): Promise<
  | { ok: true; reservations: BatchSpendReservation[] }
  | { ok: false; summary: ProcessLearningQueueSummary }
> {
  const reservations: BatchSpendReservation[] = [];
  for (const row of rows) {
    const estimatedCostUsd = anthropicMessageBatchCostUsd(
      estimateModelRequestCostUsd({
        provider: "anthropic",
        model,
        messages: buildPostJobLearningMessages(row),
        maxTokens: KAEL_ROUTING_CONFIG.post_job_learning.maxTokens,
      }),
    );
    const reservation = await reserveAiSpend(client as SpendGateClient, {
      actorId: row.actor_id,
      estimatedCostUsd,
      purpose: "post_job_learning",
    });
    if (reservation.allowed) {
      reservations.push({
        reservationId: reservation.reservationId,
        estimatedCostUsd,
        actorId: row.actor_id,
      });
      continue;
    }
    await releaseReservedBatchSpend(client, reservations);
    await updateAiBatch(client, batchId, { status: "failed", error_code: "SPEND_CAP" });
    await updateQueueRows(client, claimId, rows.map((item) => item.id), {
      queue_state: "failed",
      error_code: "SPEND_CAP",
    });
    return {
      ok: false,
      summary: {
        selected: rows.length,
        submitted: 0,
        realtime_fallback: 0,
        batch_id: batchId,
        error_code: "SPEND_CAP",
      },
    };
  }
  return { ok: true, reservations };
}

async function releaseReservedBatchSpend(
  client: LearningQueueDbClient,
  reservations: readonly BatchSpendReservation[],
) {
  await Promise.all(reservations.map((item) =>
    finalizeAiSpend(client as SpendGateClient, {
      reservationId: item.reservationId,
      actorId: item.actorId,
      purpose: "post_job_learning",
      actualUsd: 0,
    })
  ));
}

function buildBatchRequest(
  row: QueuedLearningRow,
  model = "claude-sonnet-5",
): AnthropicBatchRequest {
  return {
    custom_id: queueCustomId(row.id),
    params: {
      model,
      max_tokens: 800,
      system: [
        {
          type: "text",
          text:
            "You are Kael's background learning processor. Return compact JSON only. Never change prices, payments, bookings, worker approval, or service scope.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: buildPostJobLearningMessages(row).filter((message) => message.role !== "system"),
    },
  };
}

