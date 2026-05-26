// P7 skill file: LS7-decline-reason
import type { LearningSkillCandidate, LearningSkillInput } from "./registry.ts";

export function buildLS7DeclineReasonCandidate(
  input: LearningSkillInput,
): LearningSkillCandidate {
  return {
    skill_id: "LS7",
    candidate_type: "decline_reason_candidate",
    trigger: "post-decline",
    target: "intent_category",
    effects: [],
    prompt_version: "ls7-decline-reason.2026-05-25.v1",
    requires_manual_review: true,
    lifecycle_state: "manual_review",
    payload: {
      decline_reason: safeString(input.decline_reason, "unspecified"),
      feedback_present: input.feedback_present === true,
      suggested: {
        signal: "decline_template_or_intent_update",
        review_required: true,
      },
    },
  };
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
