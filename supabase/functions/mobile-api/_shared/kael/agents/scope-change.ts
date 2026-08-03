import type { EdgeAiSecrets, ScopeChangeComputeInput, ScopeChangeEstimateBody, ScopeChangeKaelEstimate, ScopeChangeKaelReview, ScopeChangeReviewBody, ScopeChangeReviewInput } from "../contracts/types.ts";
import { PRICE_DISCLAIMER, scopeChangeEstimateSchema, scopeChangeReviewSchema } from "../contracts/types.ts";
import { buildScopeChangeEstimateMessages, buildScopeChangeReviewMessages } from "../prompts/prompts.ts";
import { callStructuredAI } from "../kael-providers/structured-call.ts";
import type { KaelSpendGate } from "../kael-guardrails/spend-gate.ts";
import { chooseCircuitAwareProviderOrNull } from "../kael-providers/routing.ts";
import { maxTokensForPurpose } from "../kael-providers/routing.config.ts";
import { logKaelEscalation, selectKaelEscalation } from "../kael-guardrails/escalation.ts";
import {
  buildNoProviderTrace,
  buildProviderAttemptTrace,
  type KaelSafeTraceEvent,
} from "../learning/trace.ts";
export {
  calculateScopeChangeAnomaly,
  calculateScopeChangeMargin,
  matchSuspiciousScopeKeywords,
  type ScopeChangeRiskConfig,
} from "../kael-guardrails/scope-risk.ts";
import { timed } from "../pipeline/utils.ts";

type ScopeChangeEstimateFallback = Extract<
  ScopeChangeKaelEstimate,
  { fallback_used: true }
>;

export const KAEL_PRICE_DISCLAIMER_V3 = PRICE_DISCLAIMER;
const SCOPE_CHANGE_POLICY_ID = "kael.autonomy.v2.scope_change_review";

export async function reviewScopeChange(
  input: ScopeChangeReviewInput,
  secrets: EdgeAiSecrets,
  spendGate: KaelSpendGate,
): Promise<ScopeChangeKaelReview> {
  const fallback = buildScopeChangeFallbackReview(input);
  const route = chooseCircuitAwareProviderOrNull("scope_change");
  if (!route) {
    return {
      ...fallback,
      failure_reason: "NO_PROVIDER_AVAILABLE",
      trace: [scopeChangeNoProviderTrace()],
    };
  }
  const provider = route.provider as "anthropic";
  const attempt = await timed(() =>
    callStructuredAI({
      purpose: "scope_change",
      provider,
      model: route.model,
      messages: buildScopeChangeReviewMessages(input),
      maxTokens: maxTokensForPurpose("scope_change", 450),
      temperature: 0.1,
      timeoutMs: route.latencyBudgetMs,
      maxRetries: 0,
    }, scopeChangeReviewSchema, secrets, spendGate)
  );

  if (!attempt.result.success) {
    const schemaResponse = attempt.result.code === "SCHEMA_INVALID"
      ? attempt.result.response
      : undefined;
    if (schemaResponse) {
      return {
        ...fallback,
        provider,
        model: route.model,
        failure_reason: "INVALID_SCHEMA",
        cost_usd: schemaResponse.usage.costUsd,
        latency_ms: attempt.ms,
        trace: [scopeChangeProviderTrace(route, "schema_invalid", {
          code: "INVALID_SCHEMA",
          latencyMs: attempt.ms,
          costUsd: schemaResponse.usage.costUsd,
          fallbackUsed: true,
        })],
      };
    }
    return {
      ...fallback,
      provider,
      model: route.model,
      failure_reason: attempt.result.code,
      latency_ms: attempt.ms,
      trace: [scopeChangeProviderTrace(route, "error", {
        code: attempt.result.code,
        latencyMs: attempt.ms,
        fallbackUsed: true,
      })],
    };
  }

  let selectedRoute = route;
  let selectedData = attempt.result.data;
  let selectedCostUsd = attempt.result.usage.costUsd;
  let selectedLatencyMs = attempt.ms;
  const trace = [scopeChangeProviderTrace(route, "success", {
    latencyMs: attempt.ms,
    costUsd: attempt.result.usage.costUsd,
    confidence: attempt.result.data.confidence,
    fallbackUsed: false,
  })];
  const escalation = selectKaelEscalation("scope_change", {
    provider: route.provider,
    model: route.model,
    confidence: attempt.result.data.confidence,
    highStakes: isScopeChangeHighStakes(input),
  });
  if (escalation) {
    logKaelEscalation("scope_change", escalation);
    const escalatedAttempt = await timed(() =>
      callStructuredAI({
        purpose: "scope_change",
        provider: escalation.route.provider,
        model: escalation.route.model,
        messages: buildScopeChangeReviewMessages(input),
        maxTokens: maxTokensForPurpose("scope_change", 450),
        temperature: 0.1,
        timeoutMs: route.latencyBudgetMs,
        maxRetries: 0,
      }, scopeChangeReviewSchema, secrets, spendGate)
    );
    if (escalatedAttempt.result.success) {
      selectedRoute = { ...route, ...escalation.route };
      selectedData = escalatedAttempt.result.data;
      selectedCostUsd = escalatedAttempt.result.usage.costUsd;
      selectedLatencyMs = escalatedAttempt.ms;
      trace.push(scopeChangeProviderTrace(selectedRoute, "success", {
        code: `MODEL_ESCALATION_${escalation.reason.toUpperCase()}`,
        latencyMs: selectedLatencyMs,
        costUsd: selectedCostUsd,
        confidence: selectedData.confidence,
        fallbackUsed: false,
        safeMetadata: { escalation_reason: escalation.reason },
      }));
    }
  }

  return {
    version: "scope-change-review.2026-05-20.v1",
    ...selectedData,
    provider: selectedRoute.provider as "anthropic",
    model: selectedRoute.model,
    fallback_used: false,
    reviewed_at: new Date().toISOString(),
    cost_usd: selectedCostUsd,
    latency_ms: selectedLatencyMs,
    trace,
  };
}

// Kael computes new price estimate from worker's
// reported on-site scope. Worker không nhập price; Kael giữ price authority.
export async function computeScopeChangeEstimate(
  input: ScopeChangeComputeInput,
  secrets: EdgeAiSecrets,
  spendGate: KaelSpendGate,
): Promise<ScopeChangeKaelEstimate> {
  const fallback = buildScopeChangeEstimateFallback(input);
  const route = chooseCircuitAwareProviderOrNull("scope_change");
  if (!route) {
    return {
      ...fallback,
      failure_reason: "NO_PROVIDER_AVAILABLE",
      trace: [scopeChangeNoProviderTrace()],
    };
  }
  const provider = route.provider as "anthropic";
  const attempt = await timed(() =>
    callStructuredAI({
      purpose: "scope_change",
      provider,
      model: route.model,
      messages: buildScopeChangeEstimateMessages(input),
      maxTokens: maxTokensForPurpose("scope_change", 500),
      temperature: 0.1,
      timeoutMs: route.latencyBudgetMs,
      maxRetries: 0,
    }, scopeChangeEstimateSchema, secrets, spendGate)
  );

  if (!attempt.result.success) {
    const schemaResponse = attempt.result.code === "SCHEMA_INVALID"
      ? attempt.result.response
      : undefined;
    if (schemaResponse) {
      return {
        ...fallback,
        provider,
        model: route.model,
        failure_reason: "INVALID_SCHEMA",
        cost_usd: schemaResponse.usage.costUsd,
        latency_ms: attempt.ms,
        trace: [scopeChangeProviderTrace(route, "schema_invalid", {
          code: "INVALID_SCHEMA",
          latencyMs: attempt.ms,
          costUsd: schemaResponse.usage.costUsd,
          fallbackUsed: true,
        })],
      };
    }
    return {
      ...fallback,
      provider,
      model: route.model,
      failure_reason: attempt.result.code,
      latency_ms: attempt.ms,
      trace: [scopeChangeProviderTrace(route, "error", {
        code: attempt.result.code,
        latencyMs: attempt.ms,
        fallbackUsed: true,
      })],
    };
  }

  let selectedRoute = route;
  let selectedData = attempt.result.data;
  let selectedCostUsd = attempt.result.usage.costUsd;
  let selectedLatencyMs = attempt.ms;
  const trace = [scopeChangeProviderTrace(route, "success", {
    latencyMs: attempt.ms,
    costUsd: attempt.result.usage.costUsd,
    confidence: attempt.result.data.confidence,
    fallbackUsed: false,
  })];
  const escalation = selectKaelEscalation("scope_change", {
    provider: route.provider,
    model: route.model,
    confidence: attempt.result.data.confidence,
    highStakes: isScopeChangeHighStakes(input),
  });
  if (escalation) {
    logKaelEscalation("scope_change", escalation);
    const escalatedAttempt = await timed(() =>
      callStructuredAI({
        purpose: "scope_change",
        provider: escalation.route.provider,
        model: escalation.route.model,
        messages: buildScopeChangeEstimateMessages(input),
        maxTokens: maxTokensForPurpose("scope_change", 500),
        temperature: 0.1,
        timeoutMs: route.latencyBudgetMs,
        maxRetries: 0,
      }, scopeChangeEstimateSchema, secrets, spendGate)
    );
    if (escalatedAttempt.result.success) {
      selectedRoute = { ...route, ...escalation.route };
      selectedData = escalatedAttempt.result.data;
      selectedCostUsd = escalatedAttempt.result.usage.costUsd;
      selectedLatencyMs = escalatedAttempt.ms;
      trace.push(scopeChangeProviderTrace(selectedRoute, "success", {
        code: `MODEL_ESCALATION_${escalation.reason.toUpperCase()}`,
        latencyMs: selectedLatencyMs,
        costUsd: selectedCostUsd,
        confidence: selectedData.confidence,
        fallbackUsed: false,
        safeMetadata: { escalation_reason: escalation.reason },
      }));
    }
  }

  return {
    schema_version: "scope_change_kael_review.v1",
    prompt_version: "scope-change-estimate.2026-05-23.v1",
    version: "scope-change-estimate.2026-05-23.v1",
    ...selectedData,
    advisory: selectedData.advisory ?? null,
    disclaimer: PRICE_DISCLAIMER,
    provider: selectedRoute.provider as "anthropic",
    model: selectedRoute.model,
    fallback_used: false,
    computed_at: new Date().toISOString(),
    cost_usd: selectedCostUsd,
    latency_ms: selectedLatencyMs,
    trace,
    input_summary: scopeChangeInputSummary(input),
  };
}

function scopeChangeNoProviderTrace(): KaelSafeTraceEvent {
  return buildNoProviderTrace({
    workflowPhase: "plan_price_adjust",
    actorRole: "worker",
    action: "worker.request_scope_change",
    policyId: SCOPE_CHANGE_POLICY_ID,
    purpose: "scope_change",
    reasonCode: "NO_PROVIDER_AVAILABLE",
  });
}

function scopeChangeProviderTrace(
  route: { provider: "anthropic" | "perplexity" | "deepseek"; model: string },
  result: "success" | "error" | "schema_invalid",
  options: {
    readonly code?: string;
    readonly latencyMs?: number;
    readonly costUsd?: number;
    readonly confidence?: number | null;
    readonly safeMetadata?: Record<string, unknown>;
    readonly fallbackUsed: boolean;
  },
): KaelSafeTraceEvent {
  return buildProviderAttemptTrace({
    workflowPhase: "plan_price_adjust",
    actorRole: "worker",
    action: "worker.request_scope_change",
    policyId: SCOPE_CHANGE_POLICY_ID,
    purpose: "scope_change",
    provider: route.provider,
    model: route.model,
    latencyMs: options.latencyMs,
    costUsd: options.costUsd,
    result,
    code: options.code,
    fallbackUsed: options.fallbackUsed,
    confidence: options.confidence,
    safeMetadata: options.safeMetadata,
  });
}

function isScopeChangeHighStakes(
  input: ScopeChangeReviewInput | ScopeChangeComputeInput,
): boolean {
  const threshold = scopeChangeEscalationThreshold();
  if (threshold === null) return false;
  const requestedMax = "requestedPriceMax" in input
    ? input.requestedPriceMax
    : null;
  const amounts = [
    input.originalPriceMin,
    input.originalPriceMax,
    requestedMax,
  ];
  return amounts.some((amount) =>
    typeof amount === "number" && Number.isFinite(amount) && amount >= threshold
  );
}

function scopeChangeEscalationThreshold(): number | null {
  const getEnv = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno?.env?.get;
  const value = getEnv?.("KAEL_SCOPE_CHANGE_ESCALATION_VND");
  const threshold = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(threshold) && threshold > 0 ? threshold : null;
}

function buildScopeChangeEstimateFallback(
  input: ScopeChangeComputeInput,
): ScopeChangeEstimateFallback {
  return {
    schema_version: "scope_change_kael_review.v1",
    prompt_version: "scope-change-estimate.2026-05-23.v1",
    version: "scope-change-estimate.2026-05-23.v1",
    outcome: "inspection_required",
    requires_human_inspection: true,
    confidence: 0,
    problem_summary:
      "Kael chưa thể tính lại chính xác — vui lòng kiểm tra mô tả từ thợ.",
    advisory:
      "Khách nên đối chiếu phạm vi mới với phạm vi ban đầu trước khi quyết định.",
    disclaimer: PRICE_DISCLAIMER,
    provider: null,
    model: null,
    fallback_used: true,
    failure_reason: "SCOPE_ESTIMATE_UNAVAILABLE",
    computed_at: new Date().toISOString(),
    cost_usd: null,
    latency_ms: null,
    input_summary: scopeChangeInputSummary(input),
  };
}

function scopeChangeInputSummary(input: ScopeChangeComputeInput) {
  return {
    service_type: input.serviceType,
    district: input.district ?? null,
    original_problem_summary: input.originalProblemSummary ?? null,
    original_price_min: input.originalPriceMin ?? null,
    original_price_max: input.originalPriceMax ?? null,
  };
}

function buildScopeChangeFallbackReview(
  input: ScopeChangeReviewInput,
): ScopeChangeKaelReview {
  const priceAssessment: ScopeChangeReviewBody["price_assessment"] = "needs_review";
  const recommendation: ScopeChangeReviewBody["recommendation"] = "ask_worker";
  return {
    version: "scope-change-review.2026-05-20.v1",
    recommendation,
    price_assessment: priceAssessment,
    problem_summary:
      "Kael đã ghi nhận phạm vi thợ báo phát sinh tại hiện trường và sẽ quyết định dựa trên mô tả, lý do, mức giá mới, cùng bằng chứng liên quan.",
    advisory: null,
    complexity_assessment: input.originalComplexity ?? "medium",
    confidence: 0,
    provider: null,
    model: null,
    fallback_used: true,
    failure_reason: "FALLBACK_REVIEW",
    reviewed_at: new Date().toISOString(),
    cost_usd: null,
    latency_ms: null,
  };
}
