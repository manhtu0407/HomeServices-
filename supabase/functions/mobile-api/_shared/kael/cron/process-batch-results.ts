import { readKaelOptimizationFlags } from "../cost-tracking.ts";
import {
  retrieveAnthropicBatchResults,
  retrieveAnthropicMessageBatch,
} from "../provider-batch.ts";
import {
  finalizeBatchItemSpend,
  recordBatchLearningOutputHealth,
} from "./batch-result-guards.ts";
import { parseBatchLearningCandidate } from "./batch-learning-candidate.ts";
import {
  claimBatchResults,
  commitBatchItemResult,
  completeBatchResultClaim,
  fetchBatchItems,
  fetchQueueRows,
  recordBatchPollStatus,
  releaseBatchClaims,
  renewBatchResultClaim,
} from "./batch-result-store.ts";
import {
  candidateStatusForGate,
  type BatchLearningCandidateStatus,
} from "./batch-learning-lifecycle.ts";
import {
  commitLearningEffectResult,
  type LearningEffectCandidate,
  type LearningEffectPlan,
} from "./learning-effect-store.ts";
import type { EdgeAiSecrets } from "../types.ts";
import {
  KAEL_CASE_WORK_SERVICE_TYPES,
  type KaelCaseWorkServiceType,
} from "../performance-profiles.ts";
import {
  type LearningQueueDbClient,
  type QueuedLearningRow,
} from "./process-learning-queue.ts";
import {
  enforceLearningScopeLimits,
  evaluateLearningEvidenceGate,
  getLearningSkill,
  resolveLearningRuntimeConfig,
  type LearningEvidenceSnapshot,
  type LearningLifecycleState,
  type LearningSkillCandidate,
} from "../skills/registry.ts";

export { parseBatchLearningCandidate };

const LEARNING_EVIDENCE_WINDOW_DAYS = 90;

type LearningRuleScope = {
  affected_service: KaelCaseWorkServiceType;
  affected_problem: string;
  affected_district: string;
};

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
  const claim = await claimBatchResults(client, {
    limit: options.limit,
    now,
    forcePoll: options.forcePoll,
  });
  if (!claim.ok) return emptyBatchSummary(claim.errorCode);
  const { batches, claimToken } = claim;
  let ended = 0;
  let processedItems = 0;
  let failedItems = 0;

  for (const batch of batches) {
    let remote;
    try {
      remote = await retrieveAnthropicMessageBatch(secrets, batch.provider_batch_id);
    } catch {
      return failBatchSummary(
        client,
        claimToken,
        now,
        batches.length,
        ended,
        processedItems,
        failedItems,
        "BATCH_PROVIDER_POLL_FAILED",
      );
    }
    const remoteStatus = remote.processing_status === "ended" ? "ended" : "in_progress";
    const statusWritten = await recordBatchPollStatus(client, {
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
    if (!statusWritten) {
      return failBatchSummary(
        client,
        claimToken,
        now,
        batches.length,
        ended,
        processedItems,
        failedItems,
        "BATCH_STATUS_WRITE_FAILED",
      );
    }

    if (remote.processing_status !== "ended") continue;
    ended += 1;

    let results;
    try {
      results = await retrieveAnthropicBatchResults(secrets, batch.provider_batch_id);
    } catch {
      return failBatchSummary(
        client,
        claimToken,
        now,
        batches.length,
        ended,
        processedItems,
        failedItems,
        "BATCH_PROVIDER_RESULTS_FAILED",
      );
    }
    const itemResult = await fetchBatchItems(client, batch.id);
    if (!itemResult.ok) {
      return failBatchSummary(
        client,
        claimToken,
        now,
        batches.length,
        ended,
        processedItems,
        failedItems,
        "BATCH_ITEM_LOAD_FAILED",
      );
    }
    const itemRows = itemResult.rows;
    const queueResult = await fetchQueueRows(
      client,
      itemRows.map((item) => item.queue_id).filter((id): id is string => typeof id === "string"),
    );
    if (!queueResult.ok) {
      return failBatchSummary(
        client,
        claimToken,
        now,
        batches.length,
        ended,
        processedItems,
        failedItems,
        "LEARNING_QUEUE_LOAD_FAILED",
      );
    }
    const queueRows = queueResult.rows;
    const queuesById = new Map(queueRows.map((row) => [row.id, row]));
    const itemsByCustomId = new Map(itemRows.map((item) => [item.custom_id, item]));
    if (itemRows.some((item) => item.queue_id !== null && !queuesById.has(item.queue_id))) {
      return failBatchSummary(
        client,
        claimToken,
        now,
        batches.length,
        ended,
        processedItems,
        failedItems,
        "LEARNING_QUEUE_ROW_MISSING",
      );
    }
    const resultCustomIds = results.map((result) => result.custom_id);
    if (
      new Set(resultCustomIds).size !== resultCustomIds.length ||
      resultCustomIds.some((customId) => !itemsByCustomId.has(customId))
    ) {
      return failBatchSummary(
        client,
        claimToken,
        now,
        batches.length,
        ended,
        processedItems,
        failedItems,
        "BATCH_RESULTS_MISMATCH",
      );
    }
    const resultCustomIdSet = new Set(resultCustomIds);
    if (itemRows.some((item) => !resultCustomIdSet.has(item.custom_id))) {
      return failBatchSummary(
        client,
        claimToken,
        now,
        batches.length,
        ended,
        processedItems,
        failedItems,
        "BATCH_RESULTS_INCOMPLETE",
      );
    }
    const evidenceCache: LearningEvidenceCache = new Map();

    for (const result of results) {
      const item = itemsByCustomId.get(result.custom_id);
      if (!item) continue;
      if (item.status !== undefined && item.status !== "pending") continue;
      if (!await renewBatchResultClaim(client, batch.id, claimToken)) {
        return failBatchSummary(
          client,
          claimToken,
          now,
          batches.length,
          ended,
          processedItems,
          failedItems,
          "BATCH_CLAIM_RENEW_FAILED",
        );
      }
      const queue = item.queue_id ? queuesById.get(item.queue_id) : undefined;
      await finalizeBatchItemSpend(client, item, queue?.actor_id, result);
      if (result.result.type === "succeeded" && queue) {
        const parsedOutput = parseBatchLearningCandidate(result.result.message);
        await recordBatchLearningOutputHealth(
          secrets,
          parsedOutput.ok ? null : parsedOutput.reason,
        );
        const outcome = await processLearningCandidateResponse(
          client,
          queue,
          result.result.message,
          now,
          evidenceCache,
        );
        const commit = await commitLearningEffectResult(client, {
          sourceMode: "anthropic_batch",
          batchId: batch.id,
          itemId: item.id,
          queueId: queue.id,
          ownerToken: claimToken,
          itemStatus: outcome.ok ? "succeeded" : "errored",
          responsePayload: result.result.message ?? {},
          errorPayload: outcome.ok
            ? {}
            : { type: "processing_error", error_code: outcome.error_code },
          queueState: outcome.queue_state,
          queueErrorCode: outcome.ok ? null : outcome.error_code,
          processedAt: now.toISOString(),
          effect: outcome.effect,
        });
        if (!commit.ok) {
          return failBatchSummary(
            client,
            claimToken,
            now,
            batches.length,
            ended,
            processedItems,
            failedItems,
            commit.errorCode,
          );
        }
        if (outcome.ok) processedItems += 1;
        else failedItems += 1;
      } else {
        const providerErrorCode = result.result.type === "succeeded"
          ? "LEARNING_QUEUE_ROW_MISSING"
          : result.result.type.toUpperCase();
        const commit = await commitBatchItemResult(client, {
          batchId: batch.id,
          itemId: item.id,
          queueId: queue?.id ?? null,
          claimToken,
          itemStatus: result.result.type === "succeeded" ? "errored" : result.result.type,
          responsePayload: result.result.message ?? {},
          errorPayload: result.result.error ?? {
            type: result.result.type === "succeeded" ? "processing_error" : result.result.type,
            error_code: providerErrorCode,
          },
          queueState: queue ? "failed" : null,
          queueErrorCode: queue ? providerErrorCode : null,
          processedAt: now.toISOString(),
        });
        if (!commit.ok) {
          return failBatchSummary(
            client,
            claimToken,
            now,
            batches.length,
            ended,
            processedItems,
            failedItems,
            commit.errorCode,
          );
        }
        failedItems += 1;
      }
    }

    if (!await completeBatchResultClaim(client, batch.id, claimToken)) {
      return failBatchSummary(
        client,
        claimToken,
        now,
        batches.length,
        ended,
        processedItems,
        failedItems,
        "BATCH_FINALIZE_FAILED",
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

export type LearningCandidateProcessOutcome =
  | {
    ok: true;
    queue_state: "processed" | "manual_review";
    effect: LearningEffectPlan;
  }
  | {
    ok: false;
    queue_state: "failed" | "rejected";
    error_code: string;
    effect: LearningEffectPlan | null;
  };
export async function processLearningCandidateResponse(
  client: LearningQueueDbClient,
  queue: QueuedLearningRow,
  message: unknown,
  now: Date,
  evidenceCache: LearningEvidenceCache = new Map(),
): Promise<LearningCandidateProcessOutcome> {
  const parsed = parseBatchLearningCandidate(message);
  if (!parsed.ok) {
    return { ok: false, queue_state: "failed", error_code: parsed.reason, effect: null };
  }
  const candidate = parsed.candidate;
  const runtimeConfig = resolveLearningRuntimeConfig(readRuntimeEnv, queue.actor_id ?? undefined);
  if (!runtimeConfig.write_enabled || runtimeConfig.kill_switch || !runtimeConfig.enabled_for_actor) {
    return {
      ok: false,
      queue_state: "failed",
      error_code: "LEARNING_WRITE_DISABLED",
      effect: null,
    };
  }
  if (candidate.skill_id !== queue.skill_id) {
    return {
      ok: false,
      queue_state: "failed",
      error_code: "LEARNING_SKILL_MISMATCH",
      effect: null,
    };
  }
  const skill = getLearningSkill(candidate.skill_id);
  if (!skill) {
    return {
      ok: false,
      queue_state: "failed",
      error_code: "LEARNING_SKILL_UNKNOWN",
      effect: null,
    };
  }
  const scopeDecision = enforceLearningScopeLimits(skill, candidate);
  if (!scopeDecision.allowed) {
    const evidence = emptyEvidenceSnapshot();
    return {
      ok: false,
      queue_state: "rejected",
      error_code: "LEARNING_SCOPE_REJECTED",
      effect: candidateEffectPlan(candidate, evidence, {
        mode: "candidate",
        status: "rejected",
        auditReason: `scope_rejected:${scopeDecision.reason}`,
        gateState: "rejected",
        lifecycleState: "rejected",
        gateReason: scopeDecision.reason,
        evidenceSource: "candidate_payload",
        scopeRejected: true,
      }),
    };
  }
  let aggregation: AggregatedLearningEvidence;
  try {
    aggregation = await aggregateCandidateEvidence(client, queue, candidate, now, evidenceCache);
  } catch {
    return {
      ok: false,
      queue_state: "failed",
      error_code: "LEARNING_EVIDENCE_LOAD_FAILED",
      effect: null,
    };
  }
  const evidence = aggregation.evidence;
  const evaluatedCandidate = aggregation.candidate;
  const gate = evaluateLearningEvidenceGate(skill, evidence);
  if (gate.promote && gate.next_state === "auto_promoted") {
    const scope = requiredRuleScope(evaluatedCandidate);
    const rulePayload = runtimePayloadFromCandidate(evaluatedCandidate);
    const deferredReason = !scope
      ? "missing_runtime_scope"
      : !rulePayload
      ? "runtime_rule_payload_unavailable"
      : null;
    if (deferredReason) {
      return {
        ok: true,
        queue_state: "manual_review",
        effect: candidateEffectPlan(evaluatedCandidate, evidence, {
          mode: "candidate",
          status: "evidence_gate_passed",
          auditReason: `promotion_deferred:${deferredReason}`,
          gateState: gate.next_state,
          lifecycleState: "manual_review",
          gateReason: gate.reason,
          evidenceSource: aggregation.source,
          promotionDeferredReason: deferredReason,
        }),
      };
    }
    return {
      ok: true,
      queue_state: "processed",
      effect: candidateEffectPlan(evaluatedCandidate, evidence, {
        mode: "promotion",
        status: "evidence_gate_passed",
        auditReason: `batch_gate:${gate.reason}`,
        gateState: gate.next_state,
        lifecycleState: "active",
        gateReason: gate.reason,
        evidenceSource: aggregation.source,
        rulePayload,
      }),
    };
  }
  const queueState = gate.next_state === "manual_review" ? "manual_review" : "processed";
  return {
    ok: true,
    queue_state: queueState,
    effect: candidateEffectPlan(evaluatedCandidate, evidence, {
      mode: "candidate",
      status: candidateStatusForGate(gate.next_state, gate.promote),
      auditReason: `batch_gate:${gate.reason}`,
      gateState: gate.next_state,
      lifecycleState: gate.next_state,
      gateReason: gate.reason,
      evidenceSource: aggregation.source,
    }),
  };
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
    throw new Error("LEARNING_EVIDENCE_LOAD_FAILED");
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

function candidateEffectPlan(
  candidate: LearningSkillCandidate,
  evidence: LearningEvidenceSnapshot,
  options: {
    mode: "candidate" | "promotion";
    status: BatchLearningCandidateStatus;
    auditReason: string;
    gateState: LearningLifecycleState;
    lifecycleState: LearningLifecycleState;
    gateReason: string;
    evidenceSource: "completed_reviewed_jobs" | "candidate_payload";
    scopeRejected?: boolean;
    promotionDeferredReason?: string | null;
    rulePayload?: Record<string, unknown> | null;
  },
): LearningEffectPlan {
  const scope = scopeFromCandidate(candidate);
  const effectCandidate: LearningEffectCandidate = {
    skill_id: candidate.skill_id,
    candidate_type: candidate.candidate_type,
    target: candidate.target,
    effects: [...candidate.effects],
    suggested_payload: candidateStoragePayload(candidate),
    rule_payload: options.rulePayload ?? null,
    affected_service: scope.affected_service,
    affected_problem: scope.affected_problem,
    affected_district: scope.affected_district,
    confidence: clampConfidence(evidence.confidence),
    evidence_count: Math.max(0, Math.trunc(evidence.evidence_count)),
    status: options.status,
    audit_reason: options.auditReason,
    prompt_version: candidate.prompt_version,
    requires_manual_review: candidate.requires_manual_review,
  };
  return {
    schema: "kael_learning_effect.v1",
    mode: options.mode,
    candidate: effectCandidate,
    lifecycle: {
      gate_state: options.gateState,
      lifecycle_state: options.lifecycleState,
      gate_reason: options.gateReason,
      evidence,
      evidence_source: options.evidenceSource,
      scope_rejected: options.scopeRejected === true,
      promotion_deferred_reason: options.promotionDeferredReason ?? null,
    },
  };
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

function serviceFrom(value: unknown): KaelCaseWorkServiceType | null {
  return isSupportedService(value) ? value : null;
}

function isSupportedService(value: unknown): value is KaelCaseWorkServiceType {
  return typeof value === "string" &&
    (KAEL_CASE_WORK_SERVICE_TYPES as readonly string[]).includes(value);
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
