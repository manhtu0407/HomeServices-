import { z } from "zod";
import type { ComplexityLevel, ServiceType } from "../../../_shared/domain.ts";

export type { ComplexityLevel, ServiceType };

export const PRICE_DISCLAIMER =
  "Đây là mức giá ước tính dựa trên thị trường HCMC. Giá cuối được thợ xác nhận trước khi làm.";

export const UNSUPPORTED_SERVICE_MESSAGE =
  "Chúng tôi hiện chỉ hỗ trợ sửa điện, sửa nước và vệ sinh. Vui lòng quay lại khi chúng tôi mở rộng dịch vụ.";

export const intentResultSchema = z.object({
  service_type: z.enum(["electrical", "plumbing", "cleaning", "unsupported"]),
  problem_slug: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1),
  needs_clarification: z.boolean(),
});

export const visionResultSchema = z.object({
  problem_identified: z.string().min(1).max(500),
  severity_indicators: z.array(z.string().max(200)).max(5),
  complexity_hint: z.enum(["small", "medium", "large"]),
});

export const marketPriceResultSchema = z.object({
  market_range_min: z.number().int().positive(),
  market_range_max: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  sources_summary: z.string().max(1000).optional(),
});

export const scopeChangeReviewSchema = z.object({
  recommendation: z.enum(["approve", "ask_worker", "reject"]),
  price_assessment: z.enum(["reasonable", "needs_review", "high_risk"]),
  problem_summary: z.string().min(1).max(500),
  advisory: z.string().max(400).nullable().optional(),
  complexity_assessment: z.enum(["small", "medium", "large"]),
  confidence: z.number().min(0).max(1),
});

// Phase 2.0 (2026-05-23): Kael compute new estimate from worker scope report.
// Worker không đề xuất giá ở B6; Kael compute new price range độc lập.
export const scopeChangeEstimateSchema = z.object({
  complexity_assessment: z.enum(["small", "medium", "large"]),
  price_min: z.number().int().positive(),
  price_max: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  problem_summary: z.string().min(1).max(500),
  advisory: z.string().max(400).nullable().optional(),
}).refine((data) => data.price_max >= data.price_min, {
  message: "price_max must be >= price_min",
  path: ["price_max"],
});

export const KAEL_BUSINESS_GUARDRAILS = `Kael is the main AI assistant for this home-services product.
Scope is strictly HCMC home services for exactly three service boxes: electrical repair, plumbing repair, and home cleaning.
Reject unrelated topics, adult or explicit sexual content, random image requests, or any request that is not useful for those three service boxes by classifying it as unsupported.
Home-service safety and legality questions are allowed only when they directly affect electrical, plumbing, or cleaning work.
Do not collect or repeat PII; use only sanitized job context.`;

export const KAEL_RESPONSE_STYLE = `Keep reasoning concise, friendly, and on-point.
Return the required JSON only. Any free-text field should be short Vietnamese, directly answer the job context, and include a practical safety note only when relevant.`;

export type IntentResult = z.infer<typeof intentResultSchema>;
export type VisionResult = z.infer<typeof visionResultSchema>;
export type MarketPriceResult = z.infer<typeof marketPriceResultSchema>;
export type ScopeChangeReviewBody = z.infer<typeof scopeChangeReviewSchema>;

export const KAEL_PURPOSES = [
  "intent_classification",
  "vision_analysis",
  "clarification",
  "problem_synthesis",
  "market_lookup",
  "price_synthesis",
  "advisory_generation",
  "worker_brief",
  "scope_change",
  "post_job_learning",
  "educational_response",
] as const;

export type KaelPurpose = (typeof KAEL_PURPOSES)[number];

export const PROBLEM_SLUGS_BY_SERVICE: Record<ServiceType, readonly string[]> = {
  electrical: [
    "breaker_trip",
    "electrical-general",
    "flickering_light",
    "install_device",
    "other_electrical",
    "outlet_or_switch_broken",
    "power_outage_one_room",
    "power_outage_whole_unit",
  ],
  plumbing: [
    "clogged_drain_or_sink",
    "faucet_broken",
    "install_or_replace_fixture",
    "other_plumbing",
    "pipe_leak",
    "plumbing-general",
    "toilet_flush_issue",
    "weak_water_pressure",
  ],
  cleaning: [
    "bathroom_deep_clean",
    "cleaning-general",
    "deep_cleaning",
    "kitchen_deep_clean",
    "other_cleaning",
    "post_repair_cleaning",
    "standard_home_cleaning",
    "window_cleaning",
  ],
};

export const FALLBACK_PROBLEM_SLUG_BY_SERVICE: Record<ServiceType, string> = {
  electrical: "other_electrical",
  plumbing: "other_plumbing",
  cleaning: "other_cleaning",
};

export type AIProvider = "anthropic" | "perplexity" | "deepseek";
export type AITextContent = { type: "text"; text: string };
export type AIImageContent = { type: "image"; source: { type: "url"; url: string } };
export type AIMessageContent = string | Array<AITextContent | AIImageContent>;
export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: AIMessageContent;
};
export type AIRequest = {
  purpose?: KaelPurpose;
  provider: AIProvider;
  model: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
};

export type AIResponse = {
  success: true;
  content: string;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
  latencyMs: number;
};

export type ProviderRequestSpec = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  parse(
    data: Record<string, unknown>,
    latencyMs: number,
    model: string,
  ): AIResponse;
};

export type AIError = {
  success: false;
  provider: AIProvider;
  code: string;
  error: string;
};

export type EdgeAiSecrets = {
  anthropicApiKey?: string;
  perplexityApiKey?: string;
  deepseekApiKey?: string;
  googleMapsApiKey?: string;
};

export type PipelineInput = {
  serviceType: string;
  problemChips: string[];
  description: string;
  district: string;
  photoUrls?: string[];
  progressJobId?: string;
};

export type PipelineStageLog = {
  stage: "intent" | "vision" | "baseline" | "market" | "synthesis";
  provider?: AIProvider;
  model?: string;
  latencyMs: number;
  success: boolean;
  failureReason?: string;
  fallbackUsed: boolean;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};

export type IntentAttemptLog = Omit<PipelineStageLog, "stage" | "fallbackUsed">;

export type KaelEstimate = {
  service_type: ServiceType;
  problem_category: string;
  problem_summary: string;
  complexity: ComplexityLevel;
  price_min: number;
  price_max: number;
  confidence: number;
  advisory: string | null;
  disclaimer: string;
};

export type ScopeChangeReviewInput = {
  serviceType: ServiceType;
  originalDescription: string;
  originalProblemSummary?: string | null;
  originalComplexity?: ComplexityLevel | null;
  originalPriceMin?: number | null;
  originalPriceMax?: number | null;
  requestedDescription: string;
  requestedPriceMin: number;
  requestedPriceMax: number;
  reason: string;
};

export type ScopeChangeKaelReview = ScopeChangeReviewBody & {
  version: "scope-change-review.2026-05-20.v1";
  provider: "anthropic" | null;
  model: string | null;
  fallback_used: boolean;
  failure_reason?: string;
  reviewed_at: string;
  cost_usd: number | null;
  latency_ms: number | null;
};

// Phase 2.0 (2026-05-23): input cho Kael compute new estimate khi worker báo
// scope change. Worker không gửi price; Kael compute độc lập từ original Kael
// analysis + worker's reported scope.
export type ScopeChangeComputeInput = {
  serviceType: ServiceType;
  district?: string | null;
  originalDescription: string;
  originalProblemSummary?: string | null;
  originalComplexity?: ComplexityLevel | null;
  originalPriceMin?: number | null;
  originalPriceMax?: number | null;
  workerReportedDescription: string;
  workerReason: string;
};

export type ScopeChangeEstimateBody = z.infer<typeof scopeChangeEstimateSchema>;

export type ScopeChangeKaelEstimate = ScopeChangeEstimateBody & {
  schema_version: "scope_change_kael_review.v1";
  prompt_version: "scope-change-estimate.2026-05-23.v1";
  version: "scope-change-estimate.2026-05-23.v1";
  provider: "anthropic" | null;
  model: string | null;
  fallback_used: boolean;
  failure_reason?: string;
  computed_at: string;
  cost_usd: number | null;
  latency_ms: number | null;
  disclaimer: string;
  input_summary: {
    service_type: ServiceType;
    district: string | null;
    original_problem_summary: string | null;
    original_price_min: number | null;
    original_price_max: number | null;
  };
  anti_fraud?: Record<string, unknown>;
  worker_challenge?: Record<string, unknown>;
  customer_card?: Record<string, unknown>;
};

export type PipelineResult =
  | {
    success: true;
    estimate: KaelEstimate;
    serviceProblemId: string;
    fallbackUsed: boolean;
    stageLogs: PipelineStageLog[];
  }
  | {
    success: false;
    error: string;
    code: string;
    stageLogs: PipelineStageLog[];
  };

export type SupabaseLike = {
  from(table: string): QueryBuilderLike;
};

export type QueryBuilderLike = {
  select(columns?: string, options?: unknown): QueryBuilderLike;
  eq(column: string, value: unknown): QueryBuilderLike;
  in(column: string, values: unknown[]): QueryBuilderLike;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};
