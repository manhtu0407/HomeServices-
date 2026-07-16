import {
  type LearningLifecycleState,
} from "../skills/registry.ts";

export type BatchLearningCandidateStatus =
  | "created"
  | "pending_evidence"
  | "evidence_gate_passed"
  | "manual_review"
  | "auto_promoted"
  | "rejected";

export function candidateStatusForGate(
  nextState: LearningLifecycleState,
  promote: boolean,
): BatchLearningCandidateStatus {
  if (nextState === "manual_review") return "manual_review";
  if (promote) return "evidence_gate_passed";
  if (nextState === "rejected") return "rejected";
  return "pending_evidence";
}
