// P7 skill file: LS4-customer-preference
import type { LearningSkillCandidate, LearningSkillInput } from "./registry.ts";

export function buildLS4CustomerPreferenceCandidate(
  input: LearningSkillInput,
): LearningSkillCandidate {
  return {
    skill_id: "LS4",
    candidate_type: "customer_preference_signal",
    trigger: "post-A14",
    target: "analysis_prompt",
    effects: [],
    prompt_version: "ls4-customer-preference.2026-05-25.v1",
    requires_manual_review: false,
    lifecycle_state: "candidate",
    payload: {
      customer_id: safeString(input.customer_id, null),
      service_type: safeString(input.service_type, "unknown"),
      observed: {
        rating: safeNumber(input.rating),
        review_tags: safeStringArray(input.review_tags).slice(0, 5),
      },
      suggested: {
        signal: "customer_preference_memory",
      },
    },
  };
}

function safeString(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
