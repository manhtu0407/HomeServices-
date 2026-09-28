import type { IntakeEvalObservation, IntentResult } from "../contracts/types.ts";
import {
  isSingleFocusedClarificationQuestion,
  unsupportedServiceMessage,
} from "../contracts/types.ts";
import {
  buildFallbackIntent,
  classifyIntent,
  diagnoseIntake,
  resolveIntakeScopeConsistency,
} from "../tools/intent.ts";
import {
  buildFocusedClarificationQuestion,
  buildIntakeObservation,
  mergeIntakeSafetySignals,
  resolveIntakeFactCoverage,
} from "./intake-runtime.ts";
import { normalizeProblemSlugForService } from "../tools/synthesis.ts";
import { runKaelPurposeStage } from "./orchestrator.ts";
import { updateKaelProgress } from "./streaming.ts";
import { pushPipelineStageLog } from "../learning/trace.ts";
import { kaelIntakeDiagnosisPromptVersion } from "../prompts/prompts.ts";
import type { PreparedKaelPipeline } from "./prepare.ts";
import {
  detectOutOfScope,
  detectServiceMismatch,
} from "../kael-guardrails/boundary-guard.ts";
import { maskExplicitlyExcludedScopeForIntent } from "./utils.ts";

export async function runKaelIntentStage(prepared: PreparedKaelPipeline) {
  const {
    input,
    serviceType,
    language,
    stageLogs,
    electricalPlaybookEnabled,
    deterministicSafetySignals,
    withDeterministicSafetyGuidance,
    recordProviderSpendIfEnforced,
  } = prepared;
  const { intent, intentStage, fallbackUsed: stageFallbackUsed } =
    await runAndRecordIntentStage(prepared);
  let fallbackUsed = stageFallbackUsed;

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
      success: false as const,
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
          actorId: input.actorId,
          electricalPlaybookEnabled,
        })
        : undefined,
    };
  }

  const diagnosis = await resolveIntakeDiagnosisResult({
    prepared,
    intent,
    effectiveScopeSignal,
    intakeScope,
    problemSlug,
    mergedSafetySignals,
    intentModelId,
  });
  if (diagnosis.done) return diagnosis.response;
  const { profileFacts, safetySignals, intakeObservation } = diagnosis;

  if (!validServiceType || !problemSlug) {
    throw new Error("intent normalization failed");
  }
  return {
    intent,
    validServiceType,
    problemSlug,
    mergedSafetySignals,
    profileFacts,
    safetySignals,
    intakeObservation,
    fallbackUsed,
  };
}

async function runAndRecordIntentStage(prepared: PreparedKaelPipeline) {
  const {
    input,
    supabase,
    secrets,
    serviceType,
    language,
    problemChips,
    description,
    modelDescription,
    stageLogs,
    progressTarget,
    electricalPlaybookEnabled,
    spendGate,
  } = prepared;
  const intentRun = await runKaelPurposeStage({
    label: "intent",
    purpose: "intent_classification",
    run: () => input.intakeDiagnosisEnabled
      ? diagnoseIntake(
        serviceType, problemChips, modelDescription, secrets, spendGate,
        input.conversationContext, language, electricalPlaybookEnabled, input.actorId,
      )
      : classifyIntent(
        serviceType, problemChips, modelDescription, secrets, spendGate, electricalPlaybookEnabled,
      ),
    fallback: (failureReason) => ({
      success: false as const,
      fallback: buildFallbackIntent(
        serviceType, problemChips, description, electricalPlaybookEnabled,
      ),
      failureReason,
      attempts: [],
    }),
  });
  const intentStage = intentRun.value;
  if (!intentStage) throw new Error(intentRun.failureReason ?? "intent stage failed");
  const rawIntent = intentStage.success ? intentStage.intent : intentStage.fallback;
  const reconciliation = reconcileGroundedSelectedService({
    intent: rawIntent,
    serviceType,
    problemChips,
    description,
    electricalPlaybookEnabled,
  });
  const groundedProblem = input.groundedProblemSlug &&
      reconciliation.intent.service_type !== "unsupported"
    ? normalizeProblemSlugForService(
      reconciliation.intent.service_type,
      input.groundedProblemSlug,
    )
    : null;
  const intent = groundedProblem && reconciliation.intent.service_type === serviceType &&
      reconciliation.intent.scope_signal !== "out_of_scope" &&
      reconciliation.intent.scope_signal !== "service_mismatch"
    ? {
      ...reconciliation.intent,
      problem_slug: groundedProblem.slug,
      scope_signal: "in_scope" as const,
      suggested_service: null,
    }
    : reconciliation.intent;
  intentStage.attempts.forEach((attempt, index) => {
    pushPipelineStageLog(stageLogs, input, {
      stage: "intent",
      ...attempt,
      fallbackUsed: (!intentStage.success || reconciliation.reconciled) &&
        index === intentStage.attempts.length - 1,
    }, {
      promptVersion: input.intakeDiagnosisEnabled
        ? kaelIntakeDiagnosisPromptVersion(serviceType, input.actorId)
        : undefined,
    });
  });
  void updateKaelProgress(supabase, progressTarget, {
    stage: "intent_classification",
    status: intentStage.success ? "completed" : "failed",
    progress: 0.2,
    failureReason: intentStage.success ? undefined : intentStage.failureReason,
  });
  return {
    intent,
    intentStage,
    fallbackUsed: !intentStage.success || reconciliation.reconciled,
  };
}

function reconcileGroundedSelectedService(input: {
  readonly intent: IntentResult;
  readonly serviceType: string;
  readonly problemChips: string[];
  readonly description: string;
  readonly electricalPlaybookEnabled: boolean;
}): { intent: IntentResult; reconciled: boolean } {
  if (
    input.intent.service_type !== "unsupported" &&
    input.intent.scope_signal !== "out_of_scope"
  ) return { intent: input.intent, reconciled: false };

  const fallback = buildFallbackIntent(
    input.serviceType,
    input.problemChips,
    maskExplicitlyExcludedScopeForIntent(input.description),
    input.electricalPlaybookEnabled,
  );
  if (fallback.service_type === "unsupported") {
    return { intent: input.intent, reconciled: false };
  }
  const boundary = detectOutOfScope(input.description, fallback.service_type);
  const serviceEvidence = detectServiceMismatch(
    input.description,
    fallback.service_type,
  );
  if (boundary.detected || serviceEvidence.hits[fallback.service_type] < 2) {
    return { intent: input.intent, reconciled: false };
  }

  return {
    reconciled: true,
    intent: {
      ...input.intent,
      service_type: fallback.service_type,
      problem_slug: fallback.problem_slug,
      confidence: Math.min(input.intent.confidence, 0.5),
      scope_signal: "in_scope",
      suggested_service: null,
    },
  };
}

async function resolveIntakeDiagnosisResult(input: {
  prepared: PreparedKaelPipeline;
  intent: IntentResult;
  effectiveScopeSignal: string | null | undefined;
  intakeScope: ReturnType<typeof resolveIntakeScopeConsistency> | null;
  problemSlug: string | null;
  mergedSafetySignals: string[];
  intentModelId: string;
}) {
  const {
    prepared,
    intent,
    effectiveScopeSignal,
    intakeScope,
    problemSlug,
    mergedSafetySignals,
    intentModelId,
  } = input;
  const {
    input: pipelineInput,
    language,
    stageLogs,
    serviceType,
    electricalPlaybookEnabled,
    withDeterministicSafetyGuidance,
    recordProviderSpendIfEnforced,
  } = prepared;
  let profileFacts: Record<string, string> | undefined;
  let safetySignals: string[] | undefined = electricalPlaybookEnabled
    ? mergedSafetySignals
    : undefined;
  let intakeObservation: IntakeEvalObservation | undefined;
  if (!pipelineInput.intakeDiagnosisEnabled) {
    return { done: false as const, profileFacts, safetySignals, intakeObservation };
  }
  if (effectiveScopeSignal === "service_mismatch") {
    const suggestedService = intakeScope?.suggestedService ?? intent.suggested_service ?? null;
    await recordProviderSpendIfEnforced();
    return {
      done: true as const,
      response: {
        success: false as const,
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
          scopeSignal: "service_mismatch", suggestedService, problemSlug: null,
          needsClarification: false, safetySignals: mergedSafetySignals,
          modelId: intentModelId, serviceType, actorId: prepared.input.actorId, electricalPlaybookEnabled,
        }),
      },
    };
  }
  const coverage = resolveIntakeFactCoverage({
    serviceType: intent.service_type,
    problemSlug: problemSlug ?? intent.problem_slug,
    customerDescription: pipelineInput.description,
    profileFacts: { ...(pipelineInput.priorProfileFacts ?? {}), ...(intent.profile_facts ?? {}) },
    providerMissingSlots: intent.missing_slots ?? [],
    providerNeedsClarification: intent.needs_clarification,
    electricalPlaybookEnabled,
  });
  const unpricedSafetyMissing = coverage.missing.filter((slot) => slot.startsWith("safety_"));
  if (
    (pipelineInput.intakeQuoteMode === "rfq" || pipelineInput.intakeQuoteMode === "inspection_only") &&
    unpricedSafetyMissing.length === 0
  ) {
    profileFacts = coverage.facts;
    safetySignals = mergedSafetySignals;
    intakeObservation = buildIntakeObservation({
      scopeSignal: "in_scope", suggestedService: null, problemSlug,
      needsClarification: false, safetySignals, modelId: intentModelId,
      serviceType, actorId: prepared.input.actorId, electricalPlaybookEnabled,
    });
    return { done: false as const, profileFacts, safetySignals, intakeObservation };
  }
  if (coverage.needsClarification) {
    const firstMissing = coverage.missing[0] ?? "service_scope";
    const hasPriorProfileFact = Object.entries(pipelineInput.priorProfileFacts ?? {})
      .some(([key, value]) => typeof value === "string" && coverage.facts[key] === value.trim().slice(0, 500));
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
      done: true as const,
      response: {
        success: false as const,
        error: withDeterministicSafetyGuidance(question, mergedSafetySignals),
        code: "NEEDS_CLARIFICATION",
        stageLogs,
        clarification: {
          question,
          missingSlots: [firstMissing],
          customerSentiment: intent.customer_sentiment,
        },
        intakeObservation: buildIntakeObservation({
          scopeSignal: "in_scope", suggestedService: null, problemSlug,
          needsClarification: true, safetySignals: mergedSafetySignals,
          modelId: intentModelId, serviceType, actorId: prepared.input.actorId, electricalPlaybookEnabled,
        }),
      },
    };
  }
  profileFacts = coverage.facts;
  safetySignals = mergedSafetySignals;
  intakeObservation = buildIntakeObservation({
    scopeSignal: "in_scope", suggestedService: null, problemSlug,
    needsClarification: false, safetySignals, modelId: intentModelId,
    serviceType, actorId: prepared.input.actorId, electricalPlaybookEnabled,
  });
  return { done: false as const, profileFacts, safetySignals, intakeObservation };
}
