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
  aggregateCandidateEvidence,
  emptyEvidenceSnapshot,
  requiredRuleScope,
  scopeFromCandidate,
  type AggregatedLearningEvidence,
  type LearningEvidenceCache,
} from "./evidence-stats.ts";
import { clampConfidence, integerFrom, isRecord } from "../../../platform/coercions.ts";

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
  // Pin the model response to the queued candidate. The queue row's
  // candidate_payload was built server-side; a response that renames the
  // candidate_type, retargets, or moves scope is a cross-skill escalation
  // and never proceeds.
  const queuedCandidate = queue.candidate_payload;
  if (
    candidate.candidate_type !== queuedCandidate.candidate_type ||
    candidate.target !== queuedCandidate.target ||
    !scopesMatch(candidate, queuedCandidate)
  ) {
    return {
      ok: false,
      queue_state: "failed",
      error_code: "LEARNING_CANDIDATE_MISMATCH",
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

function scopesMatch(
  response: LearningSkillCandidate,
  queued: LearningSkillCandidate,
): boolean {
  const responseScope = scopeFromCandidate(response);
  const queuedScope = scopeFromCandidate(queued);
  return responseScope.affected_service === queuedScope.affected_service &&
    responseScope.affected_problem === queuedScope.affected_problem &&
    responseScope.affected_district === queuedScope.affected_district;
}


function readRuntimeEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.(name);
}
