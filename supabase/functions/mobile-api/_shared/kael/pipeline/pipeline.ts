import type { EdgeAiSecrets, PipelineInput, PipelineResult, SupabaseLike } from "../contracts/types.ts";
import { assembleKaelPipeline } from "./assemble.ts";
import { prepareKaelPipeline } from "./prepare.ts";
import { runKaelIntentStage } from "./stage-intent.ts";
import { runKaelBaselineStage } from "./stage-baseline.ts";
import { runKaelKnowledgeStage } from "./stage-knowledge.ts";
import { runKaelParallelStage } from "./stage-parallel.ts";
import { runKaelSynthesisStage } from "./stage-synthesis.ts";
export async function runKaelPipeline(
  input: PipelineInput,
  supabase: SupabaseLike,
  secrets: EdgeAiSecrets,
): Promise<PipelineResult> {  const prepared = await prepareKaelPipeline(input, supabase, secrets);
  if ("success" in prepared) return prepared;
  const intentStage = await runKaelIntentStage(prepared);
  if (!("intent" in intentStage)) return intentStage;
  const {
    intent,
    validServiceType,
    problemSlug,
    mergedSafetySignals,
    profileFacts,
    safetySignals,
    intakeObservation,
    fallbackUsed: intentFallbackUsed,
  } = intentStage;
  let fallbackUsed = intentFallbackUsed ?? false;
  if (!intent || !validServiceType || !problemSlug) {
    throw new Error("intent stage normalization failed");
  }
  const { knowledgeContext } = await runKaelKnowledgeStage(prepared, {
    serviceType: validServiceType,
    problemSlug,
  });

  const parallelStage = await runKaelParallelStage(prepared, {
    serviceType: validServiceType,
    problemSlug,
    knowledgeContext,
    fallbackUsed,
  });
  const {
    parallelRun,
    analysis,
    visionAnalysisStatus,
    customerProblemSummary,
    effectiveComplexity,
  } = parallelStage;
  fallbackUsed = parallelStage.fallbackUsed;

  const baselineStage = await runKaelBaselineStage(prepared, {
    parallelRun,
    effectiveComplexity,
    referenceComplexity: analysis.complexity_hint,
    mergedSafetySignals,
    intakeObservation,
  });
  if (!baselineStage.ok) return baselineStage.failure;
  const { baselineResult, referenceBaseline } = baselineStage;
  const synthesisStage = await runKaelSynthesisStage(prepared, {
    parallelRun,
    baselineResult,
    effectiveComplexity,
    serviceType: validServiceType,
    problemSlug,
    fallbackUsed,
  });
  const { marketResult, marketVerdict, synthesized } = synthesisStage;
  fallbackUsed = synthesisStage.fallbackUsed;
  return assembleKaelPipeline(prepared, {
    analysis,
    visionAnalysisStatus,
    customerProblemSummary,
    effectiveComplexity,
    marketResult,
    marketVerdict,
    synthesized,
    fallbackUsed,
    baselineResult,
    referenceBaseline,
    serviceType: validServiceType,
    problemSlug,
    customerSentiment: input.intakeDiagnosisEnabled
      ? intent.customer_sentiment
      : undefined,
    profileFacts,
    safetySignals,
    intakeObservation,
    knowledgeContext,
    mergedSafetySignals,
  });
}
