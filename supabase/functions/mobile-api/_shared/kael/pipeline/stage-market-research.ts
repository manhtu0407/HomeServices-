import type { ComplexityLevel, ServiceType, VisionResult } from "../contracts/types.ts";
import {
  asPriceKnowledgeClient,
  buildMarketResearchInput,
  marketResultFromGap,
  marketResultFromKnowledge,
  recordCaseKnowledge,
  recordPriceKnowledgeGapDemand,
  recordPriceKnowledgeOutcome,
  recordPriceKnowledgeReuse,
  researchFingerprint,
  type PriceKnowledgeState,
} from "../evidence/live-price-knowledge.ts";
import { KAEL_ROUTING_CONFIG } from "../kael-providers/routing.config.ts";
import { marketLookupTelemetry, searchMarketPrice } from "../tools/market.ts";
import type { MarketLookupResult } from "../tools/market-provider.ts";
import type { KaelKnowledgeContext } from "../tools/knowledge.ts";
import { runKaelPurposeStage, type KaelStageRunResult } from "./orchestrator.ts";
import type { EstimateParallelValue } from "./pipeline-parallel-types.ts";
import type { PreparedKaelPipeline } from "./prepare.ts";
import { pushPipelineStageLog } from "../learning/trace.ts";
import { updateKaelProgress } from "./streaming.ts";

// Price research runs after vision so the photo findings shape the query. Verified results
// and recent gaps are reused, so the same problem is never researched twice in a row.
// The market log is written as soon as research ends, before the baseline decides whether
// the case can be priced, so a no-price reply can always state what the search found.
export async function runKaelMarketResearchStage(
  prepared: PreparedKaelPipeline,
  input: Parameters<typeof researchMarketPrice>[1],
): Promise<KaelStageRunResult<EstimateParallelValue>> {
  const stage = await researchMarketPrice(prepared, input);
  const result = stage.value?.kind === "market" ? stage.value.result : null;
  if (!result) return stage;
  pushPipelineStageLog(prepared.stageLogs, prepared.input, {
    stage: "market",
    provider: result.provider ?? "perplexity",
    model: result.model ?? "sonar",
    latencyMs: stage.elapsedMs,
    success: result.success,
    failureReason: result.success ? undefined : result.failureReason,
    fallbackUsed: !result.success,
    inputTokens: result.success ? result.inputTokens : undefined,
    outputTokens: result.success ? result.outputTokens : undefined,
    costUsd: result.success ? result.costUsd : undefined,
    cacheStatus: result.success ? result.cacheStatus : undefined,
    safeMetadata: result.safeMetadata,
  });
  void updateKaelProgress(prepared.supabase, prepared.progressTarget, {
    stage: "market_lookup",
    status: result.success ? "completed" : "failed",
    progress: 0.78,
    failureReason: result.success ? undefined : result.failureReason,
  });
  return stage;
}

async function researchMarketPrice(
  prepared: PreparedKaelPipeline,
  input: {
    serviceType: ServiceType;
    problemSlug: string;
    knowledgeContext: KaelKnowledgeContext;
    analysis: VisionResult;
    visionAnalyzed: boolean;
    complexity: ComplexityLevel;
    knowledgeState: PriceKnowledgeState;
  },
): Promise<KaelStageRunResult<EstimateParallelValue>> {
  const started = Date.now();
  const client = asPriceKnowledgeClient(prepared.supabase);
  const photosAnalyzed = input.visionAnalyzed && prepared.photoUrls.length > 0;
  const research = buildMarketResearchInput({
    serviceType: input.serviceType,
    problemSlug: input.problemSlug,
    problemLabelVi: input.knowledgeState.problemLabelVi,
    customerDetail: prepared.description,
    analysis: input.visionAnalyzed ? input.analysis : null,
  });
  const fingerprint = await researchFingerprint({
    serviceType: input.serviceType,
    problemSlug: input.problemSlug,
    photoCount: prepared.photoUrls.length,
  });
  const { active, gap } = input.knowledgeState;
  if (active) {
    await recordPriceKnowledgeReuse(client, active);
    return marketStage(marketResultFromKnowledge(active), Date.now() - started);
  }
  if (gap && gap.researchFingerprint === fingerprint) {
    await recordPriceKnowledgeGapDemand(client, gap);
    return marketStage(marketResultFromGap(gap), Date.now() - started);
  }

  const marketTelemetry = marketLookupTelemetry({
    serviceType: input.serviceType,
    problem: input.problemSlug,
    complexity: input.complexity,
    district: prepared.district,
    secrets: prepared.secrets,
  });
  const stage = await runKaelPurposeStage<EstimateParallelValue>({
    label: "market",
    purpose: "market_lookup",
    timeoutMs: marketTelemetry.timeoutMs ?? KAEL_ROUTING_CONFIG.market_lookup.latencyBudgetMs,
    run: async () => ({
      kind: "market" as const,
      result: await searchMarketPrice(
        input.serviceType,
        input.problemSlug,
        input.complexity,
        prepared.district,
        prepared.secrets,
        prepared.supabase,
        {
          knowledgeContext: input.knowledgeContext,
          gate: prepared.spendGate,
          research: {
            problemLabelVi: research.problemLabelVi,
            customerDetail: research.customerDetail,
            visualFindings: photosAnalyzed ? research.visualFindings : [],
            recommendedScope: research.recommendedScope,
            priorFindings: input.knowledgeState.priorFindings,
          },
        },
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
  });
  const result = stage.value?.kind === "market" ? stage.value.result : null;
  if (!result) return stage;

  const outcome = await recordPriceKnowledgeOutcome(client, {
    serviceType: input.serviceType,
    problemSlug: input.problemSlug,
    serviceProblemId: input.knowledgeState.serviceProblemId,
    fingerprint,
    result,
    existingGap: gap,
  });
  if (photosAnalyzed) {
    await recordCaseKnowledge(client, {
      serviceType: input.serviceType,
      problemSlug: input.problemSlug,
      analysis: input.analysis,
      complexity: input.complexity,
      priceKnowledgeId: outcome.status === "active" ? outcome.knowledgeId : null,
    });
  }
  return {
    ...stage,
    value: {
      kind: "market",
      result: withKnowledgeOutcome(result, outcome),
    },
  };
}

function withKnowledgeOutcome(
  result: MarketLookupResult,
  outcome: Awaited<ReturnType<typeof recordPriceKnowledgeOutcome>>,
): MarketLookupResult {
  if (outcome.status === "skipped") return result;
  return {
    ...result,
    safeMetadata: {
      ...(result.safeMetadata ?? {}),
      kael_price_knowledge_id: outcome.knowledgeId,
      kael_price_knowledge_result: outcome.status === "active" ? "recorded" : "gap_recorded",
    },
  };
}

function marketStage(
  result: MarketLookupResult,
  elapsedMs: number,
): KaelStageRunResult<EstimateParallelValue> {
  return {
    label: "market",
    purpose: "market_lookup",
    status: result.success ? "ok" : "degraded",
    value: { kind: "market", result },
    elapsedMs,
    fallbackUsed: !result.success,
  };
}
