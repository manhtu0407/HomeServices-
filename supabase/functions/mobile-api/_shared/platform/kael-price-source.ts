type EstimatePriceSource =
  | "perplexity_validated"
  | "baseline_with_market"
  | "baseline_only";
type PipelineStageLog = {
  stage: string;
  success: boolean;
  fallbackUsed?: boolean;
};

export function estimatePriceSourceFromStageLogs(
  logs: PipelineStageLog[],
): EstimatePriceSource {
  const market = logs.find((stage) => stage.stage === "market");
  if (market?.success && !market.fallbackUsed) return "perplexity_validated";
  if (market?.success) return "baseline_with_market";
  return "baseline_only";
}
