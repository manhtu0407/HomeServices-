import type { AIProvider, KaelPurpose } from "../contracts/types.ts";
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
  readonly simpleNormalChatPrimary?: ProviderRoute;
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

const DEEPSEEK_V4_FLASH_MODEL = "deepseek-v4-flash";
const DEEPSEEK_V4_PRO_MODEL = "deepseek-v4-pro";

const deepseek = (model = DEEPSEEK_V4_PRO_MODEL): ProviderRoute => ({
  provider: "deepseek",
  model,
});
const deepseekFlash = (): ProviderRoute => deepseek(DEEPSEEK_V4_FLASH_MODEL);
const anthropic = (model = "claude-sonnet-5"): ProviderRoute => ({
  provider: "anthropic",
  model,
});
const perplexity = (model = "sonar"): ProviderRoute => ({
  provider: "perplexity",
  model,
});
const perplexityFastSearch = (): ProviderRoute => ({
  provider: "perplexity",
  model: "pplx-fast-search",
});

export const KAEL_ROUTING_CONFIG: Record<KaelPurpose, KaelPurposeRoutingConfig> = Object.freeze({
  // Staging telemetry over 2699 successful calls put this route at p50 3.4s / p90 4.0s / p99 5.8s,
  // so the previous 4s budget sat on top of its own p90 and converted ordinary jitter into TIMEOUT.
  intent_classification: config("intent_classification", deepseek(), anthropic(), 0.001, 8_000, true, 50),
  vision_analysis: config("vision_analysis", anthropic(), undefined, 0.015, 10_000, true, 1_300, {
    modelFallback: anthropic("claude-haiku-4-5-20251001"),
    escalation: {
      route: anthropic("claude-opus-4-8"),
      trigger: LOW_CONFIDENCE_ESCALATION,
    },
  }),
  clarification: config("clarification", deepseek(), anthropic("claude-haiku-4-5-20251001"), 0.003, 2_000, true, 100),
  problem_synthesis: config("problem_synthesis", deepseek(), anthropic(), 0.005, 3_000, true, 250),
  market_lookup: config("market_lookup", perplexity(), undefined, 0.002, 4_000, true, 300, {
    escalation: {
      route: perplexity("sonar-pro"),
      trigger: LOW_CONFIDENCE_ESCALATION,
    },
  }),
  price_synthesis: config("price_synthesis", anthropic(), undefined, 0.01, 3_000, true, 200),
  advisory_generation: config("advisory_generation", deepseek(), anthropic("claude-haiku-4-5-20251001"), 0.004, 2_000, true, 150),
  worker_brief: config("worker_brief", deepseek(), anthropic(), 0.006, 3_000, false, 600),
  scope_change: config("scope_change", anthropic(), deepseek(), 0.01, 20_000, true, 500, {
    escalation: {
      route: anthropic("claude-opus-4-8"),
      trigger: HIGH_STAKES_ESCALATION,
    },
  }),
  job_incident: config("job_incident", deepseek(), anthropic(), 0.004, 5_000, true, 250),
  post_job_learning: config("post_job_learning", deepseek(), anthropic(), 0.012, 15_000, false, 800),
  educational_response: config("educational_response", deepseek(), anthropic("claude-haiku-4-5-20251001"), 0.003, 6_000, true, 500, {
    simpleNormalChatPrimary: deepseekFlash(),
  }),
  worker_assist: config("worker_assist", deepseek(), anthropic(), 0.004, 5_000, true, 180, {
    simpleNormalChatPrimary: deepseekFlash(),
  }),
  normal_chat_vision: config("normal_chat_vision", anthropic("claude-sonnet-5-5"), undefined, 0.025, 15_000, false, 600, {
    modelFallback: anthropic("claude-sonnet-5"),
  }),
  normal_chat_response: config("normal_chat_response", deepseek(), undefined, 0.01, 12_000, true, 1_500, {
    simpleNormalChatPrimary: deepseekFlash(),
    modelFallback: deepseekFlash(),
  }),
  normal_chat_memory: config("normal_chat_memory", deepseek("deepseek-v4-flash"), undefined, 0.005, 8_000, false, 800),
  normal_chat_search: config("normal_chat_search", perplexityFastSearch(), undefined, 0.001, 8_000, false, 5),
  normal_chat_suggestions: config("normal_chat_suggestions", deepseekFlash(), undefined, 0.005, 8_000, false, 350),
});

export function maxTokensForPurpose(
  purpose: KaelPurpose,
  legacyMaxTokens: number,
  getEnv?: (name: string) => string | undefined,
): number {
  const flags = readKaelOptimizationFlags(getEnv);
  if (!flags.KAEL_OPT_CAP_OUTPUT_ENABLED) return legacyMaxTokens;
  return Math.min(legacyMaxTokens, KAEL_ROUTING_CONFIG[purpose].maxTokens);
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
    readonly simpleNormalChatPrimary?: ProviderRoute;
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
    simpleNormalChatPrimary: options.simpleNormalChatPrimary,
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
