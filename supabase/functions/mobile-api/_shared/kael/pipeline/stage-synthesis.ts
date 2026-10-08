import type { ComplexityLevel, ServiceType } from "../contracts/types.ts";
import { applyLearnedPriceRule, clampLearnedPriceToBaseline } from "../learning/learning.ts";
import { pushPipelineStageLog } from "../learning/trace.ts";
import { KAEL_ROUTING_CONFIG } from "../kael-providers/routing.config.ts";
import {
  evaluateMarketVerdict,
  marketVerdictSafeMetadata,
} from "../tools/market-verdict.ts";
import { synthesizePrice, type BaselineResult } from "../tools/synthesis.ts";
import { hasVerifiedMarketQuorum } from "../evidence/live-price-knowledge.ts";
import { runKaelPurposeStage } from "./orchestrator.ts";
import type { PreparedKaelPipeline } from "./prepare.ts";
import type { runKaelParallelStage } from "./stage-parallel.ts";
import { updateKaelProgress } from "./streaming.ts";

type ParallelRun = Awaited<ReturnType<typeof runKaelParallelStage>>["parallelRun"];

export async function runKaelSynthesisStage(
  prepared: PreparedKaelPipeline,
  input: {
    parallelRun: ParallelRun;
    baselineResult: Extract<BaselineResult, { success: true }>;
    effectiveComplexity: ComplexityLevel;
    serviceType: ServiceType;
    problemSlug: string;
    fallbackUsed: boolean;
  },
) {
  const {
    input: pipelineInput,
    supabase,
    secrets,
    district,
    stageLogs,
    learningApplications,
    progressTarget,
  } = prepared;
  const marketStage = input.parallelRun.results.find((stage) =>
    stage.label === "market"
  );
  const marketResult = marketStage?.value?.kind === "market"
    ? marketStage.value.result
    : undefined;
  if (!marketStage || !marketResult) {
    throw new Error(marketStage?.failureReason ?? "market stage failed");
  }
  let fallbackUsed = input.fallbackUsed;
  fallbackUsed ||= !marketResult.success;
  // An unverified baseline cannot judge or dilute a verified market range.
  const marketAnchored = input.baselineResult.evidenceReceipt === null &&
    hasVerifiedMarketQuorum(marketResult);
  const marketVerdict = !marketAnchored && marketResult.success &&
      marketResult.safeMetadata?.source_trust_enabled === true
    ? evaluateMarketVerdict({
      baselineMin: input.baselineResult.priceMin,
      baselineMax: input.baselineResult.priceMax,
      market: marketResult.market,
      weakEvidence: marketResult.safeMetadata?.source_trust_quorum_met === false,
    })
    : null;

  void updateKaelProgress(supabase, progressTarget, {
    stage: "price_synthesis",
    status: "running",
    progress: 0.86,
  });
  // Clamp the learned price against the reference baseline at apply time. A rule
  // outside the permitted band is ignored, and synthesis falls back to baseline.
  const learnedPrice = marketAnchored ? null : clampLearnedPriceToBaseline(
    await applyLearnedPriceRule(
      supabase,
      secrets,
      input.serviceType,
      input.problemSlug,
      district,
    ),
    {
      priceMin: input.baselineResult.priceMin,
      priceMax: input.baselineResult.priceMax,
    },
  );
  if (learnedPrice) {
    learningApplications.push({
      ruleId: learnedPrice.ruleId,
      ruleVersion: learnedPrice.ruleVersion,
      skillId: "LS1",
      appliedTarget: "price_prior",
      safeMetadata: {
        service_type: input.serviceType,
        problem_slug: input.problemSlug,
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
        baselineMin: learnedPrice?.priceMin ?? input.baselineResult.priceMin,
        baselineMax: learnedPrice?.priceMax ?? input.baselineResult.priceMax,
        market: marketResult.success && marketVerdict?.verdict !== "reject"
          ? marketResult.market
          : null,
        complexityHint: input.effectiveComplexity,
        needsInspection: marketVerdict?.needsInspection === true,
        marketAnchored,
      })),
  });
  const synthesized = synthesizedStage.value;
  if (!synthesized) {
    throw new Error(synthesizedStage.failureReason ?? "synthesis stage failed");
  }
  pushPipelineStageLog(stageLogs, pipelineInput, {
    stage: "synthesis",
    latencyMs: synthesizedStage.elapsedMs,
    success: true,
    fallbackUsed: false,
    safeMetadata: marketVerdict
      ? marketVerdictSafeMetadata(marketVerdict)
      : marketAnchored
      ? { price_basis: "verified_market_sources" }
      : undefined,
  });
  await updateKaelProgress(supabase, progressTarget, {
    stage: "price_synthesis",
    status: "completed",
    progress: 1,
  });

  return {
    marketResult,
    marketVerdict,
    synthesized,
    fallbackUsed,
  };
}
