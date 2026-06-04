import { readKaelOptimizationFlags } from "../cost-tracking.ts";
import { createAnthropicMessageBatch, type AnthropicBatchRequest } from "../provider-batch.ts";
import type { EdgeAiSecrets } from "../types.ts";
import {
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
  lte(column: string, value: unknown): QueryBuilder<T>;
  order(column: string, options?: Record<string, unknown>): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  single(): QueryBuilder<T>;
  then: QueryLike<T>["then"];
};

export type LearningQueueDbClient = {
  from(table: import("../../db-types.ts").PublicTableName): QueryBuilder;
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

  const requests = rows.map((row) => buildBatchRequest(row, options.model));
  try {
    const providerBatch = await createAnthropicMessageBatch(secrets, requests);
    await client.from("kael_ai_batch_items").insert(rows.map((row, index) => ({
      batch_id: localBatchId,
      queue_id: row.id,
      custom_id: requests[index].custom_id,
      skill_id: row.skill_id,
      request_payload: requests[index],
    })));
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

function buildBatchRequest(row: QueuedLearningRow, model?: string): AnthropicBatchRequest {
  return {
    custom_id: queueCustomId(row.id),
    params: {
      model: model ?? "claude-sonnet-4-6",
      max_tokens: 800,
      temperature: 0,
      system: [
        {
          type: "text",
          text:
            "You are Kael's background learning processor. Return compact JSON only. Never change prices, payments, bookings, worker approval, or service scope.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            event_type: row.event_type,
            skill_id: row.skill_id,
            candidate: row.candidate_payload,
            input: row.input_payload,
          }),
        },
      ],
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
