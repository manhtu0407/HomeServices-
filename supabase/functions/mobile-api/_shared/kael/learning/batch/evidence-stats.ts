import { readKaelOptimizationFlags } from "../../kael-usage/cost-tracking.ts";
import {
  retrieveAnthropicBatchResults,
  retrieveAnthropicMessageBatch,
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

import {
  clampConfidence,
  integerFrom,
  isRecord,
  median,
  numberFrom,
  percentile,
  stringFrom,
} from "../../../platform/coercions.ts";

const LEARNING_EVIDENCE_WINDOW_DAYS = 90;

export type LearningRuleScope = {
  affected_service: KaelCaseWorkServiceType;
  affected_problem: string;
  affected_district: string;
};

export type LearningEvidenceCache = Map<string, AggregatedLearningEvidence | null>;

export type AggregatedLearningEvidence = {
  evidence: LearningEvidenceSnapshot;
  candidate: LearningSkillCandidate;
  source: "completed_reviewed_jobs" | "candidate_payload";
};


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

export async function aggregateCandidateEvidence(
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

export function emptyEvidenceSnapshot(): LearningEvidenceSnapshot {
  return {
    evidence_count: 0,
    confidence: 0,
    completed_transaction_count: 0,
    recent_contradiction_ratio: 0,
  };
}

export function scopeFromCandidate(candidate: LearningSkillCandidate): {
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

export function requiredRuleScope(candidate: LearningSkillCandidate): LearningRuleScope | null {
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

function serviceFrom(value: unknown): KaelCaseWorkServiceType | null {
  return isSupportedService(value) ? value : null;
}

function isSupportedService(value: unknown): value is KaelCaseWorkServiceType {
  return typeof value === "string" &&
    (KAEL_CASE_WORK_SERVICE_TYPES as readonly string[]).includes(value);
}
