// P7 skill file: LS1-market-memory
import type { LearningSkillCandidate, LearningSkillInput } from "./registry.ts";

export function buildLS1MarketMemoryCandidate(
  input: LearningSkillInput,
): LearningSkillCandidate {
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
      },
    },
  };
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
