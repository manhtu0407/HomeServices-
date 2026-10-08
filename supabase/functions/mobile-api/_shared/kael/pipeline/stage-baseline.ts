import type {
  ComplexityLevel,
  IntakeEvalObservation,
  PipelineResult,
} from "../contracts/types.ts";
import { pushPipelineStageLog } from "../learning/trace.ts";
import { pickBaselineCandidate, type BaselineResult } from "../tools/synthesis.ts";
import { hasVerifiedMarketQuorum } from "../evidence/live-price-knowledge.ts";
import type { PreparedKaelPipeline } from "./prepare.ts";
import type { runKaelParallelStage } from "./stage-parallel.ts";
import { updateKaelProgress } from "./streaming.ts";

type ParallelRun = Awaited<ReturnType<typeof runKaelParallelStage>>["parallelRun"];
type BaselineStageOutcome =
  | {
    ok: false;
    failure: Extract<PipelineResult, { success: false }>;
  }
  | {
    ok: true;
    baselineResult: Extract<BaselineResult, { success: true }>;
    referenceBaseline: BaselineResult;
  };

export async function runKaelBaselineStage(
  prepared: PreparedKaelPipeline,
  input: {
    parallelRun: ParallelRun;
    effectiveComplexity: ComplexityLevel;
    referenceComplexity: ComplexityLevel;
    mergedSafetySignals: string[];
    intakeObservation: IntakeEvalObservation | undefined;
  },
): Promise<BaselineStageOutcome> {
  const {
    input: pipelineInput,
    supabase,
    language,
    stageLogs,
    progressTarget,
    withDeterministicSafetyGuidance,
    recordProviderSpendIfEnforced,
  } = prepared;
  const baselineStage = input.parallelRun.results.find((stage) =>
    stage.label === "baseline"
  );
  if (!baselineStage) {
    throw new Error("baseline stage failed");
  }
  const baselineCandidates = baselineStage.value?.kind === "baseline"
    ? baselineStage.value.result
    : undefined;
  // A missing or failed price lookup is an honest no-price outcome. Keep it in
  // the typed pipeline result so the intake observation survives the response
  // boundary instead of being discarded by the outer catch path.
  const pickedBaseline = pickBaselineCandidate(
    baselineCandidates ?? {
      success: false,
      error: baselineStage.failureReason ?? "baseline stage failed",
    },
    input.effectiveComplexity,
  );
  const baselineResult = pickedBaseline.success
    ? pickedBaseline
    : marketAnchoredBaseline(input.parallelRun) ?? pickedBaseline;
  // Second pick at the pre-learning complexity. effectiveComplexity may already have
  // been raised by an LS2 rule, so selecting on it would leave a learned input in the
  // reference band. Same rows, no extra I/O.
  const referenceBaseline = pickBaselineCandidate(
    baselineCandidates ?? {
      success: false,
      error: baselineStage.failureReason ?? "baseline stage failed",
    },
    input.referenceComplexity,
  );
  pushPipelineStageLog(stageLogs, pipelineInput, {
    stage: "baseline",
    latencyMs: baselineStage.elapsedMs,
    success: Boolean(baselineResult?.success),
    failureReason: baselineResult?.success
      ? undefined
      : baselineResult?.error ?? baselineStage.failureReason,
    fallbackUsed: false,
    safeMetadata: baselineResult?.success
      ? {
        baseline_price_evidence_receipt: baselineResult.evidenceReceipt,
        baseline_source: baselineResult.source,
        baseline_district: baselineResult.matchedDistrict,
        ...(baselineResult.marketAnchored ? { baseline_market_anchored: true } : {}),
      }
      : undefined,
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
      ok: false,
      failure: {
        success: false,
        error: withDeterministicSafetyGuidance(
          language === "en"
            ? "No reference price is available for this service. Please try again later."
            : "Không có dữ liệu giá tham khảo cho dịch vụ này. Vui lòng thử lại sau.",
          input.mergedSafetySignals,
        ),
        code: "NO_BASELINE" as const,
        stageLogs,
        intakeObservation: input.intakeObservation,
      },
    };
  }

  return { ok: true, baselineResult, referenceBaseline };
}

// A problem with no catalogue row can still be priced when live research met the Tier 1-2
// quorum. The anchor carries the verified range and no baseline receipt, so synthesis and
// the evidence gate treat it as market-sourced, never as a governed baseline.
function marketAnchoredBaseline(
  parallelRun: ParallelRun,
): Extract<BaselineResult, { success: true }> | null {
  const marketStage = parallelRun.results.find((stage) => stage.label === "market");
  const market = marketStage?.value?.kind === "market" ? marketStage.value.result : undefined;
  const knowledgeStage = parallelRun.results.find((stage) => stage.label === "price_knowledge");
  const serviceProblemId = knowledgeStage?.value?.kind === "price_knowledge"
    ? knowledgeStage.value.result.serviceProblemId
    : null;
  if (!serviceProblemId || !hasVerifiedMarketQuorum(market)) return null;
  return {
    success: true,
    priceMin: market.market.market_range_min,
    priceMax: market.market.market_range_max,
    serviceProblemId,
    matchedDistrict: "hcmc_all",
    evidenceReceipt: null,
    source: "verified_market_sources",
    marketAnchored: true,
  };
}
