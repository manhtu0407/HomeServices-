import type { EdgeAiSecrets, PipelineInput, PipelineResult, PipelineStageLog, SupabaseLike } from "./types.ts";
import { CLARIFICATION_CAP, PRICE_DISCLAIMER, UNSUPPORTED_SERVICE_MESSAGE } from "./types.ts";
import { buildFallbackIntent, classifyIntent, diagnoseIntake } from "./intent.ts";
import { analyzeDescription } from "./vision.ts";
import { marketLookupTelemetry, searchMarketPrice } from "./market.ts";
import { fetchBaselineCandidates, normalizeProblemSlugForService, pickBaselineCandidate, synthesizePrice } from "./synthesis.ts";
import { buildAdvisory } from "./advisory.ts";
import {
  applyLearnedComplexityRule,
  applyLearnedPriceRule,
  clampLearnedPriceToBaseline,
} from "./learning.ts";
import { KAEL_ROUTING_CONFIG } from "./routing.config.ts";
import { runKaelParallel, runKaelPurposeStage } from "./orchestrator.ts";
import { updateKaelProgress } from "./streaming.ts";
import { sanitizeVisionPhotoUrls, scrubSensitiveForLLM } from "./utils.ts";
import { retrieveKaelKnowledgeContextIfEnabled } from "./knowledge.ts";
import { checkKaelProviderBudget, recordKaelProviderSpend } from "./provider-budget.ts";

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
  const learningApplications: Extract<PipelineResult, { success: true }>["learningApplications"] = [];
  let fallbackUsed = false;
  const progressTarget = input.progressTarget ?? input.progressJobId;

  // C-1 (Notes.md): hard daily provider-spend ceiling. No-op + zero DB round-trip
  // unless KAEL_PROVIDER_COST_CAP_ENABLED is on; fails open on any error so a
  // monitoring guard never blocks a real estimate. When over budget, degrade
  // honestly here, before spending on the intent + parallel provider calls.
  const providerBudget = await checkKaelProviderBudget(supabase);
  if (providerBudget.exhausted) {
    console.warn("kael pipeline: provider daily budget exhausted, degrading", {
      spendUsd: providerBudget.spendUsd,
      capUsd: providerBudget.capUsd,
    });
    return {
      success: false,
      error: "Kael đang tạm quá tải. Vui lòng thử lại sau ít phút.",
      code: "BUDGET_EXCEEDED",
      stageLogs,
    };
  }
  // Record the AI spend incurred by this estimate (intent + parallel + synthesis)
  // once it is known. Only when enforcement is on; reads the final stageLogs at
  // call time. Awaited so the daily counter stays accurate before we return.
  const recordProviderSpendIfEnforced = async () => {
    if (!providerBudget.enforced) return;
    const spentUsd = stageLogs.reduce(
      (sum, log) => sum + (typeof log.costUsd === "number" ? log.costUsd : 0),
      0,
    );
    await recordKaelProviderSpend(supabase, spentUsd);
  };

  // P-2 (Notes.md): the intermediate stage-progress writes are fire-and-forget.
  // updateKaelProgress swallows its own errors (returns void, never throws), the
  // UI consumes stage granularity over a separate 800ms SSE poll, and each write
  // is followed by awaited stage work that keeps the isolate alive long enough
  // to flush it. Only the terminal progress:1 write stays awaited so the
  // completed state is durably persisted before the response returns.
  void updateKaelProgress(supabase, progressTarget, {
    stage: "intent_classification",
    status: "running",
    progress: 0.1,
  });
  const intentRun = await runKaelPurposeStage({
    label: "intent",
    purpose: "intent_classification",
    timeoutMs: KAEL_ROUTING_CONFIG.intent_classification.latencyBudgetMs,
    run: () =>
      input.intakeDiagnosisEnabled
        ? diagnoseIntake(serviceType, problemChips, description, secrets, input.conversationContext)
        : classifyIntent(serviceType, problemChips, description, secrets),
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
  void updateKaelProgress(supabase, progressTarget, {
    stage: "intent_classification",
    status: intentStage.success ? "completed" : "failed",
    progress: 0.2,
    failureReason: intentStage.success ? undefined : intentStage.failureReason,
  });

  if (intent.service_type === "unsupported" || intent.scope_signal === "out_of_scope") {
    await recordProviderSpendIfEnforced();
    return {
      success: false,
      error: UNSUPPORTED_SERVICE_MESSAGE,
      code: "UNSUPPORTED",
      stageLogs,
    };
  }

  // Intake-diagnosis short-circuits — only when diagnosis mode produced the signals.
  // Stop BEFORE the parallel vision/market block so a clarification/mismatch turn
  // costs no downstream AI.
  if (input.intakeDiagnosisEnabled) {
    if (intent.scope_signal === "service_mismatch") {
      await recordProviderSpendIfEnforced();
      return {
        success: false,
        error: "Mô tả của bạn không khớp với dịch vụ đang chọn.",
        code: "SERVICE_MISMATCH",
        stageLogs,
        suggestedService: intent.suggested_service ?? undefined,
      };
    }
    if (intent.needs_clarification && (input.clarificationCount ?? 0) < CLARIFICATION_CAP) {
      await recordProviderSpendIfEnforced();
      return {
        success: false,
        error: intent.clarification_question_vi ??
          "Bạn mô tả rõ hơn vấn đề đang gặp giúp Kael nhé.",
        code: "NEEDS_CLARIFICATION",
        stageLogs,
        clarification: {
          question: intent.clarification_question_vi ?? null,
          missingSlots: intent.missing_slots ?? [],
          customerSentiment: intent.customer_sentiment,
        },
      };
    }
  }

  const validServiceType = intent.service_type;
  const normalizedProblem = normalizeProblemSlugForService(
    validServiceType,
    intent.problem_slug,
  );
  const problemSlug = normalizedProblem.slug;
  fallbackUsed ||= normalizedProblem.normalized;
  const knowledgeContext = await retrieveKaelKnowledgeContextIfEnabled(supabase, {
    serviceType: validServiceType,
    problemSlug,
    safetyTopic: "worker_safety_advisory",
    legalTopic: "legal_safety_awareness",
    queryText: `${problemChips.join(" ")} ${description}`.trim(),
    usageContext: {
      jobId: typeof progressTarget === "string"
        ? progressTarget
        : progressTarget?.table === "jobs"
        ? progressTarget.id ?? null
        : null,
      sessionId: typeof progressTarget === "object" &&
          progressTarget.table === "kael_chat_sessions"
        ? progressTarget.id ?? null
        : null,
      surface: "kael_pipeline",
    },
  }, secrets);

  await Promise.all([
    updateKaelProgress(supabase, progressTarget, {
      stage: "vision_analysis",
      status: "running",
      progress: 0.3,
    }),
    updateKaelProgress(supabase, progressTarget, {
      stage: "market_lookup",
      status: "running",
      progress: 0.32,
    }),
    updateKaelProgress(supabase, progressTarget, {
      stage: "problem_synthesis",
      status: "running",
      progress: 0.34,
    }),
  ]);

  const preliminaryComplexity = "medium";
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
          { knowledgeContext },
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
  void updateKaelProgress(supabase, progressTarget, {
    stage: "vision_analysis",
    status: visionResult.success || visionSkipped ? "completed" : "failed",
    progress: 0.4,
    failureReason: visionResult.success || visionSkipped ? undefined : visionResult.failureReason,
  });
  const learnedComplexity = await applyLearnedComplexityRule(
    supabase,
    secrets,
    validServiceType,
    problemSlug,
    district,
    analysis.complexity_hint,
  );
  const effectiveComplexity = learnedComplexity?.newComplexity ??
    analysis.complexity_hint;

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
    effectiveComplexity,
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
  void updateKaelProgress(supabase, progressTarget, {
    stage: "problem_synthesis",
    status: baselineResult?.success ? "completed" : "failed",
    progress: 0.6,
    failureReason: baselineResult?.success ? undefined : baselineResult?.error ?? baselineStage.failureReason,
  });

  if (!baselineResult?.success) {
    await recordProviderSpendIfEnforced();
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
  void updateKaelProgress(supabase, progressTarget, {
    stage: "market_lookup",
    status: marketResult.success ? "completed" : "failed",
    progress: 0.78,
    failureReason: marketResult.success ? undefined : marketResult.failureReason,
  });

  void updateKaelProgress(supabase, progressTarget, {
    stage: "price_synthesis",
    status: "running",
    progress: 0.86,
  });
  // A-1 (Notes.md): clamp the learned price against the reference baseline at
  // apply time. A rule deviating beyond the allowed band is ignored here and the
  // synthesis below falls back to the baseline range.
  const learnedPrice = clampLearnedPriceToBaseline(
    await applyLearnedPriceRule(
      supabase,
      secrets,
      validServiceType,
      problemSlug,
      district,
    ),
    { priceMin: baselineResult.priceMin, priceMax: baselineResult.priceMax },
  );
  if (learnedPrice) {
    learningApplications.push({
      ruleId: learnedPrice.ruleId,
      ruleVersion: learnedPrice.ruleVersion,
      skillId: "LS1",
      appliedTarget: "price_prior",
      safeMetadata: {
        service_type: validServiceType,
        problem_slug: problemSlug,
        district,
        applied_price_min: learnedPrice.priceMin,
        applied_price_max: learnedPrice.priceMax,
      },
    });
  }
  const synthesizedStage = await runKaelPurposeStage({
    label: "synthesis",
    purpose: "price_synthesis",
    timeoutMs: KAEL_ROUTING_CONFIG.price_synthesis.latencyBudgetMs,
    run: () =>
      Promise.resolve(synthesizePrice({
        baselineMin: learnedPrice?.priceMin ?? baselineResult.priceMin,
        baselineMax: learnedPrice?.priceMax ?? baselineResult.priceMax,
        market: marketResult.success ? marketResult.market : null,
        complexityHint: effectiveComplexity,
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
  await updateKaelProgress(supabase, progressTarget, {
    stage: "price_synthesis",
    status: "completed",
    progress: 1,
  });
  await recordProviderSpendIfEnforced();

  return {
    success: true,
    fallbackUsed,
    stageLogs,
    serviceProblemId: baselineResult.serviceProblemId,
    customerSentiment: input.intakeDiagnosisEnabled ? intent.customer_sentiment : undefined,
    knowledgeContext: knowledgeContext.safeMetadata ? knowledgeContext : undefined,
    learningApplications,
    estimate: {
      service_type: validServiceType,
      problem_category: problemSlug,
      problem_summary: analysis.problem_identified,
      complexity: effectiveComplexity,
      price_min: synthesized.price_min,
      price_max: synthesized.price_max,
      confidence: synthesized.confidence,
      advisory: buildAdvisory(analysis.severity_indicators, knowledgeContext.safetyGuidance),
      disclaimer: PRICE_DISCLAIMER,
    },
  };
}
