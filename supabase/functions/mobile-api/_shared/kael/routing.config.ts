import type { AIProvider, KaelPurpose } from "./types.ts";
import { readKaelOptimizationFlags } from "./cost-tracking.ts";

export type ProviderRoute = {
  readonly provider: AIProvider;
  readonly model: string;
};

export type KaelPurposeRoutingConfig = {
  readonly purpose: KaelPurpose;
  readonly primary: ProviderRoute;
  readonly fallback?: ProviderRoute;
  readonly costCeilingUsd: number;
  readonly latencyBudgetMs: number;
  readonly userVisible: boolean;
  readonly dailyProviderCapUsd: number;
  readonly maxTokens: number;
};

const DAILY_PROVIDER_CAP_USD = 30;

const deepseek = (model = "deepseek-v4-flash"): ProviderRoute => ({
  provider: "deepseek",
  model,
});
const anthropic = (model = "claude-sonnet-4-6"): ProviderRoute => ({
  provider: "anthropic",
  model,
});
const perplexity = (model = "sonar"): ProviderRoute => ({
  provider: "perplexity",
  model,
});

export const KAEL_ROUTING_CONFIG: Record<KaelPurpose, KaelPurposeRoutingConfig> = Object.freeze({
  intent_classification: config("intent_classification", deepseek(), anthropic(), 0.001, 1_000, true, 50),
  vision_analysis: config("vision_analysis", anthropic(), undefined, 0.015, 4_500, true, 320),
  clarification: config("clarification", deepseek(), anthropic(), 0.003, 2_000, true, 100),
  problem_synthesis: config("problem_synthesis", deepseek(), anthropic(), 0.005, 3_000, true, 250),
  market_lookup: config("market_lookup", perplexity(), anthropic(), 0.002, 4_000, true, 300),
  price_synthesis: config("price_synthesis", perplexity(), anthropic(), 0.01, 3_000, true, 200),
  advisory_generation: config("advisory_generation", deepseek(), anthropic(), 0.004, 2_000, true, 150),
  worker_brief: config("worker_brief", deepseek(), anthropic(), 0.006, 3_000, false, 600),
  scope_change: config("scope_change", anthropic(), undefined, 0.01, 4_000, true, 500),
  post_job_learning: config("post_job_learning", deepseek(), anthropic(), 0.012, 15_000, false, 800),
  educational_response: config("educational_response", deepseek(), anthropic(), 0.003, 2_000, true, 500),
});

export function maxTokensForPurpose(
  purpose: KaelPurpose,
  legacyMaxTokens: number,
  getEnv?: (name: string) => string | undefined,
): number {
  const flags = readKaelOptimizationFlags(getEnv);
  if (!flags.KAEL_OPT_CAP_OUTPUT_ENABLED) return legacyMaxTokens;
  return KAEL_ROUTING_CONFIG[purpose].maxTokens;
}

function config(
  purpose: KaelPurpose,
  primary: ProviderRoute,
  fallback: ProviderRoute | undefined,
  costCeilingUsd: number,
  latencyBudgetMs: number,
  userVisible: boolean,
  maxTokens: number,
): KaelPurposeRoutingConfig {
  return {
    purpose,
    primary,
    fallback,
    costCeilingUsd,
    latencyBudgetMs,
    userVisible,
    dailyProviderCapUsd: DAILY_PROVIDER_CAP_USD,
    maxTokens,
  };
}
