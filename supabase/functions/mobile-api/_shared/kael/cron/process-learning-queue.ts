import { readKaelOptimizationFlags } from "../cost-tracking.ts";
import { KAEL_CIRCUIT_BREAKER } from "../circuit-breaker.ts";
import { isDurableCircuitOpen } from "../durable-guards.ts";
import {
  anthropicMessageBatchCostUsd,
  estimateModelRequestCostUsd,
} from "../model-pricing.ts";
import { createAnthropicMessageBatch, type AnthropicBatchRequest } from "../provider-batch.ts";
import { KAEL_ROUTING_CONFIG } from "../routing.config.ts";
import { callStructuredAI } from "../structured-call.ts";
import {
  finalizeAiSpend,
  isKaelAiKillSwitchEnabled,
  reserveAiSpend,
  type SpendGateClient,
} from "../spend-gate.ts";
import type { EdgeAiSecrets } from "../types.ts";
import { processLearningCandidateResponse } from "./process-batch-results.ts";
import {
  learningSkillCandidateSchema,
  type LearningSkillCandidate,
  type LearningSkillInput,
  type LearningSkillTrigger,
  planLearningSkillTriggers,
} from "../skills/registry.ts";

type DbError = { code?: string; message?: string };
type DbResult<T = unknown> = { data: T | null; error: DbError | null };
type QueryLike<T = unknown> = PromiseLike<DbResult<T>>;

type QueryBuilder<T = unknown> = {
  select(columns?: string): QueryBuilder<T>;
  insert(value: unknown): QueryBuilder<T>;
  update(value: unknown): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  gte(column: string, value: unknown): QueryBuilder<T>;
  lte(column: string, value: unknown): QueryBuilder<T>;
  order(column: string, options?: Record<string, unknown>): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  single(): QueryBuilder<T>;
  maybeSingle(): QueryBuilder<T>;
  then: QueryLike<T>["then"];
};

export type LearningQueueDbClient = {
  from(table: string): QueryBuilder;
  rpc?(name: string, args?: Record<string, unknown>): QueryBuilder | QueryLike;
};

export type QueuedLearningRow = {
  id: string;
  event_type: LearningSkillTrigger;
  skill_id: string;
  job_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  queue_state: string;
  input_payload: Record<string, unknown>;
  candidate_payload: LearningSkillCandidate;
  attempts: number;
  created_at: string;
};

export type QueueLearningForBatchSummary = {
  queued: number;
  manual_review: number;
  rejected: number;
  skill_ids: string[];
  error_code?: string;
};

export type ProcessLearningQueueSummary = {
  selected: number;
  submitted: number;
  realtime_fallback: number;
  batch_id?: string;
  provider_batch_id?: string;
  skipped_reason?: string;
  error_code?: string;
};

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
  const rowsResult = await client
    .from("kael_learning_queue")
    .select("id,event_type,skill_id,job_id,actor_id,actor_role,queue_state,input_payload,candidate_payload,attempts,created_at")
    .eq("queue_state", "pending")
    .lte("run_after", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(options.limit ?? 50);
  if (rowsResult.error) {
    return { selected: 0, submitted: 0, realtime_fallback: 0, error_code: rowsResult.error.code ?? "DB_ERROR" };
  }
  const rows = Array.isArray(rowsResult.data)
    ? rowsResult.data as QueuedLearningRow[]
    : [];
  if (rows.length === 0) return { selected: 0, submitted: 0, realtime_fallback: 0 };

  if (options.forceRealtime || !flags.KAEL_OPT_BATCH_API_ENABLED) {
    await insertLearningLifecycleRows(client, rows, "realtime_fallback");
    await updateQueueRows(client, rows.map((row) => row.id), {
      queue_state: "realtime_fallback",
      processed_at: now.toISOString(),
    });
    return { selected: rows.length, submitted: 0, realtime_fallback: rows.length };
  }

  const route = KAEL_ROUTING_CONFIG.post_job_learning;
  if (!options.model && route.primary.provider === "deepseek") {
    const direct = await processDeepSeekLearningQueue(
      client,
      secrets,
      rows,
      now,
      route.primary.model,
    );
    if (direct.fallbackRows.length > 0 && route.fallback?.provider === "anthropic") {
      const fallback = await submitAnthropicLearningBatch(
        client,
        secrets,
        direct.fallbackRows,
        now,
        route.fallback.model,
      );
      return {
        ...fallback,
        selected: rows.length,
        submitted: direct.completed + fallback.submitted,
      };
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
    now,
    options.model ?? route.fallback?.model ?? "claude-sonnet-5",
  );
}

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
};

const DEEPSEEK_LEARNING_CONCURRENCY = 4;

async function processDeepSeekLearningQueue(
  client: LearningQueueDbClient,
  secrets: EdgeAiSecrets,
  rows: readonly QueuedLearningRow[],
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

  const itemInsert = await client.from("kael_ai_batch_items").insert(rows.map((row) => ({
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
  })));
  if (itemInsert.error) {
    await client.from("kael_ai_batches").update({
      status: "failed",
      processing_count: 0,
      error_code: itemInsert.error.code ?? "BATCH_ITEM_ROW_FAILED",
      ended_at: now.toISOString(),
    }).eq("id", batchId);
    return { batchId, completed: 0, fallbackRows: [...rows] };
  }

  const results = await mapWithConcurrency(rows, DEEPSEEK_LEARNING_CONCURRENCY, async (row) => {
    const result = await callStructuredAI(
      {
        purpose: "post_job_learning",
        provider: "deepseek",
        model,
        messages: buildPostJobLearningMessages(row),
        maxTokens: KAEL_ROUTING_CONFIG.post_job_learning.maxTokens,
        temperature: 0,
        timeoutMs: KAEL_ROUTING_CONFIG.post_job_learning.latencyBudgetMs,
        maxRetries: 0,
      },
      learningCandidateResponseSchema,
      secrets,
      { client: client as SpendGateClient, actorId: row.actor_id },
    );
    if (!result.success) {
      await updateDeepSeekBatchItem(client, batchId, row.id, {
        status: "errored",
        error_payload: { provider_code: result.code },
        processed_at: now.toISOString(),
      });
      const terminalErrorCode = isGlobalLearningPolicyBlock(result.code)
        ? result.code
        : undefined;
      return {
        completed: false,
        fallback: terminalErrorCode === undefined,
        terminalErrorCode,
      } satisfies DeepSeekLearningRowResult;
    }

    const outcome = await processLearningCandidateResponse(
      client,
      row,
      { candidate: result.data.candidate },
      now,
    );
    if (!outcome.ok) {
      await updateDeepSeekBatchItem(client, batchId, row.id, {
        status: "errored",
        error_payload: { processing_code: outcome.error_code },
        response_payload: safeLearningResponseMetadata(model, result),
        processed_at: now.toISOString(),
      });
      await updateQueueRows(client, [row.id], {
        queue_state: outcome.queue_state,
        batch_id: batchId,
        attempts: row.attempts + 1,
        error_code: outcome.error_code,
        processed_at: now.toISOString(),
      });
      return { completed: false, fallback: false } satisfies DeepSeekLearningRowResult;
    }

    await updateDeepSeekBatchItem(client, batchId, row.id, {
      status: "succeeded",
      response_payload: safeLearningResponseMetadata(model, result),
      processed_at: now.toISOString(),
    });
    await updateQueueRows(client, [row.id], {
      queue_state: outcome.queue_state,
      batch_id: batchId,
      attempts: row.attempts + 1,
      processed_at: now.toISOString(),
    });
    return { completed: true, fallback: false } satisfies DeepSeekLearningRowResult;
  });

  const completed = results.filter((result) => result.completed).length;
  const fallbackRows = rows.filter((_, index) => results[index]?.fallback);
  const terminalErrorCode = results.find((result) => result.terminalErrorCode)
    ?.terminalErrorCode;
  await client.from("kael_ai_batches").update({
    status: "results_processed",
    processing_count: 0,
    succeeded_count: completed,
    errored_count: rows.length - completed,
    ended_at: now.toISOString(),
    next_poll_at: null,
  }).eq("id", batchId);
  return { batchId, completed, fallbackRows, terminalErrorCode };
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

function buildPostJobLearningMessages(row: QueuedLearningRow) {
  return [
    {
      role: "system" as const,
      content:
        "You are Kael's background learning processor. Return compact JSON only. Never change prices, payments, bookings, worker approval, or service scope.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        event_type: row.event_type,
        skill_id: row.skill_id,
        candidate: row.candidate_payload,
        input: row.input_payload,
        expected_output: {
          format: "json_object",
          root: "candidate",
          instruction:
            "Return exactly {\"candidate\": <candidate>} with no prose. Preserve the candidate schema fields and only add safe aggregate evidence under candidate.payload.evidence_snapshot when available.",
          evidence_snapshot: {
            evidence_count: "integer count of safe reviewed transactions",
            confidence: "number from 0 to 1",
            completed_transaction_count: "integer count of completed/reviewed transactions",
            recent_contradiction_ratio: "number from 0 to 1",
          },
          forbidden:
            "Do not return raw chat text, addresses, phone numbers, payment data, final-price mutations, booking actions, or expanded service scope.",
        },
      }),
    },
  ];
}

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

async function updateDeepSeekBatchItem(
  client: LearningQueueDbClient,
  batchId: string,
  queueId: string,
  patch: Record<string, unknown>,
) {
  await client
    .from("kael_ai_batch_items")
    .update(patch)
    .eq("batch_id", batchId)
    .eq("queue_id", queueId);
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

async function submitAnthropicLearningBatch(
  client: LearningQueueDbClient,
  secrets: EdgeAiSecrets,
  rows: readonly QueuedLearningRow[],
  now: Date,
  model: string,
): Promise<ProcessLearningQueueSummary> {
  if (isKaelAiKillSwitchEnabled()) {
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
    return { selected: rows.length, submitted: 0, realtime_fallback: 0, error_code: batchInsert.error?.code ?? "BATCH_ROW_FAILED" };
  }

  const requests = rows.map((row) => buildBatchRequest(row, model));
  const reservations: Array<{
    reservationId: number | null;
    estimatedCostUsd: number;
    actorId: string | null;
  }> = [];
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
    if (!reservation.allowed) {
      await Promise.all(reservations.map((item) =>
        finalizeAiSpend(client as SpendGateClient, {
          reservationId: item.reservationId,
          actorId: item.actorId,
          purpose: "post_job_learning",
          actualUsd: 0,
        })
      ));
      await client.from("kael_ai_batches").update({
        status: "failed",
        error_code: "SPEND_CAP",
      }).eq("id", localBatchId);
      await updateQueueRows(client, rows.map((item) => item.id), {
        queue_state: "failed",
        error_code: "SPEND_CAP",
      });
      return {
        selected: rows.length,
        submitted: 0,
        realtime_fallback: 0,
        batch_id: localBatchId,
        error_code: "SPEND_CAP",
      };
    }
    reservations.push({
      reservationId: reservation.reservationId,
      estimatedCostUsd,
      actorId: row.actor_id,
    });
  }
  try {
    const providerBatch = await createAnthropicMessageBatch(secrets, requests);
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
      await Promise.all(reservations.map((item) =>
        finalizeAiSpend(client as SpendGateClient, {
          reservationId: item.reservationId,
          actorId: item.actorId,
          purpose: "post_job_learning",
          actualUsd: item.estimatedCostUsd,
        })
      ));
      throw new Error("BATCH_ITEM_ROW_FAILED");
    }
    await updateQueueRows(client, rows.map((row) => row.id), {
      queue_state: "batched",
      batch_id: localBatchId,
      provider_batch_id: providerBatch.id,
      attempts: rows[0]?.attempts ? rows[0].attempts + 1 : 1,
    });
    await client.from("kael_ai_batches").update({
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
    }).eq("id", localBatchId);
    return {
      selected: rows.length,
      submitted: rows.length,
      realtime_fallback: 0,
      batch_id: localBatchId,
      provider_batch_id: providerBatch.id,
    };
  } catch (error) {
    if (!(error instanceof Error && error.message === "BATCH_ITEM_ROW_FAILED")) {
      await Promise.all(reservations.map((item) =>
        finalizeAiSpend(client as SpendGateClient, {
          reservationId: item.reservationId,
          actorId: item.actorId,
          purpose: "post_job_learning",
          actualUsd: 0,
        })
      ));
    }
    await client.from("kael_ai_batches").update({
      status: "failed",
      error_code: error instanceof Error ? error.message.slice(0, 120) : "BATCH_SUBMIT_FAILED",
    }).eq("id", localBatchId);
    await updateQueueRows(client, rows.map((row) => row.id), {
      queue_state: "failed",
      error_code: "BATCH_SUBMIT_FAILED",
    });
    return { selected: rows.length, submitted: 0, realtime_fallback: 0, batch_id: localBatchId, error_code: "BATCH_SUBMIT_FAILED" };
  }
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

export async function insertLearningLifecycleRows(
  client: LearningQueueDbClient,
  rows: readonly QueuedLearningRow[],
  reason: "batch_processed" | "realtime_fallback",
) {
  if (rows.length === 0) return;
  await client.from("kael_rule_lifecycle_log").insert(rows.map((row) => ({
    skill_id: row.skill_id,
    job_id: row.job_id,
    rule_id: null,
    candidate_id: null,
    previous_state: null,
    next_state: row.candidate_payload.requires_manual_review ? "manual_review" : "candidate",
    transition_reason: reason,
    actor_id: row.actor_id,
    actor_role: row.actor_role,
    safe_metadata: {
      event_type: row.event_type,
      target: row.candidate_payload.target,
      prompt_version: row.candidate_payload.prompt_version,
      requires_manual_review: row.candidate_payload.requires_manual_review,
      payload: row.candidate_payload.payload,
      q4_queue_id: row.id,
      q4_reason: reason,
    },
  })));
}

async function updateQueueRows(
  client: LearningQueueDbClient,
  ids: string[],
  patch: Record<string, unknown>,
) {
  if (ids.length === 0) return;
  await client.from("kael_learning_queue").update(patch).in("id", ids);
}

function queueCustomId(id: string): string {
  return `lq_${id.replace(/-/g, "").slice(0, 61)}`;
}

function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
