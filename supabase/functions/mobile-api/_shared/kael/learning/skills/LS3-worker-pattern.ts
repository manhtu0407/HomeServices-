// P7 skill file: LS3-worker-pattern
import type { LearningSkillCandidate, LearningSkillInput } from "./registry.ts";

export function buildLS3WorkerPatternCandidate(
  input: LearningSkillInput,
): LearningSkillCandidate {
  return {
    skill_id: "LS3",
    candidate_type: "worker_pattern_signal",
    trigger: input.scope_change_requested === true ? "post-B6" : "post-B7",
    target: "detection_pattern",
    effects: [],
    prompt_version: "ls3-worker-pattern.2026-05-25.v1",
    requires_manual_review: false,
    lifecycle_state: "candidate",
    payload: {
      worker_id: safeString(input.worker_id, null),
      job_id: safeString(input.job_id, null),
      observed: {
        scope_change_requested: input.scope_change_requested === true,
        completion_reported: input.scope_change_requested !== true,
        has_evidence_photos: workerReportHasPhotos(input.worker_report),
      },
      suggested: {
        signal: "worker_reliability_pattern",
      },
    },
  };
}

function safeString(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function workerReportHasPhotos(value: unknown): boolean {
  return typeof value === "object" && value !== null &&
    (value as Record<string, unknown>).has_photos === true;
}
