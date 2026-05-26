import type { ComplexityLevel, EdgeAiSecrets, PipelineInput, PipelineResult, PipelineStageLog, SupabaseLike } from "./types.ts";
import { PRICE_DISCLAIMER, UNSUPPORTED_SERVICE_MESSAGE } from "./types.ts";
import { classifyIntent, buildFallbackIntent } from "./intent.ts";
import { analyzeDescription } from "./vision.ts";
import { marketLookupTelemetry, searchMarketPrice } from "./market.ts";
import { fetchBaselineCandidates, normalizeProblemSlugForService, pickBaselineCandidate, synthesizePrice } from "./synthesis.ts";
import { buildAdvisory } from "./advisory.ts";
import { KAEL_ROUTING_CONFIG } from "./routing.config.ts";
import { runKaelParallel, runKaelPurposeStage } from "./orchestrator.ts";
import { updateKaelProgress } from "./streaming.ts";
import { sanitizeVisionPhotoUrls, scrubSensitiveForLLM } from "./utils.ts";

type EstimateParallelValue =
  | { kind: "vision"; result: Awaited<ReturnType<typeof analyzeDescription>> }
  | { kind: "market"; result: Awaited<ReturnType<typeof searchMarketPrice>> }
  | {
    kind: "baseline";
    result: Awaited<ReturnType<typeof fetchBaselineCandidates>>;
  };

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

  await updateKaelProgress(supabase, input.progressJobId, {
    stage: "intent_classification",
    status: "running",
    progress: 0.1,
  });
  const intentRun = await runKaelPurposeStage({
    label: "intent",
    purpose: "intent_classification",
    timeoutMs: KAEL_ROUTING_CONFIG.intent_classification.latencyBudgetMs,
    run: () => classifyIntent(serviceType, problemChips, description, secrets),
    fallback: () => ({
      success: false as const,
      fallback: buildFallbackIntent(serviceType, problemChips, description),
      failureReason: "TIMEOUT",
      attempts: [{
        provider: KAEL_ROUTING_CONFIG.intent_classification.primary.provider,
        model: KAEL_ROUTING_CONFIG.intent_classification.primary.model,
        latencyMs: KAEL_ROUTING_CONFIG.intent_classification.latencyBudgetMs,
        success: false,
        failureReason: "TIMEOUT",
      }],
    }),
  });
  const intentStage = intentRun.value;
  if (!intentStage) {
    throw new Error(intentRun.failureReason ?? "intent stage failed");
  }
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
  await updateKaelProgress(supabase, input.progressJobId, {
    stage: "intent_classification",
    status: intentStage.success ? "completed" : "failed",
    progress: 0.2,
    failureReason: intentStage.success ? undefined : intentStage.failureReason,
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

  await Promise.all([
    updateKaelProgress(supabase, input.progressJobId, {
      stage: "vision_analysis",
      status: "running",
      progress: 0.3,
    }),
    updateKaelProgress(supabase, input.progressJobId, {
      stage: "market_lookup",
      status: "running",
      progress: 0.32,
    }),
    updateKaelProgress(supabase, input.progressJobId, {
      stage: "problem_synthesis",
      status: "running",
      progress: 0.34,
    }),
  ]);

  const preliminaryComplexity: ComplexityLevel = "medium";
  const marketTelemetry = marketLookupTelemetry({
    serviceType: validServiceType,
    problem: problemSlug,
    complexity: preliminaryComplexity,
    district,
    secrets,
  });
  const parallelRun = await runKaelParallel<EstimateParallelValue>([
    {
      label: "vision",
      purpose: "vision_analysis",
      timeoutMs: KAEL_ROUTING_CONFIG.vision_analysis.latencyBudgetMs,
      run: async () => ({
        kind: "vision" as const,
        result: await analyzeDescription(
          description,
          `${validServiceType}: ${problemSlug}`,
          photoUrls,
          secrets,
        ),
      }),
      fallback: () => ({
        kind: "vision" as const,
        result: {
          success: false as const,
          fallback: {
            problem_identified: `${validServiceType}: ${problemSlug}`,
            severity_indicators: [],
            complexity_hint: "medium" as const,
          },
          failureReason: "TIMEOUT",
        },
      }),
    },
    {
      label: "market",
      purpose: "market_lookup",
      timeoutMs: marketTelemetry.timeoutMs ??
        KAEL_ROUTING_CONFIG.market_lookup.latencyBudgetMs,
      run: async () => ({
        kind: "market" as const,
        result: await searchMarketPrice(
          validServiceType,
          problemSlug,
          preliminaryComplexity,
          district,
          secrets,
          supabase,
        ),
      }),
      fallback: () => ({
        kind: "market" as const,
        result: {
          success: false as const,
          failureReason: "TIMEOUT",
          ...marketTelemetry,
        },
      }),
    },
    {
      label: "baseline",
      purpose: "problem_synthesis",
      timeoutMs: KAEL_ROUTING_CONFIG.problem_synthesis.latencyBudgetMs,
      run: async () => ({
        kind: "baseline" as const,
        result: await fetchBaselineCandidates(
          supabase,
          validServiceType,
          problemSlug,
          district,
        ),
      }),
    },
  ]);

  const visionStage = parallelRun.results.find((stage) =>
    stage.label === "vision"
  );
  const visionResult = visionStage?.value?.kind === "vision"
    ? visionStage.value.result
    : undefined;
  if (!visionStage || !visionResult) {
    throw new Error(visionStage?.failureReason ?? "vision stage failed");
  }
  const analysis = visionResult.success
    ? visionResult.analysis
    : visionResult.fallback;
  const visionSkipped = !visionResult.success && visionResult.skipped === true;
  fallbackUsed ||= !visionResult.success && !visionSkipped;
  if (!visionSkipped) {
    stageLogs.push({
      stage: "vision",
      provider: visionResult.success ? visionResult.provider : "anthropic",
      model: visionResult.success ? visionResult.model : "claude-sonnet-4-6",
      latencyMs: visionStage.elapsedMs,
      success: visionResult.success,
      failureReason: visionResult.success
        ? undefined
        : visionResult.failureReason,
      fallbackUsed: !visionResult.success,
      inputTokens: visionResult.success ? visionResult.inputTokens : undefined,
      outputTokens: visionResult.success ? visionResult.outputTokens : undefined,
      costUsd: visionResult.success ? visionResult.costUsd : undefined,
      cacheStatus: visionResult.success ? visionResult.cacheStatus : undefined,
    });
  }
  await updateKaelProgress(supabase, input.progressJobId, {
    stage: "vision_analysis",
    status: visionResult.success || visionSkipped ? "completed" : "failed",
    progress: 0.4,
    failureReason: visionResult.success || visionSkipped ? undefined : visionResult.failureReason,
  });

  const baselineStage = parallelRun.results.find((stage) =>
    stage.label === "baseline"
  );
  if (!baselineStage) {
    throw new Error("baseline stage failed");
  }
  const baselineCandidates = baselineStage.value?.kind === "baseline"
    ? baselineStage.value.result
    : undefined;
  if (!baselineStage.success && baselineStage.failureReason !== "TIMEOUT") {
    throw new Error(baselineStage.failureReason ?? "baseline stage failed");
  }
  const baselineResult = pickBaselineCandidate(
    baselineCandidates ?? {
      success: false,
      error: baselineStage.failureReason ?? "baseline stage failed",
    },
    analysis.complexity_hint,
  );
  stageLogs.push({
    stage: "baseline",
    latencyMs: baselineStage.elapsedMs,
    success: Boolean(baselineResult?.success),
    failureReason: baselineResult?.success
      ? undefined
      : baselineResult?.error ?? baselineStage.failureReason,
    fallbackUsed: false,
  });
  await updateKaelProgress(supabase, input.progressJobId, {
    stage: "problem_synthesis",
    status: baselineResult?.success ? "completed" : "failed",
    progress: 0.6,
    failureReason: baselineResult?.success ? undefined : baselineResult?.error ?? baselineStage.failureReason,
  });

  if (!baselineResult?.success) {
    return {
      success: false,
      error:
        "Không có dữ liệu giá tham khảo cho dịch vụ này. Vui lòng thử lại sau.",
      code: "NO_BASELINE",
      stageLogs,
    };
  }

  const marketStage = parallelRun.results.find((stage) =>
    stage.label === "market"
  );
  const marketResult = marketStage?.value?.kind === "market"
    ? marketStage.value.result
    : undefined;
  if (!marketStage || !marketResult) {
    throw new Error(marketStage?.failureReason ?? "market stage failed");
  }
  fallbackUsed ||= !marketResult.success;
  stageLogs.push({
    stage: "market",
    provider: marketResult.provider ?? "perplexity",
    model: marketResult.model ?? "sonar",
    latencyMs: marketStage.elapsedMs,
    success: marketResult.success,
    failureReason: marketResult.success
      ? undefined
      : marketResult.failureReason,
    fallbackUsed: !marketResult.success,
    inputTokens: marketResult.success ? marketResult.inputTokens : undefined,
    outputTokens: marketResult.success ? marketResult.outputTokens : undefined,
    costUsd: marketResult.success ? marketResult.costUsd : undefined,
    cacheStatus: marketResult.success ? marketResult.cacheStatus : undefined,
    safeMetadata: marketResult.safeMetadata,
  });
  await updateKaelProgress(supabase, input.progressJobId, {
    stage: "market_lookup",
    status: marketResult.success ? "completed" : "failed",
    progress: 0.78,
    failureReason: marketResult.success ? undefined : marketResult.failureReason,
  });

  await updateKaelProgress(supabase, input.progressJobId, {
    stage: "price_synthesis",
    status: "running",
    progress: 0.86,
  });
  const synthesizedStage = await runKaelPurposeStage({
    label: "synthesis",
    purpose: "price_synthesis",
    timeoutMs: KAEL_ROUTING_CONFIG.price_synthesis.latencyBudgetMs,
    run: () =>
      Promise.resolve(synthesizePrice({
        baselineMin: baselineResult.priceMin,
        baselineMax: baselineResult.priceMax,
        market: marketResult.success ? marketResult.market : null,
        complexityHint: analysis.complexity_hint,
      })),
  });
  const synthesized = synthesizedStage.value;
  if (!synthesized) {
    throw new Error(synthesizedStage.failureReason ?? "synthesis stage failed");
  }
  stageLogs.push({
    stage: "synthesis",
    latencyMs: synthesizedStage.elapsedMs,
    success: true,
    fallbackUsed: false,
  });
  await updateKaelProgress(supabase, input.progressJobId, {
    stage: "price_synthesis",
    status: "completed",
    progress: 1,
  });

  return {
    success: true,
    fallbackUsed,
    stageLogs,
    serviceProblemId: baselineResult.serviceProblemId,
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
