import {
  buildKaelOptimizationMetricRows,
  readKaelOptimizationFlags,
} from "../../../kael/kael-usage/cost-tracking.ts";
import { planLearningSkillTriggers, type LearningSkillInput } from "../../../kael/index.ts";
import type { PricedScopeChangeEstimate } from "./effects-contracts.ts";
import type { ScopeChangeKaelEstimate } from "../../../kael/index.ts";

export function buildDirectScopeEffectPayloads(
  jobId: string,
  estimate: PricedScopeChangeEstimate,
  learningInput: LearningSkillInput,
) {
  const databaseEffectId = crypto.randomUUID();
  const apiLogs = buildDurableScopeApiLogs(jobId, estimate, databaseEffectId);
  return {
    database: {
      effectId: databaseEffectId,
      payload: {
        api_logs: apiLogs,
        optimization_metrics: buildKaelOptimizationMetricRows(apiLogs),
      },
    },
    learning: {
      effectId: crypto.randomUUID(),
      payload: buildDurableScopeLearningPayload(learningInput),
    },
    push: { effectId: crypto.randomUUID() },
  };
}

function buildDurableScopeApiLogs(
  jobId: string,
  estimate: ScopeChangeKaelEstimate,
  effectId: string,
): Array<Record<string, unknown>> {
  const traceRows = (estimate.trace ?? [])
    .filter((trace) =>
      trace.purpose === "scope_change" &&
      trace.provider !== null &&
      trace.model !== null
    )
    .map((trace, index) => ({
      job_id: jobId,
      request_id: `scope-effect:${effectId}:${index}`,
      purpose: "scope_change",
      provider: trace.provider,
      model: trace.model,
      input_tokens: null,
      output_tokens: null,
      cost_usd: trace.cost_usd,
      latency_ms: trace.latency_ms ?? 0,
      success: trace.validation.status === "pass",
      error_code: trace.validation.reason_code ?? null,
      prompt_version: null,
      fallback_used: false,
      safe_metadata: trace.safe_metadata,
    }));
  if (traceRows.length > 0) return traceRows;
  if (!estimate.provider || !estimate.model) return [];
  return [{
    job_id: jobId,
    request_id: `scope-effect:${effectId}:0`,
    purpose: "scope_change",
    provider: estimate.provider,
    model: estimate.model,
    input_tokens: null,
    output_tokens: null,
    cost_usd: estimate.cost_usd,
    latency_ms: estimate.latency_ms ?? 0,
    success: !estimate.fallback_used,
    error_code: estimate.failure_reason ?? null,
    prompt_version: null,
    fallback_used: estimate.fallback_used,
    safe_metadata: {},
  }];
}

function buildDurableScopeLearningPayload(input: LearningSkillInput) {
  const planned = planLearningSkillTriggers("post-B6", input);
  const item = planned[0];
  if (!item) return { destination: "none" };
  return {
    destination: readKaelOptimizationFlags().KAEL_OPT_BATCH_LEARNING_ENABLED
      ? "batch"
      : "lifecycle",
    input_payload: input,
    candidate_payload: item.candidate,
    queue_state: item.queue_state,
    audit: item.audit ? { reason: item.audit.reason } : null,
  };
}
