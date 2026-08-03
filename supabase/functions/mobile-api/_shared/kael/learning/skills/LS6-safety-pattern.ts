// P7 skill file: LS6-safety-pattern
import type { LearningSkillCandidate, LearningSkillInput } from "./registry.ts";

export function buildLS6SafetyPatternCandidate(
  input: LearningSkillInput,
): LearningSkillCandidate {
  return {
    skill_id: "LS6",
    candidate_type: "safety_pattern_candidate",
    trigger: "admin-safety-tag",
    target: "detection_pattern",
    effects: [],
    prompt_version: "ls6-safety-pattern.2026-05-25.v1",
    requires_manual_review: true,
    lifecycle_state: "manual_review",
    payload: {
      service_type: safeString(input.service_type, "unknown"),
      admin_tag: safeString(input.admin_tag, "safety_review"),
      suggested: {
        signal: "worker_safety_or_legal_awareness_pattern",
        review_required: true,
      },
    },
  };
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
