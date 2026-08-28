import type { PipelineResult, ServiceType } from "../contracts/types.ts";
import { priceDisclaimer } from "../contracts/types.ts";
import { buildSafetyFirstElectricalEstimate } from "../kael-guardrails/electrical-intake-policy.ts";
import { buildAdvisory } from "../tools/advisory.ts";
import { marketVerdictReason } from "../tools/market-verdict.ts";
import type { BaselineResult } from "../tools/synthesis.ts";
import type { PreparedKaelPipeline } from "./prepare.ts";
import type { runKaelKnowledgeStage } from "./stage-knowledge.ts";
import type { runKaelParallelStage } from "./stage-parallel.ts";
import type { runKaelSynthesisStage } from "./stage-synthesis.ts";

type SuccessfulPipelineResult = Extract<PipelineResult, { success: true }>;
type ParallelStage = Awaited<ReturnType<typeof runKaelParallelStage>>;
type SynthesisStage = Awaited<ReturnType<typeof runKaelSynthesisStage>>;
type KnowledgeContext = Awaited<ReturnType<typeof runKaelKnowledgeStage>>["knowledgeContext"];

type AssemblyInput = Pick<
  ParallelStage,
  | "analysis"
  | "visionAnalysisStatus"
  | "customerProblemSummary"
  | "effectiveComplexity"
> & Pick<SynthesisStage, "marketResult" | "marketVerdict" | "synthesized"> & {
  fallbackUsed: boolean;
  baselineResult: Extract<BaselineResult, { success: true }>;
  referenceBaseline: BaselineResult;
  serviceType: ServiceType;
  problemSlug: string;
  customerSentiment: SuccessfulPipelineResult["customerSentiment"];
  profileFacts: SuccessfulPipelineResult["profileFacts"];
  safetySignals: SuccessfulPipelineResult["safetySignals"];
  intakeObservation: SuccessfulPipelineResult["intakeObservation"];
  knowledgeContext: KnowledgeContext;
  mergedSafetySignals: string[];
};

export async function assembleKaelPipeline(
  prepared: PreparedKaelPipeline,
  input: AssemblyInput,
): Promise<SuccessfulPipelineResult> {
  const {
    language,
    stageLogs,
    learningApplications,
    electricalPlaybookEnabled,
    recordProviderSpendIfEnforced,
  } = prepared;
  await recordProviderSpendIfEnforced();

  return {
    success: true,
    fallbackUsed: input.fallbackUsed,
    stageLogs,
    serviceProblemId: input.baselineResult.serviceProblemId,
    referencePriceMin: input.referenceBaseline.success
      ? input.referenceBaseline.priceMin
      : undefined,
    referencePriceMax: input.referenceBaseline.success
      ? input.referenceBaseline.priceMax
      : undefined,
    customerSentiment: input.customerSentiment,
    profileFacts: input.profileFacts,
    safetySignals: input.safetySignals,
    visionAnalysis: {
      analysisStatus: input.visionAnalysisStatus,
      evidenceFindings: (input.analysis.evidence_findings ?? []).map((finding) => ({
        confidence: finding.confidence,
        evidenceIndex: finding.evidence_index,
        observation: finding.observation,
        possibleMeaning: finding.possible_meaning,
      })),
      problemSummary: input.customerProblemSummary,
      recommendedScope: input.analysis.recommended_scope ?? null,
      remainingUncertainty: input.analysis.remaining_uncertainty ?? null,
      severityIndicators: input.analysis.severity_indicators,
    },
    intakeObservation: input.intakeObservation,
    knowledgeContext: input.knowledgeContext.safeMetadata
      ? input.knowledgeContext
      : undefined,
    learningApplications,
    estimate: buildSafetyFirstElectricalEstimate({
      service_type: input.serviceType,
      problem_category: input.problemSlug,
      problem_summary: input.customerProblemSummary,
      complexity: input.effectiveComplexity,
      price_min: input.synthesized.price_min,
      price_max: input.synthesized.price_max,
      confidence: input.synthesized.confidence,
      advisory: buildAdvisory(
        input.analysis.severity_indicators,
        input.knowledgeContext.safetyGuidance,
        language,
      ),
      disclaimer: priceDisclaimer(language),
      needs_inspection: input.marketVerdict?.needsInspection === true,
      price_source: input.marketVerdict?.needsInspection
        ? "inspection_required"
        : undefined,
      needs_inspection_reason: input.marketVerdict
        ? marketVerdictReason(input.marketVerdict, language)
        : undefined,
      market_signals: input.marketResult.success
        ? input.marketResult.market.sources_summary ?? null
        : null,
    }, electricalPlaybookEnabled ? input.mergedSafetySignals : [], language, input.serviceType),
  };
}
