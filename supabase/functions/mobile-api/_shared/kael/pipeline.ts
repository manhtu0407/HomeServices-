import type { EdgeAiSecrets, IntakeEvalObservation, PipelineInput, PipelineResult, PipelineStageLog, SupabaseLike } from "./types.ts";
import {
  isSingleFocusedClarificationQuestion,
  priceDisclaimer,
  unsupportedServiceMessage,
} from "./types.ts";
import { buildFallbackIntent, classifyIntent, diagnoseIntake, resolveIntakeScopeConsistency } from "./intent.ts";
import {
  buildFocusedClarificationQuestion,
  buildIntakeObservation,
  mergeIntakeSafetySignals,
  resolveElectricalIntakeRuntime,
  resolveIntakeFactCoverage,
} from "./intake-runtime.ts";
import { buildSafetyFirstElectricalEstimate, prependDeterministicSafetyGuidance } from "./electrical-intake-policy.ts";
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
import {
  sanitizeVisionPhotoUrls,
  scrubCustomerCaseContextForLLM,
  scrubSensitiveForLLM,
} from "./utils.ts";
import { retrieveKaelKnowledgeContextIfEnabled } from "./knowledge.ts";
import {
  isKaelAiKillSwitchEnabled,
  KAEL_AI_UNAVAILABLE_VI,
  type KaelSpendGate,
  type SpendGateClient,
} from "./spend-gate.ts";
import { checkKaelProviderBudget, recordKaelProviderSpend } from "./provider-budget.ts";
import { pushPipelineStageLog } from "./trace.ts";
import { kaelIntakeDiagnosisPromptVersion } from "./prompts.ts";

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
  const language = input.language ?? "vi";
  const problemChips = input.problemChips.map(scrubSensitiveForLLM);
  const description = scrubCustomerCaseContextForLLM(input.description);
  const photoUrls = sanitizeVisionPhotoUrls(input.photoUrls ?? []);
  const stageLogs: PipelineStageLog[] = [];
  const learningApplications: Extract<PipelineResult, { success: true }>["learningApplications"] = [];
  let fallbackUsed = false;
  const progressTarget = input.progressTarget ?? input.progressJobId;

  // S4/F1 (§38) — Codex PR#68 P1: the kill-switch must HARD-STOP customer-facing AI
  // output, including deterministic playbook routing. Check it before any intake stage
  // so an incident cannot surface a diagnosis, observation, estimate, or provider call.
  // callAI keeps a per-call kill-switch as a backstop for non-pipeline AI paths.
  if (isKaelAiKillSwitchEnabled()) {
    console.warn("kael pipeline: KAEL_AI_KILL_SWITCH on — returning unavailable state");
    return {
      success: false,
      error: KAEL_AI_UNAVAILABLE_VI,
      code: "AI_DISABLED",
      stageLogs,
    };
  }

  const electricalIntake = resolveElectricalIntakeRuntime({
    intakeDiagnosisEnabled: input.intakeDiagnosisEnabled === true,
    serviceType,
    problemChips,
    description,
    priorSafetySignals: input.priorSafetySignals,
  });
  const electricalPlaybookEnabled = electricalIntake.enabled;
  const deterministicSafetySignals = electricalIntake.safetySignals;
  const withDeterministicSafetyGuidance = (
    message: string,
    signals: readonly string[] = deterministicSafetySignals,
  ) => prependDeterministicSafetyGuidance(message, signals, language);
  const hardRoute = electricalIntake.hardRoute;
  if (hardRoute) {
    const intakeObservation = buildIntakeObservation({
      scopeSignal: hardRoute.scopeSignal,
      suggestedService: hardRoute.suggestedService,
      problemSlug: null,
      needsClarification: false,
      safetySignals: deterministicSafetySignals,
      modelId: "deterministic",
      serviceType,
      electricalPlaybookEnabled,
    });
    const hardRouteMessage = hardRoute.scopeSignal === "out_of_scope"
      ? unsupportedServiceMessage(language)
      : language === "en"
      ? "Your description does not match the selected service."
      : "Mô tả của bạn không khớp với dịch vụ đang chọn.";
    return {
      success: false,
      error: withDeterministicSafetyGuidance(hardRouteMessage),
      code: hardRoute.scopeSignal === "out_of_scope"
        ? "UNSUPPORTED"
        : "SERVICE_MISMATCH",
      stageLogs,
      suggestedService: hardRoute.suggestedService ?? undefined,
      policyReasonCode: hardRoute.reasonCode,
      intakeObservation: input.intakeDiagnosisEnabled ? intakeObservation : undefined,
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
      error: withDeterministicSafetyGuidance(
        language === "en"
          ? "Kael is temporarily overloaded. Please try again in a few minutes."
          : "Kael đang tạm quá tải. Vui lòng thử lại sau ít phút.",
      ),
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
          electricalPlaybookEnabled,
        )
        : classifyIntent(
          serviceType,
          problemChips,
          description,
          secrets,
          spendGate,
          electricalPlaybookEnabled,
        ),
    fallback: (failureReason) => ({
      success: false as const,
      fallback: buildFallbackIntent(
        serviceType,
        problemChips,
        description,
        electricalPlaybookEnabled,
      ),
      failureReason,
      attempts: [],
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
    pushPipelineStageLog(stageLogs, input, {
      stage: "intent",
      ...attempt,
      fallbackUsed: !intentStage.success &&
        index === intentStage.attempts.length - 1,
    }, {
      promptVersion: input.intakeDiagnosisEnabled
        ? kaelIntakeDiagnosisPromptVersion(serviceType)
        : undefined,
    });
  });
  void updateKaelProgress(supabase, progressTarget, {
    stage: "intent_classification",
    status: intentStage.success ? "completed" : "failed",
    progress: 0.2,
    failureReason: intentStage.success ? undefined : intentStage.failureReason,
  });

  const intentModelId = intentStage.success
    ? intentStage.attempts.find((attempt) => attempt.success)?.model ?? "unreported-model"
    : "deterministic-fallback";
  const intakeScope = input.intakeDiagnosisEnabled && electricalPlaybookEnabled
    ? resolveIntakeScopeConsistency(serviceType, intent)
    : null;
  const effectiveScopeSignal = intakeScope?.scopeSignal ?? intent.scope_signal;
  const validServiceType = intent.service_type === "unsupported"
    ? null
    : intent.service_type;
  const normalizedProblem = validServiceType
    ? normalizeProblemSlugForService(validServiceType, intent.problem_slug)
    : null;
  const problemSlug = normalizedProblem?.slug ?? null;
  if (normalizedProblem) fallbackUsed ||= normalizedProblem.normalized;
  const mergedSafetySignals = mergeIntakeSafetySignals({
    serviceType,
    deterministic: deterministicSafetySignals,
    reported: intent.safety_signals ?? [],
  });

  if (
    intent.service_type === "unsupported" ||
    effectiveScopeSignal === "out_of_scope"
  ) {
    await recordProviderSpendIfEnforced();
    return {
      success: false,
      error: withDeterministicSafetyGuidance(
        unsupportedServiceMessage(language),
        mergedSafetySignals,
      ),
      code: "UNSUPPORTED",
      stageLogs,
      intakeObservation: input.intakeDiagnosisEnabled
        ? buildIntakeObservation({
          scopeSignal: "out_of_scope",
          suggestedService: null,
          problemSlug: null,
          needsClarification: false,
          safetySignals: mergedSafetySignals,
          modelId: intentModelId,
          serviceType,
          electricalPlaybookEnabled,
        })
        : undefined,
    };
  }

  // Intake-diagnosis short-circuits — only when diagnosis mode produced the signals.
  // Stop BEFORE the parallel vision/market block so a clarification/mismatch turn
  // costs no downstream AI.
  let profileFacts: Record<string, string> | undefined;
  let safetySignals: string[] | undefined = electricalPlaybookEnabled
    ? mergedSafetySignals
    : undefined;
  let intakeObservation: IntakeEvalObservation | undefined;
  if (input.intakeDiagnosisEnabled) {
    if (effectiveScopeSignal === "service_mismatch") {
      const suggestedService = intakeScope?.suggestedService ??
        intent.suggested_service ?? null;
      await recordProviderSpendIfEnforced();
      return {
        success: false,
        error: withDeterministicSafetyGuidance(
          language === "en"
            ? "Your description does not match the selected service."
            : "Mô tả của bạn không khớp với dịch vụ đang chọn.",
          mergedSafetySignals,
        ),
        code: "SERVICE_MISMATCH",
        stageLogs,
        suggestedService: suggestedService ?? undefined,
        intakeObservation: buildIntakeObservation({
          scopeSignal: "service_mismatch",
          suggestedService,
          problemSlug: null,
          needsClarification: false,
          safetySignals: mergedSafetySignals,
          modelId: intentModelId,
          serviceType,
          electricalPlaybookEnabled,
        }),
      };
    }
    const coverage = resolveIntakeFactCoverage({
      serviceType: intent.service_type,
      problemSlug: problemSlug ?? intent.problem_slug,
      profileFacts: {
        ...(intent.profile_facts ?? {}),
        ...(input.priorProfileFacts ?? {}),
      },
      providerMissingSlots: intent.missing_slots ?? [],
      providerNeedsClarification: intent.needs_clarification,
      electricalPlaybookEnabled,
    });
    const missingSlots = coverage.missing;
    const needsClarification = coverage.needsClarification;
    if (needsClarification) {
      const firstMissing = missingSlots[0] ?? "service_scope";
      const hasPriorProfileFact = Object.entries(input.priorProfileFacts ?? {})
        .some(([key, value]) =>
          typeof value === "string" && coverage.facts[key] === value.trim().slice(0, 500)
        );
      const proposedQuestion = intent.clarification_question ??
        (language === "vi" ? intent.clarification_question_vi : null) ??
        (language === "en"
          ? `Could you tell Kael more about ${firstMissing.replaceAll("_", " ")}?`
          : `Bạn cho Kael biết thêm về ${firstMissing.replaceAll("_", " ")} nhé?`);
      const providerQuestion = intent.clarification_question ??
        (language === "vi" ? intent.clarification_question_vi : null);
      const question = !hasPriorProfileFact && providerQuestion &&
          isSingleFocusedClarificationQuestion(proposedQuestion)
        ? proposedQuestion.trim()
        : buildFocusedClarificationQuestion(firstMissing, language);
      await recordProviderSpendIfEnforced();
      return {
        success: false,
        error: withDeterministicSafetyGuidance(question, mergedSafetySignals),
        code: "NEEDS_CLARIFICATION",
        stageLogs,
        clarification: {
          question,
          // Each turn collects one fact. Remaining profile gaps are
          // recalculated by the server on the next turn.
          missingSlots: [firstMissing],
          customerSentiment: intent.customer_sentiment,
        },
        intakeObservation: buildIntakeObservation({
          scopeSignal: "in_scope",
          suggestedService: null,
          problemSlug,
          needsClarification: true,
          safetySignals: mergedSafetySignals,
          modelId: intentModelId,
          serviceType,
          electricalPlaybookEnabled,
        }),
      };
    }
    profileFacts = coverage.facts;
    safetySignals = mergedSafetySignals;
    intakeObservation = buildIntakeObservation({
      scopeSignal: "in_scope",
      suggestedService: null,
      problemSlug,
      needsClarification: false,
      safetySignals,
      modelId: intentModelId,
      serviceType,
      electricalPlaybookEnabled,
    });
  }

  if (!validServiceType || !problemSlug) {
    throw new Error("intent normalization failed");
  }
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
    pushPipelineStageLog(stageLogs, input, {
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
  // Without this application log the rule never accumulates monitor samples
  // and auto-rollback can never trigger for analysis rules.
  if (learnedComplexity) {
    learningApplications.push({
      ruleId: learnedComplexity.ruleId,
      ruleVersion: learnedComplexity.ruleVersion,
      skillId: "LS2",
      appliedTarget: "analysis_prompt",
      safeMetadata: {
        service_type: validServiceType,
        problem_slug: problemSlug,
        district,
        from_complexity: learnedComplexity.fromComplexity,
        to_complexity: learnedComplexity.newComplexity,
      },
    });
  }

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
  // Second pick at the pre-learning complexity. effectiveComplexity may already have
  // been raised by an LS2 rule, so selecting on it would leave a learned input in the
  // reference band. Same rows, no extra I/O.
  const referenceBaseline = pickBaselineCandidate(
    baselineCandidates ?? {
      success: false,
      error: baselineStage.failureReason ?? "baseline stage failed",
    },
    analysis.complexity_hint,
  );
  pushPipelineStageLog(stageLogs, input, {
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
      error: withDeterministicSafetyGuidance(
        language === "en"
          ? "No reference price is available for this service. Please try again later."
          : "Không có dữ liệu giá tham khảo cho dịch vụ này. Vui lòng thử lại sau.",
        mergedSafetySignals,
      ),
      code: "NO_BASELINE",
      stageLogs,
      intakeObservation,
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
  pushPipelineStageLog(stageLogs, input, {
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
  pushPipelineStageLog(stageLogs, input, {
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
    referencePriceMin: referenceBaseline.success ? referenceBaseline.priceMin : undefined,
    referencePriceMax: referenceBaseline.success ? referenceBaseline.priceMax : undefined,
    customerSentiment: input.intakeDiagnosisEnabled ? intent.customer_sentiment : undefined,
    profileFacts,
    safetySignals,
    intakeObservation,
    knowledgeContext: knowledgeContext.safeMetadata ? knowledgeContext : undefined,
    learningApplications,
    estimate: buildSafetyFirstElectricalEstimate({
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
    }, electricalPlaybookEnabled ? mergedSafetySignals : [], language),
  };
}
