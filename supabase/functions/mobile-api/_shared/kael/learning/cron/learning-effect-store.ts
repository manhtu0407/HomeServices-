import type {
  LearningQueueDbClient,
} from "./process-learning-queue.ts";
import type {
  LearningEvidenceSnapshot,
  LearningLifecycleState,
} from "../skills/registry.ts";
import type { BatchLearningCandidateStatus } from "./batch-learning-lifecycle.ts";

export type LearningEffectCandidate = {
  skill_id: string;
  candidate_type: string;
  target: string;
  effects: string[];
  suggested_payload: Record<string, unknown>;
  rule_payload: Record<string, unknown> | null;
  affected_service: string | null;
  affected_problem: string | null;
  affected_district: string | null;
  confidence: number;
  evidence_count: number;
  status: BatchLearningCandidateStatus;
  audit_reason: string;
  prompt_version: string;
  requires_manual_review: boolean;
};

export type LearningEffectPlan = {
  schema: "kael_learning_effect.v1";
  mode: "none" | "candidate" | "promotion";
  candidate: LearningEffectCandidate | null;
  lifecycle: {
    gate_state: LearningLifecycleState;
    lifecycle_state: LearningLifecycleState;
    gate_reason: string;
    evidence: LearningEvidenceSnapshot;
    evidence_source: "completed_reviewed_jobs" | "candidate_payload";
    scope_rejected: boolean;
    promotion_deferred_reason: string | null;
  } | null;
};

const NO_LEARNING_EFFECT: LearningEffectPlan = {
  schema: "kael_learning_effect.v1",
  mode: "none",
  candidate: null,
  lifecycle: null,
};

export type LearningEffectCommitInput = {
  sourceMode: "anthropic_batch" | "deepseek_direct";
  batchId: string;
  itemId: string;
  queueId: string;
  ownerToken: string;
  itemStatus: "succeeded" | "errored";
  responsePayload: Record<string, unknown>;
  errorPayload: Record<string, unknown>;
  queueState: "processed" | "manual_review" | "rejected" | "failed";
  queueErrorCode: string | null;
  processedAt: string;
  effect: LearningEffectPlan | null;
};

export async function commitLearningEffectResult(
  client: LearningQueueDbClient,
  input: LearningEffectCommitInput,
): Promise<{ ok: true } | { ok: false; errorCode: string }> {
  if (!client.rpc) {
    return { ok: false, errorCode: "LEARNING_EFFECT_COMMIT_RPC_UNAVAILABLE" };
  }
  try {
    const result = await client.rpc("commit_kael_learning_effect_atomic", {
      p_source_mode: input.sourceMode,
      p_batch_id: input.batchId,
      p_item_id: input.itemId,
      p_queue_id: input.queueId,
      p_owner_token: input.ownerToken,
      p_item_status: input.itemStatus,
      p_response_payload: input.responsePayload,
      p_error_payload: input.errorPayload,
      p_queue_state: input.queueState,
      p_queue_error_code: input.queueErrorCode,
      p_processed_at: input.processedAt,
      p_effect_payload: input.effect ?? NO_LEARNING_EFFECT,
    });
    if (result.error) {
      return { ok: false, errorCode: commitFailureCode(result.error.code) };
    }
    return { ok: true };
  } catch {
    return { ok: false, errorCode: commitFailureCode("throw") };
  }
}

// A duplicate-scope 23505, a permission denial, and a lost claim all surface here.
// Without the SQLSTATE the batch only ever reports "commit failed", which is not
// enough to tell a retryable conflict from a broken grant. kael_ai_batches.error_code
// is capped at 80 characters.
function commitFailureCode(sqlState: string | undefined): string {
  return `LEARNING_EFFECT_COMMIT_FAILED:${sqlState ?? "unknown"}`.slice(0, 80);
}
