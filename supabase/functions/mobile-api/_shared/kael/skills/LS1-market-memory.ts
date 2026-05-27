// P7 skill file: LS1-market-memory
import type { LearningSkillCandidate, LearningSkillInput } from "./registry.ts";
import { buildLS1Aggregation, type LS1PriceSample } from "./LS1-aggregation.ts";

export function buildLS1MarketMemoryCandidate(
  input: LearningSkillInput,
): LearningSkillCandidate {
  const aggregation = buildLS1Aggregation(readPriceSamples(input));
  return {
    skill_id: "LS1",
    candidate_type: "price_prior_update",
    trigger: "post-A14",
    target: "price_prior",
    effects: [],
    prompt_version: "ls1-market-memory.2026-05-25.v1",
    requires_manual_review: false,
    lifecycle_state: "candidate",
    payload: {
      scope: safeScope(input),
      observed: {
        baseline_min: safeNumber(input.baseline_min),
        baseline_max: safeNumber(input.baseline_max),
        final_price: safeNumber(input.final_price),
        reviewed_at: safeString(input.reviewed_at, null),
      },
      suggested: {
        signal: "price_prior_candidate",
        ...(aggregation ? { aggregation } : {}),
      },
    },
  };
}

function readPriceSamples(input: LearningSkillInput): LS1PriceSample[] {
  const value = Array.isArray(input.market_samples)
    ? input.market_samples
    : Array.isArray(input.price_samples)
    ? input.price_samples
    : [];
  return value
    .map((item) => typeof item === "object" && item !== null
      ? item as LS1PriceSample
      : null)
    .filter((item): item is LS1PriceSample => item !== null);
}

function safeScope(input: LearningSkillInput) {
  return {
    service_type: safeString(input.service_type, "unknown"),
    problem_slug: safeString(input.problem_slug, "unknown"),
    district_code: safeString(input.district_code, "unknown"),
    complexity: safeString(input.complexity, "unknown"),
  };
}

function safeString(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
