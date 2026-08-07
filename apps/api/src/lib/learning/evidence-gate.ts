/**
 * Evidence gate for manual review. `promoteCandidate` is a compatibility name:
 * it queues administrator review and never activates a canonical rule.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SERVICE_TYPES, type Database } from '@nestscout/shared'
import { withDbTimeout } from '@/lib/db/query'
import { harnessSha256 } from '../harness-hash'
import {
  isPricePriorPayload,
  isAnalysisRulePayload,
} from './types'

// =============================================================================
// Thresholds (exported so tests can reference exact values)
// =============================================================================

export const MIN_EVIDENCE = 5
export const CONFIDENCE_THRESHOLD = 0.6
export const CONTRADICTION_MAX_RATIO = 0.2
export const ROLLING_WINDOW_DAYS = 90

// =============================================================================
// Types used by gate logic
// =============================================================================

export type CandidateRow = {
  id: string
  candidate_type: string
  affected_service: string | null
  affected_problem: string | null
  affected_district: string | null
  suggested_payload: unknown          // jsonb — must be validated before use
  confidence: number
  evidence_count: number
  status: string
}

export type GateDecision =
  | { promote: true; reason: 'gate_passed' }
  | {
      promote: false
      reason:
        | 'insufficient_evidence'
        | 'low_confidence'
        | 'contradicted_by_recent'
        | 'forbidden_autonomy'
        | 'invalid_payload'
    }

// =============================================================================
// Pure logic
// =============================================================================

/**
 * Detect whether two price_prior candidates point in opposite shift directions.
 * Used for the contradiction count.
 */
function oppositeDirection(a: CandidateRow, b: CandidateRow): boolean {
  if (!isPricePriorPayload(a.suggested_payload) || !isPricePriorPayload(b.suggested_payload)) {
    return false
  }
  const aDir = a.suggested_payload.suggested.direction
  const bDir = b.suggested_payload.suggested.direction
  return (
    (aDir === 'underestimate' && bDir === 'overestimate') ||
    (aDir === 'overestimate' && bDir === 'underestimate')
  )
}

/**
 * Defense-in-depth payload safety check. Per STRUCTURES.md §10F and RULES.md #7,
 * learning must NEVER autonomously touch money or expand service scope.
 */
function touchesMoneyOrScope(payload: unknown): boolean {
  if (isPricePriorPayload(payload)) {
    // Allowed: shift baselines via rule_payload. Forbidden: payload encoding any
    // mutation of jobs.final_price or service scope expansion. Schema constraints
    // already prevent this; runtime double-check.
    if (!SERVICE_TYPES.includes(payload.scope.service_type)) return true
    // Sanity: suggested.new_min must be positive integer; if negative, treat as
    // unsafe (would underflow baseline computation downstream).
    if (payload.suggested.new_min <= 0 || payload.suggested.new_max <= 0) return true
    if (payload.suggested.new_max < payload.suggested.new_min) return true
    return false
  }
  if (isAnalysisRulePayload(payload)) {
    if (!SERVICE_TYPES.includes(payload.scope.service_type)) return true
    // Allowed suggestion kinds are explicitly enumerated in types.ts.
    // Any unknown kind is rejected as potentially unsafe.
    const k = payload.suggested.kind
    if (k !== 'raise_complexity_prior' && k !== 'add_advisory' && k !== 'add_clarification') {
      return true
    }
    return false
  }
  // Unknown payload shape — refuse promotion.
  return true
}

export function shouldPromote(
  candidate: CandidateRow,
  similarRecent: CandidateRow[],
): GateDecision {
  // Validate payload first — invalid shapes are never promoted.
  const payload = candidate.suggested_payload
  if (!isPricePriorPayload(payload) && !isAnalysisRulePayload(payload)) {
    return { promote: false, reason: 'invalid_payload' }
  }
  if (
    payload.candidate_type !== candidate.candidate_type ||
    payload.scope.service_type !== candidate.affected_service ||
    payload.scope.problem_slug !== candidate.affected_problem ||
    payload.scope.district_code !== candidate.affected_district
  ) {
    return { promote: false, reason: 'invalid_payload' }
  }

  if (candidate.evidence_count < MIN_EVIDENCE) {
    return { promote: false, reason: 'insufficient_evidence' }
  }

  if (candidate.confidence < CONFIDENCE_THRESHOLD) {
    return { promote: false, reason: 'low_confidence' }
  }

  // Contradiction only applies to price_prior candidates (analysis_rule has no
  // directional axis we currently track). For analysis_rule, similarRecent is
  // ignored and contradiction check is a no-op.
  if (similarRecent.length > 0) {
    const contradictions = similarRecent.filter((s) => oppositeDirection(s, candidate)).length
    const ratio = contradictions / similarRecent.length
    if (ratio > CONTRADICTION_MAX_RATIO) {
      return { promote: false, reason: 'contradicted_by_recent' }
    }
  }

  if (touchesMoneyOrScope(candidate.suggested_payload)) {
    return { promote: false, reason: 'forbidden_autonomy' }
  }

  return { promote: true, reason: 'gate_passed' }
}

// =============================================================================
// Side-effect: promote a candidate to an active rule
// =============================================================================

export type PromoteResult =
  | { promoted: false; reason: string; queuedForReview?: boolean }

type QueueManualReviewRpcRow = {
  ok: boolean
  error_code: string | null
  candidate_id: string
  status: string | null
}

type QueueManualReviewRpcResponse = {
  data: QueueManualReviewRpcRow[] | null
  error: { code?: string | null } | null
}

type QueueManualReviewRpc = (
  name: 'queue_learning_candidate_manual_review',
  args: Record<string, unknown>,
) => PromiseLike<QueueManualReviewRpcResponse>

/**
 * Queue a gate-passed candidate for explicit administrator review. The legacy
 * function name remains for reference-surface compatibility, but automatic
 * activation is forbidden.
 */
export async function promoteCandidate(
  supabase: SupabaseClient<Database>,
  candidate: CandidateRow,
): Promise<PromoteResult> {
  const payload = JSON.stringify(candidate.suggested_payload)
  const queueManualReview = supabase.rpc as unknown as QueueManualReviewRpc
  const { data, error } = await withDbTimeout(
    queueManualReview('queue_learning_candidate_manual_review', {
      p_candidate_id: candidate.id,
      p_source_hash: harnessSha256(`candidate:${candidate.id}`),
      p_consent_hash: harnessSha256('admin_review_required'),
      p_input_hash: harnessSha256(payload),
      p_evidence_hash: harnessSha256(`${candidate.evidence_count}:${candidate.confidence}:${payload}`),
      p_release_id: process.env.HARNESS_RELEASE_ID ?? 'unreleased',
      p_safe_metadata: {
        gate_reason: 'gate_passed',
        automatic_promotion: false,
        source_kind: 'reviewed_job_aggregate',
        consent_basis: 'aggregate_only',
        pii_redacted: true,
        raw_text_persisted: false,
        summary_origin: 'model_generated',
      },
    }),
  )
  if (error) {
    return { promoted: false, reason: `manual_review_rpc_failed:${error.code ?? 'UNKNOWN'}` }
  }
  const result = data?.[0]
  if (!result?.ok) {
    return { promoted: false, reason: result?.error_code ?? 'manual_review_rpc_no_result' }
  }
  return { promoted: false, reason: 'MANUAL_REVIEW_REQUIRED', queuedForReview: true }
}