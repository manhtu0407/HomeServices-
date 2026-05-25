import { z } from "zod";
import type { ComplexityLevel, ServiceType } from "../../_shared/domain.ts";
import { sanitizeForLLM } from "../../_shared/domain.ts";

export const PRICE_DISCLAIMER =
  "Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu.";

export const UNSUPPORTED_SERVICE_MESSAGE =
  "Chúng tôi hiện chỉ hỗ trợ sửa điện, sửa nước và vệ sinh. Vui lòng quay lại khi chúng tôi mở rộng dịch vụ.";

const intentResultSchema = z.object({
  service_type: z.enum(["electrical", "plumbing", "cleaning", "unsupported"]),
  problem_slug: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1),
  needs_clarification: z.boolean(),
});

const visionResultSchema = z.object({
  problem_identified: z.string().min(1).max(500),
  severity_indicators: z.array(z.string().max(200)).max(5),
  complexity_hint: z.enum(["small", "medium", "large"]),
});

const marketPriceResultSchema = z.object({
  market_range_min: z.number().int().positive(),
  market_range_max: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  sources_summary: z.string().max(1000).optional(),
});

const scopeChangeReviewSchema = z.object({
  recommendation: z.enum(["approve", "ask_worker", "reject"]),
  price_assessment: z.enum(["reasonable", "needs_review", "high_risk"]),
  problem_summary: z.string().min(1).max(500),
  advisory: z.string().max(400).nullable().optional(),
  complexity_assessment: z.enum(["small", "medium", "large"]),
  confidence: z.number().min(0).max(1),
});

// Phase 2.0 (2026-05-23): Kael compute new estimate from worker scope report.
// Worker không đề xuất giá ở B6; Kael compute new price range độc lập.
const scopeChangeEstimateSchema = z.object({
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

const KAEL_BUSINESS_GUARDRAILS = `Kael is the main AI assistant for this home-services product.
Scope is strictly HCMC home services for exactly three service boxes: electrical repair, plumbing repair, and home cleaning.
Reject unrelated topics, adult or explicit sexual content, random image requests, or any request that is not useful for those three service boxes by classifying it as unsupported.
Home-service safety and legality questions are allowed only when they directly affect electrical, plumbing, or cleaning work.
Do not collect or repeat PII; use only sanitized job context.`;

const KAEL_RESPONSE_STYLE = `Keep reasoning concise, friendly, and on-point.
Return the required JSON only. Any free-text field should be short Vietnamese, directly answer the job context, and include a practical safety note only when relevant.`;

type IntentResult = z.infer<typeof intentResultSchema>;
type VisionResult = z.infer<typeof visionResultSchema>;
type MarketPriceResult = z.infer<typeof marketPriceResultSchema>;
type ScopeChangeReviewBody = z.infer<typeof scopeChangeReviewSchema>;

const PROBLEM_SLUGS_BY_SERVICE: Record<ServiceType, readonly string[]> = {
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

const FALLBACK_PROBLEM_SLUG_BY_SERVICE: Record<ServiceType, string> = {
  electrical: "other_electrical",
  plumbing: "other_plumbing",
  cleaning: "other_cleaning",
};

type AIProvider = "anthropic" | "perplexity" | "deepseek";
type AITextContent = { type: "text"; text: string };
type AIImageContent = { type: "image"; source: { type: "url"; url: string } };
type AIMessageContent = string | Array<AITextContent | AIImageContent>;
type AIMessage = {
  role: "system" | "user" | "assistant";
  content: AIMessageContent;
};
type AIRequest = {
  provider: AIProvider;
  model: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
};

type AIResponse = {
  success: true;
  content: string;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
  latencyMs: number;
};

type ProviderRequestSpec = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  parse(
    data: Record<string, unknown>,
    latencyMs: number,
    model: string,
  ): AIResponse;
};

type AIError = {
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

type IntentAttemptLog = Omit<PipelineStageLog, "stage" | "fallbackUsed">;

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

type ScopeChangeEstimateBody = z.infer<typeof scopeChangeEstimateSchema>;

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

export async function reviewScopeChange(
  input: ScopeChangeReviewInput,
  secrets: EdgeAiSecrets,
): Promise<ScopeChangeKaelReview> {
  const fallback = buildScopeChangeFallbackReview(input);
  const attempt = await timed(() =>
    callAI({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      messages: buildScopeChangeReviewMessages(input),
      maxTokens: 450,
      temperature: 0.1,
    }, secrets)
  );

  if (!attempt.result.success) {
    return {
      ...fallback,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      failure_reason: attempt.result.code,
      latency_ms: attempt.ms,
    };
  }

  const parsed = safeParseJSON(attempt.result.content);
  const validated = parsed ? scopeChangeReviewSchema.safeParse(parsed) : null;
  if (!validated?.success) {
    return {
      ...fallback,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      failure_reason: "INVALID_SCHEMA",
      cost_usd: attempt.result.usage.costUsd,
      latency_ms: attempt.ms,
    };
  }

  return {
    version: "scope-change-review.2026-05-20.v1",
    ...validated.data,
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    fallback_used: false,
    reviewed_at: new Date().toISOString(),
    cost_usd: attempt.result.usage.costUsd,
    latency_ms: attempt.ms,
  };
}

// Phase 2.0 (2026-05-23): Kael computes new price estimate from worker's
// reported on-site scope. Worker không nhập price; Kael giữ price authority.
export async function computeScopeChangeEstimate(
  input: ScopeChangeComputeInput,
  secrets: EdgeAiSecrets,
): Promise<ScopeChangeKaelEstimate> {
  const fallback = buildScopeChangeEstimateFallback(input);
  const attempt = await timed(() =>
    callAI({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      messages: buildScopeChangeEstimateMessages(input),
      maxTokens: 500,
      temperature: 0.1,
    }, secrets)
  );

  if (!attempt.result.success) {
    return {
      ...fallback,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      failure_reason: attempt.result.code,
      latency_ms: attempt.ms,
    };
  }

  const parsed = safeParseJSON(attempt.result.content);
  const validated = parsed ? scopeChangeEstimateSchema.safeParse(parsed) : null;
  if (!validated?.success) {
    return {
      ...fallback,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      failure_reason: "INVALID_SCHEMA",
      cost_usd: attempt.result.usage.costUsd,
      latency_ms: attempt.ms,
    };
  }

  return {
    schema_version: "scope_change_kael_review.v1",
    prompt_version: "scope-change-estimate.2026-05-23.v1",
    version: "scope-change-estimate.2026-05-23.v1",
    ...validated.data,
    advisory: validated.data.advisory ?? null,
    disclaimer: PRICE_DISCLAIMER,
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    fallback_used: false,
    computed_at: new Date().toISOString(),
    cost_usd: attempt.result.usage.costUsd,
    latency_ms: attempt.ms,
    input_summary: scopeChangeInputSummary(input),
  };
}

function buildScopeChangeEstimateMessages(
  input: ScopeChangeComputeInput,
): AIMessage[] {
  const originalRange = formatReviewPriceRange(
    input.originalPriceMin,
    input.originalPriceMax,
  );
  return [
    {
      role: "system",
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You compute an updated price estimate for a Vietnamese HCMC home-services job
after the worker reports a different on-site scope.
The worker does NOT propose a price; you compute it independently using the
original Kael analysis and the worker's reported scope description + reason.
Do not include PII, full addresses, phone numbers, or raw worker/customer text.
Prices must be VND integers reasonable for HCMC apartment electrical / plumbing
/ cleaning work. Confidence below 0.4 if evidence is weak.

Respond ONLY with valid JSON matching this schema:
{
  "complexity_assessment": "small" | "medium" | "large",
  "price_min": number (VND integer),
  "price_max": number (VND integer, >= price_min),
  "confidence": number (0-1),
  "problem_summary": "short Vietnamese summary of updated problem",
  "advisory": "optional short Vietnamese practical note or null"
}`,
    },
    {
      role: "user",
      content: `Service: ${sanitizeForLLM(input.serviceType)}
District: ${sanitizeForLLM(input.district ?? "unknown")}
Original description: ${scrubSensitiveForLLM(input.originalDescription)}
Original Kael summary: ${scrubSensitiveForLLM(input.originalProblemSummary ?? "")}
Original complexity: ${sanitizeForLLM(input.originalComplexity ?? "unknown")}
Original price range: ${originalRange}
Worker reported scope: ${scrubSensitiveForLLM(input.workerReportedDescription)}
Worker reason: ${scrubSensitiveForLLM(input.workerReason)}`,
    },
  ];
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

export async function runKaelPipeline(
  input: PipelineInput,
  supabase: SupabaseLike,
  secrets: EdgeAiSecrets,
): Promise<PipelineResult> {
  const { serviceType, district } = input;
  const problemChips = input.problemChips.map(scrubSensitiveForLLM);
  const description = scrubSensitiveForLLM(input.description);
  const photoUrls = sanitizeVisionPhotoUrls(input.photoUrls ?? []);
  const stageLogs: PipelineStageLog[] = [];
  let fallbackUsed = false;

  const intentStage = await classifyIntent(
    serviceType,
    problemChips,
    description,
    secrets,
  );
  const intent = intentStage.success
    ? intentStage.intent
    : intentStage.fallback;
  fallbackUsed ||= !intentStage.success;
  intentStage.attempts.forEach((attempt, index) => {
    stageLogs.push({
      stage: "intent",
      ...attempt,
      fallbackUsed: !intentStage.success &&
        index === intentStage.attempts.length - 1,
    });
  });

  if (intent.service_type === "unsupported") {
    return {
      success: false,
      error: UNSUPPORTED_SERVICE_MESSAGE,
      code: "UNSUPPORTED",
      stageLogs,
    };
  }

  const validServiceType = intent.service_type;
  const normalizedProblem = normalizeProblemSlugForService(
    validServiceType,
    intent.problem_slug,
  );
  const problemSlug = normalizedProblem.slug;
  fallbackUsed ||= normalizedProblem.normalized;
  const visionStage = await timed(() =>
    analyzeDescription(
      description,
      `${validServiceType}: ${problemSlug}`,
      photoUrls,
      secrets,
    )
  );
  const analysis = visionStage.result.success
    ? visionStage.result.analysis
    : visionStage.result.fallback;
  fallbackUsed ||= !visionStage.result.success;
  stageLogs.push({
    stage: "vision",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    latencyMs: visionStage.ms,
    success: visionStage.result.success,
    failureReason: visionStage.result.success
      ? undefined
      : visionStage.result.failureReason,
    fallbackUsed: !visionStage.result.success,
  });

  const baselineStage = await timed(() =>
    fetchBaseline(
      supabase,
      validServiceType,
      problemSlug,
      analysis.complexity_hint,
      district,
    )
  );
  stageLogs.push({
    stage: "baseline",
    latencyMs: baselineStage.ms,
    success: baselineStage.result.success,
    failureReason: baselineStage.result.success
      ? undefined
      : baselineStage.result.error,
    fallbackUsed: false,
  });

  if (!baselineStage.result.success) {
    return {
      success: false,
      error:
        "Không có dữ liệu giá tham khảo cho dịch vụ này. Vui lòng thử lại sau.",
      code: "NO_BASELINE",
      stageLogs,
    };
  }

  const marketStage = await timed(() =>
    searchMarketPrice(
      validServiceType,
      problemSlug,
      analysis.complexity_hint,
      district,
      secrets,
    )
  );
  fallbackUsed ||= !marketStage.result.success;
  stageLogs.push({
    stage: "market",
    provider: "perplexity",
    model: "sonar",
    latencyMs: marketStage.ms,
    success: marketStage.result.success,
    failureReason: marketStage.result.success
      ? undefined
      : marketStage.result.failureReason,
    fallbackUsed: !marketStage.result.success,
  });

  const synthStart = Date.now();
  const synthesized = synthesizePrice({
    baselineMin: baselineStage.result.priceMin,
    baselineMax: baselineStage.result.priceMax,
    market: marketStage.result.success ? marketStage.result.market : null,
    complexityHint: analysis.complexity_hint,
  });
  stageLogs.push({
    stage: "synthesis",
    latencyMs: Date.now() - synthStart,
    success: true,
    fallbackUsed: false,
  });

  return {
    success: true,
    fallbackUsed,
    stageLogs,
    serviceProblemId: baselineStage.result.serviceProblemId,
    estimate: {
      service_type: validServiceType,
      problem_category: problemSlug,
      problem_summary: analysis.problem_identified,
      complexity: analysis.complexity_hint,
      price_min: synthesized.price_min,
      price_max: synthesized.price_max,
      confidence: synthesized.confidence,
      advisory: buildAdvisory(analysis.severity_indicators),
      disclaimer: PRICE_DISCLAIMER,
    },
  };
}

function normalizeProblemSlugForService(
  serviceType: ServiceType,
  problemSlug: string,
): { slug: string; normalized: boolean } {
  const allowed = PROBLEM_SLUGS_BY_SERVICE[serviceType];
  const trimmed = problemSlug.trim();
  const variants = [
    trimmed,
    trimmed.toLowerCase(),
    trimmed.toLowerCase().replace(/\s+/g, "_"),
  ];
  const match = variants.find((variant) => allowed.includes(variant));
  if (match) return { slug: match, normalized: match !== problemSlug };
  return {
    slug: FALLBACK_PROBLEM_SLUG_BY_SERVICE[serviceType],
    normalized: true,
  };
}

async function classifyIntent(
  serviceType: string,
  problemChips: string[],
  description: string,
  secrets: EdgeAiSecrets,
): Promise<
  | { success: true; intent: IntentResult; attempts: IntentAttemptLog[] }
  | {
    success: false;
    fallback: IntentResult;
    failureReason: string;
    attempts: IntentAttemptLog[];
  }
> {
  const messages = buildIntentMessages(
    sanitizeForLLM(serviceType),
    problemChips.map(sanitizeForLLM),
    description,
  );
  const attempts: IntentAttemptLog[] = [];

  for (
    const candidate of [
      { provider: "deepseek" as const, model: "deepseek-v4-flash" },
      { provider: "anthropic" as const, model: "claude-sonnet-4-6" },
    ]
  ) {
    const attempt = await classifyIntentWithProvider(
      candidate.provider,
      candidate.model,
      messages,
      secrets,
    );
    attempts.push(attempt.log);
    if (attempt.success) {
      return { success: true, intent: attempt.intent, attempts };
    }
  }

  return {
    success: false,
    fallback: buildFallbackIntent(serviceType, problemChips, description),
    failureReason: attempts.map((attempt) =>
      `${attempt.provider ?? "unknown"}:${attempt.failureReason ?? "failed"}`
    ).join("; "),
    attempts,
  };
}

async function classifyIntentWithProvider(
  provider: AIProvider,
  model: string,
  messages: AIMessage[],
  secrets: EdgeAiSecrets,
): Promise<
  | { success: true; intent: IntentResult; log: IntentAttemptLog }
  | { success: false; log: IntentAttemptLog }
> {
  const attempt = await timed(() =>
    callAI({
      provider,
      model,
      messages,
      maxTokens: 200,
      temperature: 0.1,
    }, secrets)
  );
  const baseLog = {
    provider,
    model,
    latencyMs: attempt.ms,
  };

  if (!attempt.result.success) {
    return {
      success: false,
      log: {
        ...baseLog,
        success: false,
        failureReason: `AI call failed: ${attempt.result.code}`,
      },
    };
  }

  const parsed = safeParseJSON(attempt.result.content);
  const validated = parsed ? intentResultSchema.safeParse(parsed) : null;
  if (!validated?.success) {
    return {
      success: false,
      log: {
        ...baseLog,
        success: false,
        failureReason: "AI intent JSON validation failed",
        inputTokens: attempt.result.usage.inputTokens,
        outputTokens: attempt.result.usage.outputTokens,
        costUsd: attempt.result.usage.costUsd,
      },
    };
  }

  return {
    success: true,
    intent: validated.data,
    log: {
      ...baseLog,
      success: true,
      inputTokens: attempt.result.usage.inputTokens,
      outputTokens: attempt.result.usage.outputTokens,
      costUsd: attempt.result.usage.costUsd,
    },
  };
}

async function analyzeDescription(
  description: string,
  intentContext: string,
  photoUrls: string[],
  secrets: EdgeAiSecrets,
): Promise<
  | { success: true; analysis: VisionResult }
  | { success: false; fallback: VisionResult; failureReason: string }
> {
  const result = await callAI({
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    messages: buildVisionMessages(
      description,
      sanitizeForLLM(intentContext),
      photoUrls,
    ),
    maxTokens: 500,
    temperature: 0.2,
  }, secrets);

  if (!result.success) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
      failureReason: `AI call failed: ${result.code}`,
    };
  }

  const parsed = safeParseJSON(result.content);
  const validated = parsed ? visionResultSchema.safeParse(parsed) : null;
  if (!validated?.success) {
    return {
      success: false,
      fallback: buildFallbackVision(intentContext),
      failureReason: "AI vision JSON validation failed",
    };
  }

  return { success: true, analysis: validated.data };
}

async function searchMarketPrice(
  serviceType: ServiceType,
  problem: string,
  complexity: ComplexityLevel,
  district: string,
  secrets: EdgeAiSecrets,
): Promise<
  { success: true; market: MarketPriceResult } | {
    success: false;
    failureReason: string;
  }
> {
  const result = await callAI({
    provider: "perplexity",
    model: "sonar",
    messages: buildPricingMessages(serviceType, problem, complexity, district),
    maxTokens: 300,
    temperature: 0.1,
  }, secrets);

  if (!result.success) {
    return { success: false, failureReason: `AI call failed: ${result.code}` };
  }

  const parsed = safeParseJSON(result.content);
  const validated = parsed ? marketPriceResultSchema.safeParse(parsed) : null;
  if (!validated?.success) {
    return {
      success: false,
      failureReason: "AI market JSON validation failed",
    };
  }
  if (validated.data.market_range_max < validated.data.market_range_min) {
    return {
      success: false,
      failureReason: "market_range_max < market_range_min",
    };
  }
  return { success: true, market: validated.data };
}

async function callAI(
  request: AIRequest,
  secrets: EdgeAiSecrets,
): Promise<AIResponse | AIError> {
  const apiKey = providerKey(request.provider, secrets);
  if (!apiKey) {
    return {
      success: false,
      provider: request.provider,
      code: "KEY_MISSING",
      error: "provider key missing",
    };
  }

  const timeout = request.provider === "anthropic"
    ? 20_000
    : request.provider === "perplexity"
    ? 15_000
    : 10_000;
  let lastError: unknown;
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
      console.warn("AI retry", {
        provider: request.provider,
        model: request.model,
        attempt,
        backoffMs: delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const controller = new AbortController();
    try {
      const response = await withTimeout(
        callProvider(request, apiKey, controller.signal),
        timeout,
        controller,
      );
      console.info("AI call success", {
        provider: request.provider,
        model: request.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: response.usage.costUsd.toFixed(6),
        latencyMs: response.latencyMs,
      });
      return response;
    } catch (err) {
      lastError = err;
      if (!isRetryableProviderError(err) || attempt === 2) break;
    }
  }

  const code = lastError instanceof ProviderHttpError
    ? `HTTP_${lastError.status}`
    : "AI_CALL_FAILED";
  console.error("AI call failed", {
    provider: request.provider,
    model: request.model,
    code,
    retriesExhausted: true,
  });
  return {
    success: false,
    provider: request.provider,
    code,
    error: code,
  };
}

async function callProvider(
  request: AIRequest,
  apiKey: string,
  signal: AbortSignal,
): Promise<AIResponse> {
  const start = Date.now();
  const { url, headers, body, parse } = providerRequest(request, apiKey);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const text = await response.text();
    throw new ProviderHttpError(response.status, text);
  }

  return parse(await response.json(), latencyMs, request.model);
}

function providerRequest(
  request: AIRequest,
  apiKey: string,
): ProviderRequestSpec {
  if (request.provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: request.model,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
        messages: request.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
        system: aiMessageContentToText(
          request.messages.find((m) => m.role === "system")?.content,
        ),
      },
      parse: (
        data: Record<string, unknown>,
        latencyMs: number,
        model: string,
      ) => {
        const content = getPath<string>(data, ["content", 0, "text"]) ?? "";
        const inputTokens = getPath<number>(data, ["usage", "input_tokens"]) ??
          0;
        const outputTokens =
          getPath<number>(data, ["usage", "output_tokens"]) ?? 0;
        const isHaiku = model.includes("haiku");
        const costUsd = inputTokens * ((isHaiku ? 0.25 : 3) / 1_000_000) +
          outputTokens * ((isHaiku ? 1.25 : 15) / 1_000_000);
        return {
          success: true as const,
          content,
          usage: { inputTokens, outputTokens, costUsd },
          latencyMs,
        };
      },
    };
  }

  const openAiCompatibleUrl = request.provider === "perplexity"
    ? "https://api.perplexity.ai/v1/sonar"
    : "https://api.deepseek.com/chat/completions";
  return {
    url: openAiCompatibleUrl,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.2,
      ...(request.provider === "deepseek"
        ? {
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
        }
        : {}),
      messages: request.messages.map((m) => ({
        role: m.role,
        content: aiMessageContentToText(m.content),
      })),
    },
    parse: (data: Record<string, unknown>, latencyMs: number) => {
      const content =
        getPath<string>(data, ["choices", 0, "message", "content"]) ?? "";
      const inputTokens = getPath<number>(data, ["usage", "prompt_tokens"]) ??
        0;
      const outputTokens =
        getPath<number>(data, ["usage", "completion_tokens"]) ?? 0;
      const costUsd = request.provider === "deepseek"
        ? inputTokens * (0.14 / 1_000_000) + outputTokens * (0.28 / 1_000_000)
        : inputTokens * (1 / 1_000_000) + outputTokens * (1 / 1_000_000);
      return {
        success: true as const,
        content,
        usage: { inputTokens, outputTokens, costUsd },
        latencyMs,
      };
    },
  };
}

function providerKey(
  provider: AIProvider,
  secrets: EdgeAiSecrets,
): string | undefined {
  if (provider === "anthropic") return secrets.anthropicApiKey;
  if (provider === "perplexity") return secrets.perplexityApiKey;
  return secrets.deepseekApiKey;
}

function aiMessageContentToText(content: AIMessageContent | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((block): block is AITextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function sanitizeVisionPhotoUrls(photoUrls: string[]): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const rawUrl of photoUrls) {
    const url = sanitizeForLLM(rawUrl).trim();
    if (seen.has(url) || !isHttpUrl(url)) continue;
    seen.add(url);
    sanitized.push(url);
    if (sanitized.length >= 5) break;
  }
  return sanitized;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function synthesizePrice(input: {
  baselineMin: number;
  baselineMax: number;
  market: MarketPriceResult | null;
  complexityHint: ComplexityLevel;
}): { price_min: number; price_max: number; confidence: number } {
  if (!input.market) {
    return {
      price_min: input.baselineMin,
      price_max: input.baselineMax,
      confidence: 0.4,
    };
  }

  const complexityMultiplier = input.complexityHint === "large"
    ? 1.2
    : input.complexityHint === "small"
    ? 0.85
    : 1;
  let priceMin = Math.round(
    (input.market.market_range_min * 0.6 + input.baselineMin * 0.4) *
      complexityMultiplier,
  );
  let priceMax = Math.round(
    (input.market.market_range_max * 0.6 + input.baselineMax * 0.4) *
      complexityMultiplier,
  );

  priceMin = Math.round(priceMin / 1000) * 1000;
  priceMax = Math.round(priceMax / 1000) * 1000;
  if (priceMax <= priceMin) priceMax = priceMin + 50_000;
  return {
    price_min: priceMin,
    price_max: priceMax,
    confidence:
      Math.round(Math.min(0.85, (input.market.confidence + 0.5) / 2) * 100) /
      100,
  };
}

async function fetchBaseline(
  supabase: SupabaseLike,
  serviceType: ServiceType,
  problemSlug: string,
  complexity: ComplexityLevel,
  district: string,
): Promise<
  {
    success: true;
    priceMin: number;
    priceMax: number;
    serviceProblemId: string;
  } | {
    success: false;
    error: string;
  }
> {
  const districts = district === "hcmc_all"
    ? ["hcmc_all"]
    : [district, "hcmc_all"];
  const { data: problems, error: problemError } = await withDbTimeout<
    {
      data: Array<Record<string, unknown>> | null;
      error: { code?: string; message?: string } | null;
    }
  >(
    supabase
      .from("service_problems")
      .select("id")
      .eq("service_type", serviceType)
      .eq("slug", problemSlug) as PromiseLike<
        {
          data: Array<Record<string, unknown>> | null;
          error: { code?: string; message?: string } | null;
        }
      >,
  );
  if (problemError) {
    console.warn("Baseline problem lookup failed", {
      serviceType,
      problemSlug,
      errorCode: problemError.code,
    });
    return { success: false, error: "baseline problem lookup failed" };
  }
  const problemId = problems?.[0]?.id;
  if (typeof problemId !== "string" || problemId.length === 0) {
    return { success: false, error: "no service problem" };
  }

  const { data, error } = await withDbTimeout<
    {
      data: Array<Record<string, unknown>> | null;
      error: { code?: string; message?: string } | null;
    }
  >(
    supabase
      .from("price_baselines")
      .select("price_min, price_max, district_code")
      .eq("service_problem_id", problemId)
      .eq("service_type", serviceType)
      .eq("complexity", complexity)
      .in("district_code", districts) as PromiseLike<
        {
          data: Array<Record<string, unknown>> | null;
          error: { code?: string; message?: string } | null;
        }
      >,
  );

  if (error) {
    console.warn("Baseline query failed", {
      serviceType,
      complexity,
      district,
      errorCode: error.code,
    });
    return { success: false, error: "baseline query failed" };
  }
  if (!data || data.length === 0) {
    return { success: false, error: "no baseline" };
  }
  const exact = data.find((row) => row.district_code === district);
  const citywide = data.find((row) => row.district_code === "hcmc_all");
  const chosen = exact ?? citywide;
  if (!chosen) return { success: false, error: "no matching baseline" };
  const priceMin = positiveNumberFrom(chosen.price_min);
  const priceMax = positiveNumberFrom(chosen.price_max);
  if (priceMin === null || priceMax === null || priceMax < priceMin) {
    console.warn("Baseline row failed price validation", {
      serviceType,
      complexity,
      district,
    });
    return { success: false, error: "invalid baseline" };
  }
  return {
    success: true,
    priceMin,
    priceMax,
    serviceProblemId: problemId,
  };
}

function buildFallbackIntent(
  serviceType: string,
  problemChips: string[],
  description: string,
): IntentResult {
  if (hasUnsupportedRepairIntent(description)) {
    return {
      service_type: "unsupported",
      problem_slug: "unsupported",
      confidence: 0.2,
      needs_clarification: false,
    };
  }

  const validServiceType =
    serviceType === "electrical" || serviceType === "plumbing" ||
      serviceType === "cleaning"
      ? serviceType
      : "unsupported";
  const slugMap: Record<string, string> = {
    "Mất điện một phòng": "power_outage_one_room",
    "Mất điện toàn căn": "power_outage_whole_unit",
    "Ổ cắm/công tắc hỏng": "outlet_or_switch_broken",
    "Cầu dao trip": "breaker_trip",
    "Đèn chập chờn": "flickering_light",
    "Lắp thêm thiết bị": "install_device",
    "Ống rò rỉ": "pipe_leak",
    "Tắc cống/bồn": "clogged_drain_or_sink",
    "Vòi hỏng": "faucet_broken",
    "Toilet không xả": "toilet_flush_issue",
    "Áp nước yếu": "weak_water_pressure",
    "Lắp/thay thiết bị": "install_or_replace_fixture",
    "Dọn dẹp nhà": "standard_home_cleaning",
    "Vệ sinh bếp": "kitchen_deep_clean",
    "Vệ sinh phòng tắm": "bathroom_deep_clean",
    "Tổng vệ sinh": "deep_cleaning",
    "Dọn sau sửa chữa": "post_repair_cleaning",
    "Vệ sinh cửa kính": "window_cleaning",
  };
  const firstChip = problemChips[0] ?? "";
  const slug = slugMap[firstChip] ??
    (validServiceType === "electrical"
      ? "other_electrical"
      : validServiceType === "plumbing"
      ? "other_plumbing"
      : validServiceType === "cleaning"
      ? "other_cleaning"
      : "unsupported");
  return {
    service_type: validServiceType,
    problem_slug: slug,
    confidence: 0.3,
    needs_clarification: false,
  };
}

function buildFallbackVision(intentContext: string): VisionResult {
  return {
    problem_identified: intentContext || "Vấn đề cần kiểm tra trực tiếp",
    severity_indicators: [],
    complexity_hint: "medium",
  };
}

function buildIntentMessages(
  serviceType: string,
  problemChips: string[],
  description: string,
): AIMessage[] {
  return [
    {
      role: "system",
      content:
        `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You are an intent classifier for a home service platform in Ho Chi Minh City.
Supported services: electrical, plumbing, cleaning. Nothing else.
If the request is not about electrical repair, plumbing repair, or home cleaning, classify as "unsupported".
Allowed electrical problem_slug values: ${
          PROBLEM_SLUGS_BY_SERVICE.electrical.join(", ")
        }.
Allowed plumbing problem_slug values: ${
          PROBLEM_SLUGS_BY_SERVICE.plumbing.join(", ")
        }.
Allowed cleaning problem_slug values: ${
          PROBLEM_SLUGS_BY_SERVICE.cleaning.join(", ")
        }.
If the exact problem is unclear, use other_electrical, other_plumbing, or other_cleaning for the chosen service.
Respond only with valid JSON for: service_type, problem_slug, confidence, needs_clarification.`,
    },
    {
      role: "user",
      content: `Service: ${serviceType}
Problem chips: ${problemChips.join(", ")}
Description: ${description}`,
    },
  ];
}

function buildVisionMessages(
  description: string,
  intentContext: string,
  photoUrls: string[] = [],
): AIMessage[] {
  const textContent =
    `Intent context: ${intentContext}\nCustomer description: ${description}`;
  const imageBlocks = sanitizeVisionPhotoUrls(photoUrls).map((
    url,
  ): AIImageContent => ({
    type: "image",
    source: { type: "url", url },
  }));

  return [
    {
      role: "system",
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

Analyze a Ho Chi Minh City apartment electrical, plumbing, or cleaning issue.
Respond only with valid JSON: problem_identified, severity_indicators, complexity_hint.
problem_identified must be Vietnamese. complexity_hint is small, medium, or large.`,
    },
    {
      role: "user",
      content: imageBlocks.length > 0
        ? [{ type: "text", text: textContent }, ...imageBlocks]
        : textContent,
    },
  ];
}

function buildPricingMessages(
  serviceType: ServiceType,
  problem: string,
  complexity: ComplexityLevel,
  district: string,
): AIMessage[] {
  return [
    {
      role: "system",
      content:
        `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

Research current market prices for HCMC apartment electrical repair, plumbing repair, or home cleaning.
Respond only with valid JSON: market_range_min, market_range_max, confidence, sources_summary.
Prices must be VND integers. If weak evidence, use conservative estimates with confidence below 0.5.`,
    },
    {
      role: "user",
      content: `Service: ${serviceType}
Problem: ${problem}
Complexity: ${complexity}
District: ${district}
Location: Ho Chi Minh City, Vietnam`,
    },
  ];
}

function buildScopeChangeReviewMessages(
  input: ScopeChangeReviewInput,
): AIMessage[] {
  const originalPrice = formatReviewPriceRange(
    input.originalPriceMin,
    input.originalPriceMax,
  );
  const requestedPrice = formatReviewPriceRange(
    input.requestedPriceMin,
    input.requestedPriceMax,
  );
  return [
    {
      role: "system",
      content: `${KAEL_BUSINESS_GUARDRAILS}
${KAEL_RESPONSE_STYLE}

You review worker scope-change requests for a Vietnamese home-services workflow.
Compare the original Kael estimate with the worker's new on-site scope and explain the decision support for the customer.
Do not approve work yourself; the customer must decide.
Do not include PII, full addresses, phone numbers, or raw worker/customer text.

Respond ONLY with valid JSON matching this schema:
{
  "recommendation": "approve" | "ask_worker" | "reject",
  "price_assessment": "reasonable" | "needs_review" | "high_risk",
  "problem_summary": "short Vietnamese summary of updated problem",
  "advisory": "optional short Vietnamese practical note or null",
  "complexity_assessment": "small" | "medium" | "large",
  "confidence": number (0-1)
}`,
    },
    {
      role: "user",
      content: `Service: ${sanitizeForLLM(input.serviceType)}
Original description: ${scrubSensitiveForLLM(input.originalDescription)}
Original Kael summary: ${scrubSensitiveForLLM(input.originalProblemSummary ?? "")}
Original complexity: ${sanitizeForLLM(input.originalComplexity ?? "unknown")}
Original price range: ${originalPrice}
Worker requested scope: ${scrubSensitiveForLLM(input.requestedDescription)}
Worker reason: ${scrubSensitiveForLLM(input.reason)}
Worker requested price range: ${requestedPrice}`,
    },
  ];
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
  const riskNotes = priceAssessment === "reasonable"
    ? ["Khách vẫn cần xác nhận giá mới trước khi thợ tiếp tục."]
    : [
      "Giá mới tăng so với ước tính ban đầu.",
      "Nên yêu cầu thợ giải thích rõ phần phát sinh trước khi duyệt.",
    ];
  void riskNotes;
  return {
    version: "scope-change-review.2026-05-20.v1",
    recommendation,
    price_assessment: priceAssessment,
    problem_summary:
      "Kael đã ghi nhận phạm vi thợ báo phát sinh tại hiện trường. Vui lòng xem mô tả, lý do và mức giá mới trước khi quyết định.",
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

function formatReviewPriceRange(
  priceMin: number | null | undefined,
  priceMax: number | null | undefined,
): string {
  if (!priceMin || !priceMax) return "unknown";
  return `${Math.round(priceMin)}-${Math.round(priceMax)} VND`;
}

function buildAdvisory(indicators: string[]): string | null {
  const joined = indicators.join(" ").toLowerCase();
  if (!joined) return null;
  if (/(cháy|khét|burn|smell|rò điện|giật|ngập|vỡ|tràn|nóng)/i.test(joined)) {
    return "Nếu có mùi khét, rò điện, nước tràn hoặc dấu hiệu nguy hiểm, hãy ngắt nguồn/khóa nước và chờ thợ kiểm tra trực tiếp.";
  }
  return null;
}

function scrubSensitiveForLLM(input: string): string {
  return sanitizeForLLM(input)
    .replace(/\b0\d{8,10}\b/g, "[phone]")
    .replace(/\b\+?84\d{8,10}\b/g, "[phone]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{9,12}\b/g, "[id-number]")
    .replace(/\b\d{8}\b/g, "[bank-account]")
    .replace(/\b\d{13,15}\b/g, "[bank-account]")
    .replace(
      /\b(?:Vinhomes|Vincom|Masteri|Saigon Pearl|Saigon Royal|Saigon South|Sun Avenue|Sun Village|Sunwah|Estella|Lexington|Diamond Island|Empire City|Eco Green|Phu My Hung|Phú Mỹ Hưng|Hoang Anh Gia Lai|Hoàng Anh Gia Lai|Riviera Point|Vista Verde|Era Town|The Manor|Lancaster|City Garden|Lavila|Centana|Topaz|Jamila|Akari|Sunrise City|Botanica|Pearl Plaza|Landmark|The Sun|Citadines|Lumière|Lumiere)(?:\s+(?!tầng|tang|lầu|lau|căn|can|phòng|phong|block|toà|tòa|toa|số|so|STK|TK)[A-Za-zÀ-ỹ][\wÀ-ỹ.]*){0,2}/gi,
      "[building]",
    )
    .replace(/\b(?:tầng|tang|lầu|lau)\s*\d{1,3}\b/gi, "[floor]")
    .replace(
      /\b(?:căn(?:\s+hộ)?|can(?:\s+ho)?|phòng|phong|block|toà|tòa|toa)\s+[A-Za-z0-9.\-_/]+/gi,
      "[unit]",
    )
    .replace(/\b(?:số|so)\s+\d+[A-Za-z]?\b/gi, "[house-no]");
}

function hasUnsupportedRepairIntent(input: string): boolean {
  const normalized = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return [
    "dieu hoa",
    "may lanh",
    "tu lanh",
    "may giat",
    "internet",
    "sua khoa",
    "son nha",
  ].some((keyword) => normalized.includes(keyword));
}

function safeParseJSON(content: string): unknown | null {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(content.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  controller: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof ProviderHttpError) {
    return error.status === 429 || error.status >= 500;
  }
  return error instanceof Error && error.message.includes("Timeout");
}

class ProviderHttpError extends Error {
  constructor(public readonly status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 160)}`);
  }
}

function getPath<T>(obj: unknown, path: Array<string | number>): T | undefined {
  let current = obj;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
    } else {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
  }
  return current as T | undefined;
}

function positiveNumberFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export type SupabaseLike = {
  from(table: string): QueryBuilderLike;
};

type QueryBuilderLike = {
  select(columns?: string, options?: unknown): QueryBuilderLike;
  eq(column: string, value: unknown): QueryBuilderLike;
  in(column: string, values: unknown[]): QueryBuilderLike;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

async function withDbTimeout<T>(
  promise: PromiseLike<T>,
  ms = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DB timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
