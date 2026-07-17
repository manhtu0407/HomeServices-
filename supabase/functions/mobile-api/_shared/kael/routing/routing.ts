import { KAEL_ROUTING_CONFIG, type ProviderRoute } from "./routing.config.ts";
import { KAEL_PURPOSES, type AIProvider, type KaelPurpose } from "../types.ts";
import { KAEL_CIRCUIT_BREAKER } from "../guards/circuit-breaker.ts";

export type ProviderChoice = ProviderRoute & {
  readonly purpose: KaelPurpose;
  readonly role: "primary" | "fallback";
  readonly score: number;
  readonly costCeilingUsd: number;
  readonly latencyBudgetMs: number;
};

export type ChooseProviderOptions = {
  readonly blockedProviders?: readonly AIProvider[];
  readonly attemptedProviders?: readonly AIProvider[];
  readonly estimatedCostUsd?: number;
  readonly now?: Date;
  readonly isCircuitOpen?: (purpose: KaelPurpose, provider: AIProvider, now?: Date) => boolean;
};

export type CircuitAwareProviderOptions = Omit<ChooseProviderOptions, "isCircuitOpen">;

export function chooseProvider(
  purposeInput: string,
  options: ChooseProviderOptions = {},
): ProviderChoice {
  const purpose = parseKaelPurpose(purposeInput);
  const config = KAEL_ROUTING_CONFIG[purpose];
  const estimatedCostUsd = options.estimatedCostUsd ?? 0;
  if (estimatedCostUsd > config.costCeilingUsd) {
    throw new Error(`COST_CEILING_EXCEEDED:${purpose}`);
  }

  const blocked = new Set(options.blockedProviders ?? []);
  const attempted = new Set(options.attemptedProviders ?? []);
  const candidates = providerCandidatesForPurpose(purpose, options)
    .filter((candidate) => !blocked.has(candidate.provider))
    .filter((candidate) => !attempted.has(candidate.provider))
    .filter((candidate) => !options.isCircuitOpen?.(purpose, candidate.provider, options.now));

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best) throw new Error(`NO_PROVIDER_AVAILABLE:${purpose}`);
  return best;
}

export function providerCandidatesForPurpose(
  purposeInput: string,
  options: ChooseProviderOptions = {},
): ProviderChoice[] {
  const purpose = parseKaelPurpose(purposeInput);
  const config = KAEL_ROUTING_CONFIG[purpose];
  const routes: ProviderChoice[] = [
    {
      ...config.primary,
      purpose,
      role: "primary",
      score: 100,
      costCeilingUsd: config.costCeilingUsd,
      latencyBudgetMs: config.latencyBudgetMs,
    },
  ];
  if (config.fallback) {
    routes.push({
      ...config.fallback,
      purpose,
      role: "fallback",
      score: 80,
      costCeilingUsd: config.costCeilingUsd,
      latencyBudgetMs: config.latencyBudgetMs,
    });
  }
  const blocked = new Set(options.blockedProviders ?? []);
  const attempted = new Set(options.attemptedProviders ?? []);
  return routes
    .filter((route) => !blocked.has(route.provider))
    .filter((route) => !attempted.has(route.provider))
    .filter((route) => !options.isCircuitOpen?.(purpose, route.provider, options.now));
}

export function chooseCircuitAwareProvider(
  purposeInput: string,
  options: CircuitAwareProviderOptions = {},
): ProviderChoice {
  return chooseProvider(purposeInput, withCircuitBreaker(options));
}

export function chooseCircuitAwareProviderOrNull(
  purposeInput: string,
  options: CircuitAwareProviderOptions = {},
): ProviderChoice | null {
  try {
    return chooseCircuitAwareProvider(purposeInput, options);
  } catch (error) {
    if (error instanceof Error && /^NO_PROVIDER_AVAILABLE:/.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export function circuitAwareProviderCandidatesForPurpose(
  purposeInput: string,
  options: CircuitAwareProviderOptions = {},
): ProviderChoice[] {
  return providerCandidatesForPurpose(purposeInput, withCircuitBreaker(options));
}

export function parseKaelPurpose(value: string): KaelPurpose {
  if ((KAEL_PURPOSES as readonly string[]).includes(value)) {
    return value as KaelPurpose;
  }
  throw new Error(`INVALID_PURPOSE:${value}`);
}

function withCircuitBreaker(
  options: CircuitAwareProviderOptions,
): ChooseProviderOptions {
  return {
    ...options,
    isCircuitOpen: (purpose, provider, now) =>
      KAEL_CIRCUIT_BREAKER.isOpen(purpose, provider, now ?? options.now),
  };
}
