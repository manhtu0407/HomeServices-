// P7 skill file: LS5-service-knowledge
import type { LearningSkillCandidate, LearningSkillInput } from "./registry.ts";

export function buildLS5ServiceKnowledgeCandidate(
  input: LearningSkillInput,
): LearningSkillCandidate {
  return {
    skill_id: "LS5",
    candidate_type: "service_knowledge_candidate",
    trigger: "post-A14",
    target: "advisory_pattern",
    effects: [],
    prompt_version: "ls5-service-knowledge.2026-05-25.v1",
    requires_manual_review: true,
    lifecycle_state: "manual_review",
    payload: {
      service_type: safeString(input.service_type, "unknown"),
      problem_slug: safeString(input.problem_slug, "unknown"),
      observed: {
        rating: safeNumber(input.rating),
        review_tags: safeStringArray(input.review_tags).slice(0, 5),
      },
      suggested: {
        signal: "service_knowledge_box_update",
        review_required: true,
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
