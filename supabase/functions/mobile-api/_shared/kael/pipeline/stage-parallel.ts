import type { ServiceType } from "../contracts/types.ts";
import { customerVisibleKaelProblemSummary } from "../language/user-facing-copy.ts";
import { applyLearnedComplexityRule } from "../learning/learning.ts";
import { pushPipelineStageLog } from "../learning/trace.ts";
import { KAEL_ROUTING_CONFIG } from "../kael-providers/routing.config.ts";
import { fetchBaselineCandidates } from "../tools/synthesis.ts";
import { analyzeDescription, buildFallbackVision } from "../tools/vision.ts";
import type { KaelKnowledgeContext } from "../tools/knowledge.ts";
import {
  asPriceKnowledgeClient,
  readPriceKnowledgeState,
} from "../evidence/live-price-knowledge.ts";
import { runKaelParallel } from "./orchestrator.ts";
import { runKaelMarketResearchStage } from "./stage-market-research.ts";
import type { EstimateParallelValue } from "./pipeline-parallel-types.ts";
import type { PreparedKaelPipeline } from "./prepare.ts";
import { updateKaelProgress } from "./streaming.ts";

type ParallelStageInput = {
  serviceType: ServiceType;
  problemSlug: string;
  knowledgeContext: KaelKnowledgeContext;
  fallbackUsed: boolean;
};

export async function runKaelParallelStage(
  prepared: PreparedKaelPipeline,
  input: ParallelStageInput,
) {
  const {
    input: pipelineInput,
    supabase,
    secrets,
    district,
    language,
    photoUrls,
    stageLogs,
    learningApplications,
    progressTarget,
    spendGate,
  } = prepared;
  const {
    serviceType,
    problemSlug,
    knowledgeContext,
  } = input;
  let fallbackUsed = input.fallbackUsed;
  const parallelBatch = await runParallelRequests(prepared, {
    serviceType,
    problemSlug,
    knowledgeContext,
  });

  const visionStage = parallelBatch.results.find((stage) =>
    stage.label === "vision"
  );
  const visionResult = visionStage?.value?.kind === "vision"
    ? visionStage.value.result
    : undefined;
  if (!visionStage || !visionResult) {
    throw new Error(visionStage?.failureReason ?? "vision stage failed");
  }
  const baselineStage = parallelBatch.results.find((stage) =>
    stage.label === "baseline"
  );
  const baselineResult = baselineStage?.value?.kind === "baseline"
    ? baselineStage.value.result
    : undefined;
  const fallbackComplexity = !visionResult.success && baselineResult?.success
    ? baselineResult.defaultComplexity
    : undefined;
  const analysis = visionResult.success
    ? visionResult.analysis
    : fallbackComplexity
    ? { ...visionResult.fallback, complexity_hint: fallbackComplexity }
    : visionResult.fallback;
  const visionAnalysisStatus = visionResult.success
    ? "analyzed" as const
    : photoUrls.length > 0
    ? "unavailable" as const
    : "not_provided" as const;
  const customerProblemSummary = customerVisibleKaelProblemSummary(
    analysis.problem_identified,
    language,
  );
  const visionSkipped = !visionResult.success && visionResult.skipped === true;
  fallbackUsed ||= !visionResult.success && !visionSkipped;
  if (!visionSkipped) {
    pushPipelineStageLog(stageLogs, pipelineInput, {
      stage: "vision",
      provider: visionResult.success
        ? visionResult.provider
        : visionResult.provider ?? KAEL_ROUTING_CONFIG.vision_analysis.primary.provider,
      model: visionResult.success
        ? visionResult.model
        : visionResult.model ?? KAEL_ROUTING_CONFIG.vision_analysis.primary.model,
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
    serviceType,
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
        service_type: serviceType,
        problem_slug: problemSlug,
        district,
        from_complexity: learnedComplexity.fromComplexity,
        to_complexity: learnedComplexity.newComplexity,
      },
    });
  }

  const knowledgeStage = parallelBatch.results.find((stage) =>
    stage.label === "price_knowledge"
  );
  const knowledgeState = knowledgeStage?.value?.kind === "price_knowledge"
    ? knowledgeStage.value.result
    : { serviceProblemId: null, problemLabelVi: null, active: null, gap: null, priorFindings: [] };
  const marketStage = await runKaelMarketResearchStage(prepared, {
    serviceType,
    problemSlug,
    knowledgeContext,
    analysis,
    visionAnalyzed: visionResult.success,
    complexity: effectiveComplexity,
    knowledgeState,
  });
  const parallelRun = {
    ...parallelBatch,
    results: [...parallelBatch.results, marketStage],
  };

  return {
    parallelRun,
    analysis,
    visionAnalysisStatus,
    customerProblemSummary,
    effectiveComplexity,
    fallbackUsed,
  };
}

async function runParallelRequests(
  prepared: PreparedKaelPipeline,
  input: Pick<ParallelStageInput, "serviceType" | "problemSlug" | "knowledgeContext">,
) {
  const {
    supabase,
    secrets,
    district,
    language,
    description,
    modelDescription,
    photoUrls,
    spendGate,
  } = prepared;
  return runKaelParallel<EstimateParallelValue>([
    {
      label: "vision",
      purpose: "vision_analysis",
      run: async () => ({
        kind: "vision" as const,
        result: await analyzeDescription(
          modelDescription,
          `${input.serviceType}: ${input.problemSlug}`,
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
          fallback: buildFallbackVision(
            `${input.serviceType}: ${input.problemSlug}`,
            language,
            photoUrls.length > 0,
            description,
          ),
          failureReason: "TIMEOUT",
        },
      }),
    },
    {
      label: "price_knowledge",
      purpose: "problem_synthesis",
      timeoutMs: KAEL_ROUTING_CONFIG.problem_synthesis.latencyBudgetMs,
      run: async () => ({
        kind: "price_knowledge" as const,
        result: await readPriceKnowledgeState(
          asPriceKnowledgeClient(supabase),
          input.serviceType,
          input.problemSlug,
        ),
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
          input.serviceType,
          input.problemSlug,
          district,
        ),
      }),
    },
  ]);
}
