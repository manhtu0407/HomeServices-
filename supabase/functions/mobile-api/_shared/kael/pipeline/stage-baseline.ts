import type {
  ComplexityLevel,
  IntakeEvalObservation,
  PipelineResult,
} from "../contracts/types.ts";
import { pushPipelineStageLog } from "../learning/trace.ts";
import { pickBaselineCandidate, type BaselineResult } from "../tools/synthesis.ts";
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
  if (baselineStage.status === "failed" && baselineStage.failureReason !== "TIMEOUT") {
    throw new Error(baselineStage.failureReason ?? "baseline stage failed");
  }
  const baselineResult = pickBaselineCandidate(
    baselineCandidates ?? {
      success: false,
      error: baselineStage.failureReason ?? "baseline stage failed",
    },
    input.effectiveComplexity,
  );
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
