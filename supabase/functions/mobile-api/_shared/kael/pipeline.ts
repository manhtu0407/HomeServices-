import type { EdgeAiSecrets, PipelineInput, PipelineResult, PipelineStageLog, SupabaseLike } from "./types.ts";
import {
  isSingleFocusedClarificationQuestion,
  priceDisclaimer,
  unsupportedServiceMessage,
} from "./types.ts";
import { buildFallbackIntent, classifyIntent, diagnoseIntake } from "./intent.ts";
import { resolveProfileFactCoverage } from "./case-work-controls.ts";
import { getKaelPerformanceProfile } from "./performance-profiles.ts";
import { analyzeDescription } from "./vision.ts";
import { marketLookupTelemetry, searchMarketPrice } from "./market.ts";
import {
  evaluateMarketVerdict,
  marketVerdictReason,
  marketVerdictSafeMetadata,
} from "./market-verdict.ts";
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
import {
  isKaelAiKillSwitchEnabled,
  KAEL_AI_UNAVAILABLE_VI,
  type KaelSpendGate,
  type SpendGateClient,
} from "./spend-gate.ts";
import { checkKaelProviderBudget, recordKaelProviderSpend } from "./provider-budget.ts";
import { buildKaelTraceEvent, buildProviderAttemptTrace } from "./trace.ts";

type EstimateParallelValue =
  | { kind: "vision"; result: Awaited<ReturnType<typeof analyzeDescription>> }
  | { kind: "market"; result: Awaited<ReturnType<typeof searchMarketPrice>> }
  | {
    kind: "baseline";
    result: Awaited<ReturnType<typeof fetchBaselineCandidates>>;
  };

const CUSTOMER_INTAKE_POLICY_ID = "kael.path.customer_intake_to_estimate.v1";
const CUSTOMER_CASE_CHAT_POLICY_ID = "kael.path.customer_case_chat_revision.v1";

export async function runKaelPipeline(
  input: PipelineInput,
  supabase: SupabaseLike,
  secrets: EdgeAiSecrets,
): Promise<PipelineResult> {
  const { serviceType, district } = input;
  const language = input.language ?? "vi";
  const problemChips = input.problemChips.map(scrubSensitiveForLLM);
  const description = scrubSensitiveForLLM(input.description);
  const photoUrls = sanitizeVisionPhotoUrls(input.photoUrls ?? []);
  const stageLogs: PipelineStageLog[] = [];
  const learningApplications: Extract<PipelineResult, { success: true }>["learningApplications"] = [];
  let fallbackUsed = false;
  const progressTarget = input.progressTarget ?? input.progressJobId;

  // S4/F1 (§38) — Codex PR#68 P1: the kill-switch must HARD-STOP customer-facing AI
  // output, not just block network spend. Check it up-front and surface the honest
  // Vietnamese unavailable state BEFORE any stage runs, so an incident never degrades
  // silently into a baseline estimate/job. callAI keeps a per-call kill-switch as a
  // backstop for non-pipeline AI paths (worker assist, scope change).
  if (isKaelAiKillSwitchEnabled()) {
    console.warn("kael pipeline: KAEL_AI_KILL_SWITCH on — returning unavailable state");
    return {
      success: false,
      error: KAEL_AI_UNAVAILABLE_VI,
      code: "AI_DISABLED",
      stageLogs,
    };
  }

  // S4/F1 (§38): durable, DB-backed AI-spend gate (global + per-user caps) for this
  // estimate. callAI RESERVES the estimated cost atomically before each provider call
  // (Codex P1 race fix) and reconciles to actual after. The runtime service-role client
  // exposes .rpc; SupabaseLike narrows to from() only, so cast to the gate's client
  // shape. If .rpc is absent the gate fails open (safe).
  const spendGate: KaelSpendGate = {
    client: supabase as unknown as SpendGateClient,
    actorId: input.actorId ?? null,
  };

  // independent hard daily provider-spend ceiling. No-op +
  // zero DB round-trip unless KAEL_PROVIDER_COST_CAP_ENABLED is on; fails open. Kept as
  // a complementary operator knob alongside the §38 gate; degrade honestly here, before
  // spending on the intent + parallel provider calls. (Consolidation tracked as follow-up.)
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

  // the intermediate stage-progress writes are fire-and-forget.
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
        ? diagnoseIntake(
          serviceType,
          problemChips,
          description,
          secrets,
          spendGate,
          input.conversationContext,
          language,
        )
        : classifyIntent(
          serviceType,
          problemChips,
          description,
          secrets,
          spendGate,
        ),
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
    pushStageLog(stageLogs, input, {
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
      error: unsupportedServiceMessage(language),
      code: "UNSUPPORTED",
      stageLogs,
    };
  }

  // Intake-diagnosis short-circuits — only when diagnosis mode produced the signals.
  // Stop BEFORE the parallel vision/market block so a clarification/mismatch turn
  // costs no downstream AI.
  let profileFacts: Record<string, string> | undefined;
  let safetySignals: string[] | undefined;
  if (input.intakeDiagnosisEnabled) {
    if (intent.scope_signal === "service_mismatch") {
      await recordProviderSpendIfEnforced();
      return {
        success: false,
        error: language === "en"
          ? "Your description does not match the selected service."
          : "Mô tả của bạn không khớp với dịch vụ đang chọn.",
        code: "SERVICE_MISMATCH",
        stageLogs,
        suggestedService: intent.suggested_service ?? undefined,
      };
    }
    const profile = getKaelPerformanceProfile(intent.service_type);
    const coverage = profile
      ? resolveProfileFactCoverage(profile, intent.profile_facts ?? {})
      : { facts: {}, missing: [] as readonly string[] };
    const missingSlots = [...new Set([
      ...coverage.missing,
      ...(intent.missing_slots ?? []),
    ])];
    if (intent.needs_clarification || missingSlots.length > 0) {
      const firstMissing = missingSlots[0] ?? "service_scope";
      const proposedQuestion = intent.clarification_question ??
        (language === "vi" ? intent.clarification_question_vi : null) ??
        (language === "en"
          ? `Could you tell Kael more about ${firstMissing.replaceAll("_", " ")}?`
          : `Bạn cho Kael biết thêm về ${firstMissing.replaceAll("_", " ")} nhé?`);
      const providerQuestion = intent.clarification_question ??
        (language === "vi" ? intent.clarification_question_vi : null);
      const question = providerQuestion &&
          isSingleFocusedClarificationQuestion(proposedQuestion)
        ? proposedQuestion.trim()
        : buildFocusedClarificationQuestion(firstMissing, language);
      await recordProviderSpendIfEnforced();
      return {
        success: false,
        error: question,
        code: "NEEDS_CLARIFICATION",
        stageLogs,
        clarification: {
          question,
          // Each turn collects one fact. Remaining profile gaps are
          // recalculated by the server on the next turn.
          missingSlots: [firstMissing],
          customerSentiment: intent.customer_sentiment,
        },
      };
    }
    profileFacts = coverage.facts;
    const allowedSafetySignals = new Set(
      profile?.safety_capability_gates.flatMap((gate) => [...gate.trigger_signals]) ?? [],
    );
    safetySignals = (intent.safety_signals ?? []).filter((signal) =>
      allowedSafetySignals.has(signal)
    );
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
          spendGate,
          language,
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
          { knowledgeContext, gate: spendGate },
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
    pushStageLog(stageLogs, input, {
      stage: "vision",
      provider: visionResult.success
        ? visionResult.provider
        : KAEL_ROUTING_CONFIG.vision_analysis.primary.provider,
      model: visionResult.success
        ? visionResult.model
        : KAEL_ROUTING_CONFIG.vision_analysis.primary.model,
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
  if (baselineStage.status === "failed" && baselineStage.failureReason !== "TIMEOUT") {
    throw new Error(baselineStage.failureReason ?? "baseline stage failed");
  }
  const baselineResult = pickBaselineCandidate(
    baselineCandidates ?? {
      success: false,
      error: baselineStage.failureReason ?? "baseline stage failed",
    },
    effectiveComplexity,
  );
  pushStageLog(stageLogs, input, {
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
  pushStageLog(stageLogs, input, {
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
  const marketVerdict = marketResult.success &&
      marketResult.safeMetadata?.source_trust_enabled === true
    ? evaluateMarketVerdict({
      baselineMin: baselineResult.priceMin,
      baselineMax: baselineResult.priceMax,
      market: marketResult.market,
      weakEvidence: marketResult.safeMetadata?.source_trust_quorum_met === false,
    })
    : null;

  void updateKaelProgress(supabase, progressTarget, {
    stage: "price_synthesis",
    status: "running",
    progress: 0.86,
  });
  // clamp the learned price against the reference baseline at
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
        market: marketResult.success && marketVerdict?.verdict !== "reject"
          ? marketResult.market
          : null,
        complexityHint: effectiveComplexity,
        needsInspection: marketVerdict?.needsInspection === true,
      })),
  });
  const synthesized = synthesizedStage.value;
  if (!synthesized) {
    throw new Error(synthesizedStage.failureReason ?? "synthesis stage failed");
  }
  pushStageLog(stageLogs, input, {
    stage: "synthesis",
    latencyMs: synthesizedStage.elapsedMs,
    success: true,
    fallbackUsed: false,
    safeMetadata: marketVerdict
      ? marketVerdictSafeMetadata(marketVerdict)
      : undefined,
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
    profileFacts,
    safetySignals,
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
      advisory: buildAdvisory(
        analysis.severity_indicators,
        knowledgeContext.safetyGuidance,
        language,
      ),
      disclaimer: priceDisclaimer(language),
      needs_inspection: marketVerdict?.needsInspection === true,
      price_source: marketVerdict?.needsInspection ? "inspection_required" : undefined,
      needs_inspection_reason: marketVerdict
        ? marketVerdictReason(marketVerdict, language)
        : undefined,
      market_signals: marketResult.success
        ? marketResult.market.sources_summary ?? null
        : null,
    },
  };
}

function pushStageLog(
  stageLogs: PipelineStageLog[],
  input: PipelineInput,
  log: PipelineStageLog,
): void {
  stageLogs.push({
    ...log,
    trace: buildPipelineStageTrace(input, log),
  });
}

function buildPipelineStageTrace(
  input: PipelineInput,
  log: PipelineStageLog,
): PipelineStageLog["trace"] {
  const workflowPhase = input.intakeDiagnosisEnabled ? "offer_ready" : "intake";
  const action = input.intakeDiagnosisEnabled
    ? "customer.open_case_chat"
    : "customer.submit_intake";
  const policyId = input.intakeDiagnosisEnabled
    ? CUSTOMER_CASE_CHAT_POLICY_ID
    : CUSTOMER_INTAKE_POLICY_ID;
  const purpose = purposeForPipelineStage(log.stage);
  const safeMetadata = {
    stage: log.stage,
    ...(log.cacheStatus ? { cache_status: log.cacheStatus } : {}),
  };
  if (log.provider && log.model) {
    return buildProviderAttemptTrace({
      workflowPhase,
      actorRole: "customer",
      action,
      policyId,
      purpose,
      provider: log.provider,
      model: log.model,
      latencyMs: log.latencyMs,
      costUsd: log.costUsd,
      result: log.success ? "success" : "error",
      code: log.failureReason,
      fallbackUsed: log.fallbackUsed,
      safeMetadata,
    });
  }
  return buildKaelTraceEvent({
    workflow_phase: workflowPhase,
    actor_role: "customer",
    action,
    policy_id: policyId,
    purpose,
    provider: null,
    model: null,
    latency_ms: log.latencyMs,
    cost_usd: log.costUsd ?? null,
    validation: {
      status: log.success ? "pass" : "fail",
      reason_code: log.failureReason ?? null,
    },
    fallback: {
      used: log.fallbackUsed,
      reason_code: log.fallbackUsed ? log.failureReason ?? "FALLBACK" : null,
    },
    confidence: null,
    safe_metadata: safeMetadata,
  });
}

export function buildFocusedClarificationQuestion(
  missingSlot: string,
  language: "vi" | "en",
) {
  const slot = missingSlot.toLowerCase();
  if (/(?:time|window|schedule|urgency|duration|history)/.test(slot)) {
    return language === "en"
      ? "When do you need this work completed?"
      : "Bạn muốn công việc được thực hiện vào thời điểm nào?";
  }
  if (/(?:area|room|location|access|concealed|occupancy|height)/.test(slot)) {
    return language === "en"
      ? "Where exactly is the affected area in the apartment?"
      : "Khu vực cần xử lý nằm chính xác ở đâu trong căn hộ?";
  }
  if (/(?:count|quantity|volume|task)/.test(slot)) {
    return language === "en"
      ? "How many items need to be handled?"
      : "Có bao nhiêu hạng mục cần được xử lý?";
  }
  if (/(?:material|surface|fabric|pipe|fixture|device|circuit|unit_type|capacity)/.test(slot)) {
    return language === "en"
      ? "What type of material or device needs service?"
      : "Loại vật liệu hoặc thiết bị cần xử lý là gì?";
  }
  if (/(?:part|supply|equipment|consumable|hardware|new_device)/.test(slot)) {
    return language === "en"
      ? "Do you already have the required part?"
      : "Bạn đã có sẵn vật tư cần dùng chưa?";
  }
  if (/(?:symptom|condition|severity|damage|fault|sign|stain|odor|mold)/.test(slot)) {
    return language === "en"
      ? "What is the clearest symptom you can observe?"
      : "Dấu hiệu rõ nhất bạn đang quan sát được là gì?";
  }
  return language === "en"
    ? "Which specific task do you want Kael to handle?"
    : "Bạn muốn Kael xử lý hạng mục cụ thể nào?";
}

function purposeForPipelineStage(stage: PipelineStageLog["stage"]) {
  switch (stage) {
    case "intent":
      return "intent_classification";
    case "vision":
      return "vision_analysis";
    case "baseline":
      return "problem_synthesis";
    case "market":
      return "market_lookup";
    case "synthesis":
      return "price_synthesis";
  }
}
