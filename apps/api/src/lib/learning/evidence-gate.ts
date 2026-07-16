/**
 * Evidence Gate — gating logic for auto-promotion of learning candidates.
 *
 * Per STRUCTURES.md §10C, a candidate auto-promotes ONLY if:
 *   - evidence_count >= MIN_EVIDENCE
 *   - confidence >= CONFIDENCE_THRESHOLD
 *   - no major contradiction in recent similar cases
 *   - payload does NOT touch money/scope autonomy (defense in depth)
 *
 * `shouldPromote` is pure. `promoteCandidate` delegates the write set to one
 * serialized database transaction.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SERVICE_TYPES, type Database } from '@nestscout/shared'
import { withDbTimeout } from '@/lib/db/query'
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
  | { promoted: true; ruleId: string; ruleVersion: number }
  | { promoted: false; reason: string }

/**
 * Promote a candidate row to an active rule through the service-role-only RPC.
 * Candidate locking and scope locking keep the rule/version/audit write set
 * atomic and make timeout retries idempotent.
 *
 * Returns the new ruleId + version for caller to log via logJobEvent.
 */
export async function promoteCandidate(
  supabase: SupabaseClient<Database>,
  candidate: CandidateRow,
): Promise<PromoteResult> {
  const { data, error } = await withDbTimeout(
    supabase.rpc('auto_promote_learning_candidate_atomic', {
      p_candidate_id: candidate.id,
    }),
  )
  if (error) {
    return { promoted: false, reason: `promotion_rpc_failed:${error.code}` }
  }

  const result = data?.[0]
  if (!result?.ok || !result.rule_id || result.rule_version === null) {
    return {
      promoted: false,
      reason: result?.error_code ?? 'promotion_rpc_no_result',
    }
  }

  return {
    promoted: true,
    ruleId: result.rule_id,
    ruleVersion: result.rule_version,
  }
}
