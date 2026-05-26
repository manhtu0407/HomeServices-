// P7 skill file: LS2-case-review
import type { LearningSkillCandidate, LearningSkillInput } from "./registry.ts";

export function buildLS2CaseReviewCandidate(
  input: LearningSkillInput,
): LearningSkillCandidate {
  return {
    skill_id: "LS2",
    candidate_type: "case_review_pattern",
    trigger: "post-A14",
    target: "clarification_pattern",
    effects: [],
    prompt_version: "ls2-case-review.2026-05-25.v1",
    requires_manual_review: false,
    lifecycle_state: "candidate",
    payload: {
      scope: {
        service_type: safeString(input.service_type, "unknown"),
        problem_slug: safeString(input.problem_slug, "unknown"),
        district_code: safeString(input.district_code, "unknown"),
      },
      observed: {
        rating: safeNumber(input.rating),
        scope_change_requested: input.scope_change_requested === true,
        review_tags: safeStringArray(input.review_tags).slice(0, 5),
      },
      suggested: {
        signal: "clarification_or_advisory_candidate",
      },
    },
  };
}

function safeString(value: unknown, fallback: string): string {
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
