import type { EdgeAiSecrets, ScopeChangeComputeInput, ScopeChangeEstimateBody, ScopeChangeKaelEstimate, ScopeChangeKaelReview, ScopeChangeReviewBody, ScopeChangeReviewInput } from "./types.ts";
import { PRICE_DISCLAIMER, scopeChangeEstimateSchema, scopeChangeReviewSchema } from "./types.ts";
import { buildScopeChangeEstimateMessages, buildScopeChangeReviewMessages } from "./prompts.ts";
import { callAI } from "./provider-client.ts";
import { chooseCircuitAwareProviderOrNull } from "./routing.ts";
import { maxTokensForPurpose } from "./routing.config.ts";
import {
  buildNoProviderTrace,
  buildProviderAttemptTrace,
  type KaelSafeTraceEvent,
} from "./trace.ts";
export {
  calculateScopeChangeAnomaly,
  calculateScopeChangeMargin,
  matchSuspiciousScopeKeywords,
  type ScopeChangeRiskConfig,
} from "./scope-risk.ts";
import { safeParseJSON, timed } from "./utils.ts";

export const KAEL_PRICE_DISCLAIMER_V3 = PRICE_DISCLAIMER;
const SCOPE_CHANGE_POLICY_ID = "kael.autonomy.v2.scope_change_review";

export async function reviewScopeChange(
  input: ScopeChangeReviewInput,
  secrets: EdgeAiSecrets,
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
    callAI({
      purpose: "scope_change",
      provider,
      model: route.model,
      messages: buildScopeChangeReviewMessages(input),
      maxTokens: maxTokensForPurpose("scope_change", 450),
      temperature: 0.1,
      timeoutMs: route.latencyBudgetMs,
      maxRetries: 0,
    }, secrets)
  );

  if (!attempt.result.success) {
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

  const parsed = safeParseJSON(attempt.result.content);
  const validated = parsed ? scopeChangeReviewSchema.safeParse(parsed) : null;
  if (!validated?.success) {
    return {
      ...fallback,
      provider,
      model: route.model,
      failure_reason: "INVALID_SCHEMA",
      cost_usd: attempt.result.usage.costUsd,
      latency_ms: attempt.ms,
      trace: [scopeChangeProviderTrace(route, "schema_invalid", {
        code: "INVALID_SCHEMA",
        latencyMs: attempt.ms,
        costUsd: attempt.result.usage.costUsd,
        fallbackUsed: true,
      })],
    };
  }

  return {
    version: "scope-change-review.2026-05-20.v1",
    ...validated.data,
    provider,
    model: route.model,
    fallback_used: false,
    reviewed_at: new Date().toISOString(),
    cost_usd: attempt.result.usage.costUsd,
    latency_ms: attempt.ms,
    trace: [scopeChangeProviderTrace(route, "success", {
      latencyMs: attempt.ms,
      costUsd: attempt.result.usage.costUsd,
      fallbackUsed: false,
    })],
  };
}

// Kael computes new price estimate from worker's
// reported on-site scope. Worker không nhập price; Kael giữ price authority.
export async function computeScopeChangeEstimate(
  input: ScopeChangeComputeInput,
  secrets: EdgeAiSecrets,
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
    callAI({
      purpose: "scope_change",
      provider,
      model: route.model,
      messages: buildScopeChangeEstimateMessages(input),
      maxTokens: maxTokensForPurpose("scope_change", 500),
      temperature: 0.1,
      timeoutMs: route.latencyBudgetMs,
      maxRetries: 0,
    }, secrets)
  );

  if (!attempt.result.success) {
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

  const parsed = safeParseJSON(attempt.result.content);
  const validated = parsed ? scopeChangeEstimateSchema.safeParse(parsed) : null;
  if (!validated?.success) {
    return {
      ...fallback,
      provider,
      model: route.model,
      failure_reason: "INVALID_SCHEMA",
      cost_usd: attempt.result.usage.costUsd,
      latency_ms: attempt.ms,
      trace: [scopeChangeProviderTrace(route, "schema_invalid", {
        code: "INVALID_SCHEMA",
        latencyMs: attempt.ms,
        costUsd: attempt.result.usage.costUsd,
        fallbackUsed: true,
      })],
    };
  }

  return {
    schema_version: "scope_change_kael_review.v1",
    prompt_version: "scope-change-estimate.2026-05-23.v1",
    version: "scope-change-estimate.2026-05-23.v1",
    ...validated.data,
    advisory: validated.data.advisory ?? null,
    disclaimer: PRICE_DISCLAIMER,
    provider,
    model: route.model,
    fallback_used: false,
    computed_at: new Date().toISOString(),
    cost_usd: attempt.result.usage.costUsd,
    latency_ms: attempt.ms,
    trace: [scopeChangeProviderTrace(route, "success", {
      latencyMs: attempt.ms,
      costUsd: attempt.result.usage.costUsd,
      fallbackUsed: false,
    })],
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
  });
}

function buildScopeChangeEstimateFallback(
  input: ScopeChangeComputeInput,
): ScopeChangeKaelEstimate {
  const originalMax = input.originalPriceMax ?? input.originalPriceMin ?? 0;
  const fallbackMin = Math.max(
    1,
    Math.round((input.originalPriceMin ?? originalMax) * 1.2),
  );
  const fallbackMax = Math.max(
    fallbackMin,
    Math.round(originalMax * 1.5) || fallbackMin,
  );
  return {
    schema_version: "scope_change_kael_review.v1",
    prompt_version: "scope-change-estimate.2026-05-23.v1",
    version: "scope-change-estimate.2026-05-23.v1",
    complexity_assessment: "medium",
    price_min: fallbackMin,
    price_max: fallbackMax,
    confidence: 0.3,
    problem_summary:
      "Kael chưa thể tính lại chính xác — vui lòng kiểm tra mô tả từ thợ.",
    advisory:
      "Khách nên đối chiếu phạm vi mới với phạm vi ban đầu trước khi quyết định.",
    disclaimer: PRICE_DISCLAIMER,
    provider: null,
    model: null,
    fallback_used: true,
    failure_reason: "FALLBACK_ESTIMATE",
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
  const originalMax = input.originalPriceMax ?? input.originalPriceMin ?? 0;
  const requestedMax = input.requestedPriceMax;
  const increaseRatio = originalMax > 0 ? requestedMax / originalMax : 1;
  const priceAssessment: ScopeChangeReviewBody["price_assessment"] =
    increaseRatio >= 1.8
      ? "high_risk"
      : increaseRatio >= 1.25
      ? "needs_review"
      : "reasonable";
  const recommendation: ScopeChangeReviewBody["recommendation"] =
    priceAssessment === "high_risk" ? "ask_worker" : "approve";
  return {
    version: "scope-change-review.2026-05-20.v1",
    recommendation,
    price_assessment: priceAssessment,
    problem_summary:
      "Kael đã ghi nhận phạm vi thợ báo phát sinh tại hiện trường và sẽ quyết định dựa trên mô tả, lý do, mức giá mới, cùng bằng chứng liên quan.",
    advisory: null,
    complexity_assessment: priceAssessment === "reasonable" ? "medium" : "large",
    confidence: priceAssessment === "reasonable" ? 0.55 : 0.35,
    provider: null,
    model: null,
    fallback_used: true,
    failure_reason: "FALLBACK_REVIEW",
    reviewed_at: new Date().toISOString(),
    cost_usd: null,
    latency_ms: null,
  };
}
