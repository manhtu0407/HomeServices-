import { readKaelOptimizationFlags } from "../cost-tracking.ts";
import {
  retrieveAnthropicBatchResults,
  retrieveAnthropicMessageBatch,
  type AnthropicBatchResult,
} from "../provider-batch.ts";
import type { EdgeAiSecrets } from "../types.ts";
import {
  type LearningQueueDbClient,
  type QueuedLearningRow,
} from "./process-learning-queue.ts";
import {
  enforceLearningScopeLimits,
  evaluateLearningEvidenceGate,
  getLearningSkill,
  learningSkillCandidateSchema,
  resolveLearningRuntimeConfig,
  transitionLearningLifecycle,
  type LearningEvidenceSnapshot,
  type LearningLifecycleState,
  type LearningSkillCandidate,
} from "../skills/registry.ts";

const LEARNING_EVIDENCE_WINDOW_DAYS = 90;

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

type LearningCandidateStatus =
  | "created"
  | "pending_evidence"
  | "evidence_gate_passed"
  | "manual_review"
  | "auto_promoted"
  | "rejected";

type LearningRuleScope = {
  affected_service: "electrical" | "plumbing" | "cleaning";
  affected_problem: string;
  affected_district: string;
};

type PromotionResult =
  | { promoted: true; candidate_id: string; rule_id: string; rule_version: number }
  | { promoted: false; reason: string };

type LearningEvidenceCache = Map<string, AggregatedLearningEvidence | null>;

type AggregatedLearningEvidence = {
  evidence: LearningEvidenceSnapshot;
  candidate: LearningSkillCandidate;
  source: "completed_reviewed_jobs" | "candidate_payload";
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
    const evidenceCache: LearningEvidenceCache = new Map();

    for (const result of results) {
      const item = itemsByCustomId.get(result.custom_id);
      if (!item) continue;
      const queue = item.queue_id ? queuesById.get(item.queue_id) : undefined;
      if (result.result.type === "succeeded" && queue) {
        const outcome = await processSucceededLearningResult(client, queue, result, now, evidenceCache);
        if (!outcome.ok) {
          await markItemProcessingError(client, item.id, result, outcome.error_code, now);
          await client.from("kael_learning_queue").update({
            queue_state: outcome.queue_state,
            error_code: outcome.error_code,
            processed_at: now.toISOString(),
          }).eq("id", queue.id);
          failedItems += 1;
          continue;
        }
        await client.from("kael_ai_batch_items").update({
          status: "succeeded",
          response_payload: result.result.message ?? {},
          processed_at: now.toISOString(),
        }).eq("id", item.id);
        await client.from("kael_learning_queue").update({
          queue_state: outcome.queue_state,
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

async function processSucceededLearningResult(
  client: LearningQueueDbClient,
  queue: QueuedLearningRow,
  result: AnthropicBatchResult,
  now: Date,
  evidenceCache: LearningEvidenceCache,
): Promise<
  | { ok: true; queue_state: "processed" | "manual_review" }
  | { ok: false; queue_state: "failed" | "rejected"; error_code: string }
> {
  const parsed = parseBatchLearningCandidate(result.result.message);
  if (!parsed.ok) {
    return { ok: false, queue_state: "failed", error_code: parsed.reason };
  }

  const candidate = parsed.candidate;
  const runtimeConfig = resolveLearningRuntimeConfig(readRuntimeEnv, queue.actor_id ?? undefined);
  if (!runtimeConfig.write_enabled || runtimeConfig.kill_switch || !runtimeConfig.enabled_for_actor) {
    return { ok: false, queue_state: "failed", error_code: "LEARNING_WRITE_DISABLED" };
  }

  if (candidate.skill_id !== queue.skill_id) {
    return { ok: false, queue_state: "failed", error_code: "LEARNING_SKILL_MISMATCH" };
  }

  const skill = getLearningSkill(candidate.skill_id);
  if (!skill) {
    return { ok: false, queue_state: "failed", error_code: "LEARNING_SKILL_UNKNOWN" };
  }

  const scopeDecision = enforceLearningScopeLimits(skill, candidate);
  if (!scopeDecision.allowed) {
    const candidateId = await insertLearningCandidateRow(client, queue, candidate, {
      status: "rejected",
      audit_reason: `scope_rejected:${scopeDecision.reason}`,
      evidence: emptyEvidenceSnapshot(),
    });
    if (!candidateId) {
      return { ok: false, queue_state: "failed", error_code: "LEARNING_CANDIDATE_INSERT_FAILED" };
    }
    await insertBatchLifecycleRows(client, queue, candidate, [{
      candidate_id: candidateId,
      previous_state: "candidate",
      next_state: "pending_evidence",
      transition_reason: "scope_check_started",
      safe_metadata: {
        gate_reason: scopeDecision.reason,
      },
    }, {
      candidate_id: candidateId,
      previous_state: "pending_evidence",
      next_state: "evidence_gate_check",
      transition_reason: "scope_check_completed",
      safe_metadata: {
        gate_reason: scopeDecision.reason,
      },
    }, {
      candidate_id: candidateId,
      previous_state: "evidence_gate_check",
      next_state: "rejected",
      transition_reason: `scope_rejected:${scopeDecision.reason}`,
      safe_metadata: {
        gate_reason: scopeDecision.reason,
      },
    }]);
    return { ok: false, queue_state: "rejected", error_code: "LEARNING_SCOPE_REJECTED" };
  }

  const aggregation = await aggregateCandidateEvidence(client, queue, candidate, now, evidenceCache);
  const evidence = aggregation.evidence;
  const evaluatedCandidate = aggregation.candidate;
  const gate = evaluateLearningEvidenceGate(skill, evidence);

  let activeRule: PromotionResult = { promoted: false, reason: "not_requested" };
  let lifecycleState: LearningLifecycleState = gate.next_state;
  let queueState: "processed" | "manual_review" = gate.next_state === "manual_review"
    ? "manual_review"
    : "processed";
  let candidateId: string | null = null;

  if (gate.promote && gate.next_state === "auto_promoted") {
    activeRule = await promoteCandidateToActiveRule(client, queue, evaluatedCandidate, evidence);
    if (activeRule.promoted) {
      candidateId = activeRule.candidate_id;
      lifecycleState = "active";
      queueState = "processed";
    } else {
      candidateId = await insertLearningCandidateRow(client, queue, evaluatedCandidate, {
        status: "evidence_gate_passed",
        audit_reason: `promotion_deferred:${activeRule.reason}`,
        evidence,
      });
      if (!candidateId) {
        return { ok: false, queue_state: "failed", error_code: "LEARNING_CANDIDATE_INSERT_FAILED" };
      }
      lifecycleState = "manual_review";
      queueState = "manual_review";
    }
  } else {
    candidateId = await insertLearningCandidateRow(client, queue, evaluatedCandidate, {
      status: candidateStatusForGate(gate.next_state, gate.promote),
      audit_reason: `batch_gate:${gate.reason}`,
      evidence,
    });
    if (!candidateId) {
      return { ok: false, queue_state: "failed", error_code: "LEARNING_CANDIDATE_INSERT_FAILED" };
    }
  }

  await insertBatchLifecycleRows(client, queue, evaluatedCandidate, lifecycleRowsForGate({
    candidate_id: candidateId,
    gate_state: gate.next_state,
    lifecycle_state: lifecycleState,
    gate_reason: gate.reason,
    evidence,
    active_rule: activeRule,
    evidence_source: aggregation.source,
  }));
  return { ok: true, queue_state: queueState };
}

export function parseBatchLearningCandidate(
  message: unknown,
): { ok: true; candidate: LearningSkillCandidate } | { ok: false; reason: string } {
  const direct = parseCandidateObject(readCandidateContainer(message));
  if (direct.ok) return direct;

  const text = extractBatchMessageText(message);
  if (!text) return { ok: false, reason: "LEARNING_RESULT_EMPTY" };

  const parsed = parseJsonObjectFromText(text);
  if (!parsed.ok) return { ok: false, reason: "LEARNING_RESULT_JSON_INVALID" };
  return parseCandidateObject(readCandidateContainer(parsed.value));
}

function parseCandidateObject(
  value: unknown,
): { ok: true; candidate: LearningSkillCandidate } | { ok: false; reason: string } {
  const result = learningSkillCandidateSchema.safeParse(value);
  return result.success
    ? { ok: true, candidate: result.data }
    : { ok: false, reason: "LEARNING_CANDIDATE_SCHEMA_INVALID" };
}

function readCandidateContainer(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (isRecord(value.candidate)) return value.candidate;
  if (isRecord(value.learning_candidate)) return value.learning_candidate;
  return value;
}

function extractBatchMessageText(message: unknown): string | null {
  if (typeof message === "string") return message;
  if (!isRecord(message)) return null;
  if (typeof message.text === "string") return message.text;
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return null;
  const text = message.content
    .map((item) => isRecord(item) && typeof item.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

function parseJsonObjectFromText(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    // Anthropic batch outputs may wrap JSON in a short note. Walk the first
    // balanced object instead of using lastIndexOf, so nested braces in strings
    // do not widen the parse window.
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char !== "}") continue;
    depth -= 1;
    if (depth === 0 && start >= 0) {
      try {
        return { ok: true, value: JSON.parse(text.slice(start, index + 1)) };
      } catch {
        return { ok: false };
      }
    }
  }
  return { ok: false };
}

function evidenceSnapshotFrom(
  queue: QueuedLearningRow,
  candidate: LearningSkillCandidate,
): LearningEvidenceSnapshot {
  const payload = candidate.payload;
  const suggested = isRecord(payload.suggested) ? payload.suggested : {};
  const aggregation = isRecord(suggested.aggregation) ? suggested.aggregation : {};
  const evidence = firstRecord([
    payload.evidence_snapshot,
    payload.evidence,
    queue.input_payload.evidence_snapshot,
    queue.input_payload.learning_evidence,
  ]);
  const evidenceCount = integerFrom(evidence.evidence_count) ??
    integerFrom(aggregation.evidence_count) ??
    integerFrom(payload.evidence_count) ??
    (hasCompletedTransaction(queue.input_payload) ? 1 : 0);
  const completedCount = integerFrom(evidence.completed_transaction_count) ??
    integerFrom(queue.input_payload.completed_transaction_count) ??
    (hasCompletedTransaction(queue.input_payload) ? evidenceCount : 0);
  return {
    evidence_count: evidenceCount,
    confidence: numberFrom(evidence.confidence) ??
      numberFrom(queue.input_payload.confidence) ??
      numberFrom(queue.input_payload.learning_confidence) ??
      0,
    completed_transaction_count: completedCount,
    recent_contradiction_ratio: numberFrom(evidence.recent_contradiction_ratio) ??
      numberFrom(queue.input_payload.recent_contradiction_ratio) ??
      0,
  };
}

async function aggregateCandidateEvidence(
  client: LearningQueueDbClient,
  queue: QueuedLearningRow,
  candidate: LearningSkillCandidate,
  now: Date,
  cache: LearningEvidenceCache,
): Promise<AggregatedLearningEvidence> {
  if (candidate.skill_id === "LS1") {
    const jobAggregation = await aggregateLS1PriceEvidence(client, candidate, now, cache);
    if (jobAggregation) return jobAggregation;
    return {
      evidence: emptyEvidenceSnapshot(),
      candidate,
      source: "completed_reviewed_jobs",
    };
  }

  return {
    evidence: evidenceSnapshotFrom(queue, candidate),
    candidate,
    source: "candidate_payload",
  };
}

async function aggregateLS1PriceEvidence(
  client: LearningQueueDbClient,
  candidate: LearningSkillCandidate,
  now: Date,
  cache: LearningEvidenceCache,
): Promise<AggregatedLearningEvidence | null> {
  const scope = requiredRuleScope(candidate);
  if (!scope) return null;
  const since = new Date(now.getTime() - LEARNING_EVIDENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString();
  const cacheKey = [
    candidate.skill_id,
    scope.affected_service,
    scope.affected_problem,
    scope.affected_district,
    since,
  ].join("|");
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
  const result = await client
    .from("jobs")
    .select("id,service_type,address_district,kael_problem_identified,kael_price_min,kael_price_max,final_price,reviewed_at,status,scope_change_customer_decision")
    .eq("service_type", scope.affected_service)
    .eq("kael_problem_identified", scope.affected_problem)
    .eq("address_district", scope.affected_district)
    .eq("status", "reviewed")
    .gte("reviewed_at", since)
    .order("reviewed_at", { ascending: false })
    .limit(50);
  if (result.error || !Array.isArray(result.data)) {
    cache.set(cacheKey, null);
    return null;
  }

  const rawSamples = result.data
    .map(readPriceEvidenceSample)
    .filter((sample): sample is PriceEvidenceSample => sample !== null);
  const samples = rejectPriceOutliers(rawSamples);
  if (samples.length === 0) {
    cache.set(cacheKey, null);
    return null;
  }

  const finalPrices = samples.map((sample) => sample.final_price);
  const estimateMids = samples.map((sample) =>
    (sample.kael_price_min + sample.kael_price_max) / 2
  );
  const suggestedMin = Math.max(1, Math.round(percentile(finalPrices, 0.25) ?? finalPrices[0]));
  const suggestedMax = Math.max(suggestedMin, Math.round(percentile(finalPrices, 0.75) ?? finalPrices[0]));
  const medianFinal = median(finalPrices) ?? suggestedMin;
  const confidence = confidenceFromPriceSpread(finalPrices);
  const direction = directionFromRanges(
    (median(estimateMids) ?? (suggestedMin + suggestedMax) / 2),
    (suggestedMin + suggestedMax) / 2,
  );
  const recentContradictionRatio = contradictionRatio(samples, direction);
  const evidence: LearningEvidenceSnapshot = {
    evidence_count: samples.length,
    confidence,
    completed_transaction_count: samples.length,
    recent_contradiction_ratio: recentContradictionRatio,
  };
  const candidateWithAggregation: LearningSkillCandidate = {
    ...candidate,
    payload: {
      ...candidate.payload,
      evidence_snapshot: evidence,
      suggested: {
        ...(isRecord(candidate.payload.suggested) ? candidate.payload.suggested : {}),
        aggregation: {
          method: "reviewed_jobs_iqr_window",
          evidence_count: samples.length,
          suggested_min: suggestedMin,
          suggested_max: suggestedMax,
          median_final_price: Math.round(medianFinal),
          window_days: LEARNING_EVIDENCE_WINDOW_DAYS,
        },
        new_min: suggestedMin,
        new_max: suggestedMax,
        direction,
      },
    },
  };

  const aggregated: AggregatedLearningEvidence = {
    evidence,
    candidate: candidateWithAggregation,
    source: "completed_reviewed_jobs",
  };
  cache.set(cacheKey, aggregated);
  return aggregated;
}

type PriceEvidenceSample = {
  final_price: number;
  kael_price_min: number;
  kael_price_max: number;
};

function readPriceEvidenceSample(row: unknown): PriceEvidenceSample | null {
  if (!isRecord(row)) return null;
  if (row.scope_change_customer_decision !== null && row.scope_change_customer_decision !== undefined) {
    return null;
  }
  if (typeof row.reviewed_at !== "string") return null;
  const finalPrice = integerFrom(row.final_price);
  const kaelMin = integerFrom(row.kael_price_min);
  const kaelMax = integerFrom(row.kael_price_max);
  if (
    finalPrice === null ||
    kaelMin === null ||
    kaelMax === null ||
    finalPrice <= 0 ||
    kaelMin <= 0 ||
    kaelMax < kaelMin
  ) {
    return null;
  }
  return {
    final_price: finalPrice,
    kael_price_min: kaelMin,
    kael_price_max: kaelMax,
  };
}

function confidenceFromPriceSpread(prices: number[]): number {
  const center = median(prices);
  const p25 = percentile(prices, 0.25);
  const p75 = percentile(prices, 0.75);
  if (center === null || p25 === null || p75 === null || center <= 0) return 0;
  const spreadRatio = Math.max(0, (p75 - p25) / center);
  return clampConfidence(1 - spreadRatio);
}

function rejectPriceOutliers(samples: PriceEvidenceSample[]): PriceEvidenceSample[] {
  if (samples.length < 5) return samples;
  const prices = samples.map((sample) => sample.final_price);
  const p25 = percentile(prices, 0.25);
  const p75 = percentile(prices, 0.75);
  if (p25 === null || p75 === null) return samples;
  const iqr = p75 - p25;
  if (iqr === 0) return samples;
  const lower = p25 - 1.5 * iqr;
  const upper = p75 + 1.5 * iqr;
  const filtered = samples.filter((sample) =>
    sample.final_price >= lower && sample.final_price <= upper
  );
  return filtered.length > 0 ? filtered : samples;
}

function contradictionRatio(
  samples: PriceEvidenceSample[],
  direction: "underestimate" | "overestimate" | "noisy",
): number {
  if (direction === "noisy" || samples.length === 0) return 0;
  const contradictions = samples.filter((sample) => {
    if (direction === "underestimate") return sample.final_price < sample.kael_price_min;
    return sample.final_price > sample.kael_price_max;
  }).length;
  return contradictions / samples.length;
}

function directionFromRanges(
  baselineMidpoint: number,
  suggestedMidpoint: number,
): "underestimate" | "overestimate" | "noisy" {
  if (!Number.isFinite(baselineMidpoint) || baselineMidpoint <= 0) return "noisy";
  const deltaRatio = (suggestedMidpoint - baselineMidpoint) / baselineMidpoint;
  if (deltaRatio > 0.05) return "underestimate";
  if (deltaRatio < -0.05) return "overestimate";
  return "noisy";
}

function emptyEvidenceSnapshot(): LearningEvidenceSnapshot {
  return {
    evidence_count: 0,
    confidence: 0,
    completed_transaction_count: 0,
    recent_contradiction_ratio: 0,
  };
}

async function insertLearningCandidateRow(
  client: LearningQueueDbClient,
  queue: QueuedLearningRow,
  candidate: LearningSkillCandidate,
  options: {
    status: LearningCandidateStatus;
    audit_reason: string;
    evidence: LearningEvidenceSnapshot;
  },
): Promise<string | null> {
  const scope = scopeFromCandidate(candidate);
  const result = await client.from("learning_candidates").insert({
    candidate_type: candidate.candidate_type,
    affected_service: scope.affected_service,
    affected_problem: scope.affected_problem,
    affected_district: scope.affected_district,
    suggested_payload: candidateStoragePayload(candidate),
    confidence: clampConfidence(options.evidence.confidence),
    evidence_count: Math.max(0, Math.trunc(options.evidence.evidence_count)),
    status: options.status,
    audit_reason: `${options.audit_reason}; queue=${queue.id}`,
  }).select("id").single();
  return isRecord(result.data) && typeof result.data.id === "string"
    ? result.data.id
    : null;
}

async function promoteCandidateToActiveRule(
  client: LearningQueueDbClient,
  queue: QueuedLearningRow,
  candidate: LearningSkillCandidate,
  evidence: LearningEvidenceSnapshot,
): Promise<PromotionResult> {
  if (!client.rpc) return { promoted: false, reason: "promotion_rpc_unavailable" };
  const scope = requiredRuleScope(candidate);
  if (!scope) return { promoted: false, reason: "missing_runtime_scope" };
  const rulePayload = runtimePayloadFromCandidate(candidate);
  if (!rulePayload) return { promoted: false, reason: "runtime_rule_payload_unavailable" };

  const result = await client.rpc("promote_learning_candidate", {
    p_skill_id: candidate.skill_id,
    p_candidate_type: candidate.candidate_type,
    p_target: candidate.target,
    p_effects: [...candidate.effects],
    p_candidate_payload: candidateStoragePayload(candidate),
    p_rule_payload: rulePayload,
    p_affected_service: scope.affected_service,
    p_affected_problem: scope.affected_problem,
    p_affected_district: scope.affected_district,
    p_confidence: clampConfidence(evidence.confidence),
    p_evidence_count: Math.max(0, Math.trunc(evidence.evidence_count)),
    p_actor_id: queue.actor_id,
    p_actor_role: queue.actor_role ?? "system",
    p_job_id: queue.job_id,
    p_audit_reason: `batch_gate:gate_passed; queue=${queue.id}`,
  });
  if (result.error) {
    return { promoted: false, reason: `promotion_rpc_failed:${result.error.code ?? "DB_ERROR"}` };
  }
  const row = Array.isArray(result.data)
    ? result.data.find(isRecord) ?? null
    : isRecord(result.data)
    ? result.data
    : null;
  if (!row || row.ok !== true) {
    return { promoted: false, reason: stringFrom(row?.error_code) ?? "promotion_rpc_rejected" };
  }
  const candidateId = stringFrom(row.candidate_id);
  const ruleId = stringFrom(row.rule_id);
  const ruleVersion = integerFrom(row.rule_version);
  if (!candidateId || !ruleId || ruleVersion === null) {
    return { promoted: false, reason: "promotion_rpc_missing_result" };
  }
  return {
    promoted: true,
    candidate_id: candidateId,
    rule_id: ruleId,
    rule_version: ruleVersion,
  };
}

function lifecycleRowsForGate(input: {
  candidate_id: string | null;
  gate_state: LearningLifecycleState;
  lifecycle_state: LearningLifecycleState;
  gate_reason: string;
  evidence: LearningEvidenceSnapshot;
  active_rule: PromotionResult;
  evidence_source: AggregatedLearningEvidence["source"];
}) {
  const rows: Array<{
    candidate_id: string | null;
    previous_state: LearningLifecycleState;
    next_state: LearningLifecycleState;
    transition_reason: string;
    safe_metadata: Record<string, unknown>;
  }> = [
    lifecycleTransitionRow({
      candidate_id: input.candidate_id,
      previous_state: "candidate",
      next_state: "pending_evidence",
      transition_reason: "candidate_evidence_recorded",
      safe_metadata: {
        gate_reason: input.gate_reason,
        evidence_source: input.evidence_source,
        evidence: input.evidence,
      },
    }),
  ];
  if (input.gate_state !== "pending_evidence") {
    rows.push(lifecycleTransitionRow({
      candidate_id: input.candidate_id,
      previous_state: "pending_evidence",
      next_state: "evidence_gate_check",
      transition_reason: "evidence_gate_check_started",
      safe_metadata: {
        gate_reason: input.gate_reason,
        evidence_source: input.evidence_source,
        evidence: input.evidence,
      },
    }));
    const gateTerminalState = input.active_rule.promoted ? input.gate_state : input.lifecycle_state;
    rows.push(lifecycleTransitionRow({
      candidate_id: input.candidate_id,
      previous_state: "evidence_gate_check",
      next_state: gateTerminalState,
      transition_reason: `evidence_gate:${input.gate_reason}`,
      safe_metadata: {
        gate_reason: input.gate_reason,
        evidence_source: input.evidence_source,
        evidence: input.evidence,
      },
    }));
  }
  if (input.active_rule.promoted) {
    rows.push(lifecycleTransitionRow({
      candidate_id: input.candidate_id,
      previous_state: "auto_promoted",
      next_state: "active",
      transition_reason: "active_rule_written",
      safe_metadata: {
        gate_reason: input.gate_reason,
        evidence_source: input.evidence_source,
        evidence: input.evidence,
        rule_id: input.active_rule.rule_id,
        rule_version: input.active_rule.rule_version,
      },
    }));
  } else if (
    input.gate_state === "auto_promoted" &&
    input.lifecycle_state === "manual_review"
  ) {
    rows[rows.length - 1] = lifecycleTransitionRow({
      candidate_id: input.candidate_id,
      previous_state: "evidence_gate_check",
      next_state: "manual_review",
      transition_reason: `promotion_deferred:${input.active_rule.reason}`,
      safe_metadata: {
        gate_reason: input.gate_reason,
        evidence_source: input.evidence_source,
        evidence: input.evidence,
        promotion_reason: input.active_rule.reason,
      },
    });
  }
  return rows;
}

function lifecycleTransitionRow(row: {
  candidate_id: string | null;
  previous_state: LearningLifecycleState;
  next_state: LearningLifecycleState;
  transition_reason: string;
  safe_metadata: Record<string, unknown>;
}) {
  const transition = transitionLearningLifecycle(row.previous_state, row.next_state);
  if (!transition.valid) {
    throw new Error(`Invalid learning lifecycle transition: ${row.previous_state}->${row.next_state}`);
  }
  return row;
}

async function insertBatchLifecycleRows(
  client: LearningQueueDbClient,
  queue: QueuedLearningRow,
  candidate: LearningSkillCandidate,
  rows: Array<{
    candidate_id: string | null;
    previous_state?: LearningLifecycleState | null;
    next_state: LearningLifecycleState;
    transition_reason: string;
    safe_metadata: Record<string, unknown>;
  }>,
) {
  if (rows.length === 0) return;
  const ruleId = rows.find((row) => typeof row.safe_metadata.rule_id === "string")
    ?.safe_metadata.rule_id ?? null;
  await client.from("kael_rule_lifecycle_log").insert(rows.map((row) => ({
    skill_id: candidate.skill_id,
    job_id: queue.job_id,
    rule_id: ruleId,
    candidate_id: row.candidate_id,
    previous_state: row.previous_state ?? null,
    next_state: row.next_state,
    transition_reason: row.transition_reason,
    actor_id: queue.actor_id,
    actor_role: queue.actor_role,
    safe_metadata: {
      q4_queue_id: queue.id,
      event_type: queue.event_type,
      target: candidate.target,
      candidate_type: candidate.candidate_type,
      prompt_version: candidate.prompt_version,
      requires_manual_review: candidate.requires_manual_review,
      ...row.safe_metadata,
    },
  })));
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

async function markItemProcessingError(
  client: LearningQueueDbClient,
  itemId: string,
  result: AnthropicBatchResult,
  errorCode: string,
  now: Date,
) {
  await client.from("kael_ai_batch_items").update({
    status: "errored",
    response_payload: result.result.message ?? {},
    error_payload: { type: "processing_error", error_code: errorCode },
    processed_at: now.toISOString(),
  }).eq("id", itemId);
}

function candidateStatusForGate(
  nextState: LearningLifecycleState,
  promote: boolean,
): LearningCandidateStatus {
  if (nextState === "manual_review") return "manual_review";
  if (promote) return "evidence_gate_passed";
  if (nextState === "rejected") return "rejected";
  return "pending_evidence";
}

function runtimePayloadFromCandidate(candidate: LearningSkillCandidate): Record<string, unknown> | null {
  const payload = candidate.payload;
  const base = { candidate_type: candidate.candidate_type, ...payload };
  if (candidate.candidate_type === "price_prior_update") {
    const suggested = isRecord(payload.suggested) ? payload.suggested : {};
    const aggregation = isRecord(suggested.aggregation) ? suggested.aggregation : {};
    const newMin = integerFrom(suggested.new_min) ??
      integerFrom(aggregation.suggested_min);
    const newMax = integerFrom(suggested.new_max) ??
      integerFrom(aggregation.suggested_max);
    if (newMin === null || newMax === null || newMin <= 0 || newMax < newMin) {
      return null;
    }
    return {
      ...base,
      suggested: {
        ...suggested,
        new_min: newMin,
        new_max: newMax,
      },
    };
  }
  if (candidate.candidate_type === "analysis_rule") return base;
  return null;
}

function candidateStoragePayload(candidate: LearningSkillCandidate): Record<string, unknown> {
  return {
    ...(runtimePayloadFromCandidate(candidate) ?? {
      candidate_type: candidate.candidate_type,
      ...candidate.payload,
    }),
    skill_id: candidate.skill_id,
    target: candidate.target,
    effects: [...candidate.effects],
    prompt_version: candidate.prompt_version,
    requires_manual_review: candidate.requires_manual_review,
    lifecycle_state: candidate.lifecycle_state,
  };
}

function scopeFromCandidate(candidate: LearningSkillCandidate): {
  affected_service: string | null;
  affected_problem: string | null;
  affected_district: string | null;
} {
  const payload = candidate.payload;
  const scope = isRecord(payload.scope) ? payload.scope : {};
  return {
    affected_service: serviceFrom(scope.service_type ?? payload.service_type),
    affected_problem: stringFrom(scope.problem_slug ?? payload.problem_slug),
    affected_district: stringFrom(scope.district_code ?? payload.district_code),
  };
}

function requiredRuleScope(candidate: LearningSkillCandidate): LearningRuleScope | null {
  const scope = scopeFromCandidate(candidate);
  if (
    !isSupportedService(scope.affected_service) ||
    !scope.affected_problem ||
    !scope.affected_district
  ) {
    return null;
  }
  return {
    affected_service: scope.affected_service,
    affected_problem: scope.affected_problem,
    affected_district: scope.affected_district,
  };
}

function hasCompletedTransaction(input: Record<string, unknown>): boolean {
  return numberFrom(input.final_price) !== null &&
    numberFrom(input.rating) !== null &&
    typeof input.reviewed_at === "string";
}

function firstRecord(values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    if (isRecord(value)) return value;
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function serviceFrom(value: unknown): "electrical" | "plumbing" | "cleaning" | null {
  return isSupportedService(value) ? value : null;
}

function isSupportedService(value: unknown): value is "electrical" | "plumbing" | "cleaning" {
  return value === "electrical" || value === "plumbing" || value === "cleaning";
}

function numberFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerFrom(value: unknown): number | null {
  const number = numberFrom(value);
  return number === null ? null : Math.trunc(number);
}

function median(values: readonly number[]): number | null {
  return percentile(values, 0.5);
}

function percentile(values: readonly number[], p: number): number | null {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const rank = (sorted.length - 1) * Math.max(0, Math.min(1, p));
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower] ?? null;
  const lowerValue = sorted[lower];
  const upperValue = sorted[upper];
  if (lowerValue === undefined || upperValue === undefined) return null;
  return lowerValue + (upperValue - lowerValue) * (rank - lower);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function readRuntimeEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.(name);
}
