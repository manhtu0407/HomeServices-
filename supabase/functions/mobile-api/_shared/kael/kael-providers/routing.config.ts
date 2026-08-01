import type { AIProvider, KaelPurpose } from "../types.ts";
import { readKaelOptimizationFlags } from "../kael-usage/cost-tracking.ts";

export type ProviderRoute = {
  readonly provider: AIProvider;
  readonly model: string;
};

export type EscalationTrigger = {
  readonly minConfidence?: number;
  readonly highStakes?: boolean;
};

export type KaelPurposeRoutingConfig = {
  readonly purpose: KaelPurpose;
  readonly primary: ProviderRoute;
  readonly modelFallback?: ProviderRoute;
  readonly fallback?: ProviderRoute;
  readonly escalation?: ProviderRoute;
  readonly escalationTrigger: EscalationTrigger;
  readonly costCeilingUsd: number;
  readonly latencyBudgetMs: number;
  readonly userVisible: boolean;
  readonly dailyProviderCapUsd: number;
  readonly maxTokens: number;
};

const DAILY_PROVIDER_CAP_USD = 30;
const LOW_CONFIDENCE_ESCALATION = Object.freeze({ minConfidence: 0.82 });
const HIGH_STAKES_ESCALATION = Object.freeze({
  minConfidence: 0.82,
  highStakes: true,
});
const NO_ESCALATION_TRIGGER = Object.freeze({});

const deepseek = (model = "deepseek-v4-flash"): ProviderRoute => ({
  provider: "deepseek",
  model,
});
const anthropic = (model = "claude-sonnet-5"): ProviderRoute => ({
  provider: "anthropic",
  model,
});
const perplexity = (model = "sonar"): ProviderRoute => ({
  provider: "perplexity",
  model,
});

export const KAEL_ROUTING_CONFIG: Record<KaelPurpose, KaelPurposeRoutingConfig> = Object.freeze({
  intent_classification: config("intent_classification", deepseek(), anthropic(), 0.001, 4_000, true, 50, {
    modelFallback: deepseek("deepseek-v4-pro"),
  }),
  vision_analysis: config("vision_analysis", anthropic(), undefined, 0.015, 4_500, true, 320, {
    escalation: {
      route: anthropic("claude-opus-4-8"),
      trigger: LOW_CONFIDENCE_ESCALATION,
    },
  }),
  clarification: config("clarification", deepseek(), anthropic("claude-haiku-4-5-20251001"), 0.003, 2_000, true, 100, {
    modelFallback: deepseek("deepseek-v4-pro"),
  }),
  problem_synthesis: config("problem_synthesis", deepseek(), anthropic(), 0.005, 3_000, true, 250, {
    modelFallback: deepseek("deepseek-v4-pro"),
  }),
  market_lookup: config("market_lookup", perplexity(), undefined, 0.002, 4_000, true, 300, {
    escalation: {
      route: perplexity("sonar-pro"),
      trigger: LOW_CONFIDENCE_ESCALATION,
    },
  }),
  price_synthesis: config("price_synthesis", anthropic(), undefined, 0.01, 3_000, true, 200),
  advisory_generation: config("advisory_generation", deepseek(), anthropic("claude-haiku-4-5-20251001"), 0.004, 2_000, true, 150, {
    modelFallback: deepseek("deepseek-v4-pro"),
  }),
  worker_brief: config("worker_brief", deepseek(), anthropic(), 0.006, 3_000, false, 600, {
    modelFallback: deepseek("deepseek-v4-pro"),
  }),
  scope_change: config("scope_change", anthropic(), undefined, 0.01, 20_000, true, 500, {
    escalation: {
      route: anthropic("claude-opus-4-8"),
      trigger: HIGH_STAKES_ESCALATION,
    },
  }),
  job_incident: config("job_incident", deepseek(), anthropic(), 0.004, 5_000, true, 250, {
    modelFallback: deepseek("deepseek-v4-pro"),
  }),
  post_job_learning: config("post_job_learning", deepseek("deepseek-v4-pro"), anthropic(), 0.012, 15_000, false, 800),
  educational_response: config("educational_response", deepseek(), anthropic("claude-haiku-4-5-20251001"), 0.003, 6_000, true, 500, {
    modelFallback: deepseek("deepseek-v4-pro"),
  }),
  worker_assist: config("worker_assist", deepseek(), anthropic(), 0.004, 5_000, true, 180, {
    modelFallback: deepseek("deepseek-v4-pro"),
  }),
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
  options: {
    readonly modelFallback?: ProviderRoute;
    readonly escalation?: {
      readonly route: ProviderRoute;
      readonly trigger: EscalationTrigger;
    };
  } = {},
): KaelPurposeRoutingConfig {
  return {
    purpose,
    primary,
    modelFallback: options.modelFallback,
    fallback,
    escalation: options.escalation?.route,
    escalationTrigger: options.escalation?.trigger ?? NO_ESCALATION_TRIGGER,
    costCeilingUsd,
    latencyBudgetMs,
    userVisible,
    dailyProviderCapUsd: DAILY_PROVIDER_CAP_USD,
    maxTokens,
  };
}
