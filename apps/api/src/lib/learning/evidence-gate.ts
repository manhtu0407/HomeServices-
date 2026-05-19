/**
 * Evidence Gate — gating logic for auto-promotion of learning candidates.
 *
 * Per STRUCTURES.md §10C, a candidate auto-promotes ONLY if:
 *   - evidence_count >= MIN_EVIDENCE
 *   - confidence >= CONFIDENCE_THRESHOLD
 *   - no major contradiction in recent similar cases
 *   - payload does NOT touch money/scope autonomy (defense in depth)
 *
 * `shouldPromote` is pure. `promoteCandidate` is the side-effect:
 * INSERT into learning_rules + learning_rule_versions, UPDATE candidate
 * to status='auto_promoted'.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ServiceType } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'
import {
  isPricePriorPayload,
  isAnalysisRulePayload,
  type LearningCandidatePayload,
  type CandidateType,
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
    const svc = payload.scope.service_type as string
    if (svc !== 'electrical' && svc !== 'plumbing' && svc !== 'cleaning') return true
    // Sanity: suggested.new_min must be positive integer; if negative, treat as
    // unsafe (would underflow baseline computation downstream).
    if (payload.suggested.new_min <= 0 || payload.suggested.new_max <= 0) return true
    if (payload.suggested.new_max < payload.suggested.new_min) return true
    return false
  }
  if (isAnalysisRulePayload(payload)) {
    const svc = payload.scope.service_type as string
    if (svc !== 'electrical' && svc !== 'plumbing' && svc !== 'cleaning') return true
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
  if (!isPricePriorPayload(candidate.suggested_payload) && !isAnalysisRulePayload(candidate.suggested_payload)) {
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
 * Promote a candidate row to an active rule. Three DB writes, intentionally not
 * RPC-wrapped because each is idempotent and races at this layer would only
 * produce duplicate rules (caller checks for existing active rule first).
 *
 * Returns the new ruleId + version for caller to log via logJobEvent.
 */
export async function promoteCandidate(
  supabase: SupabaseClient<Database>,
  candidate: CandidateRow,
): Promise<PromoteResult> {
  const ruleType: CandidateType = candidate.candidate_type as CandidateType
  const payload = candidate.suggested_payload as LearningCandidatePayload

  // Defense: candidate scope must be a supported service. Filter is also
  // applied via affected_service column being typed service_type (enum).
  const affectedService = candidate.affected_service as ServiceType | null
  if (!affectedService) {
    return { promoted: false, reason: 'missing_service_scope' }
  }

  // Step 1: check if active rule already exists for this scope (avoid dup).
  const { data: existingRule } = await withDbTimeout(
    supabase
      .from('learning_rules')
      .select('id, active_version')
      .eq('rule_type', ruleType)
      .eq('affected_service', affectedService)
      .eq('affected_problem', candidate.affected_problem ?? '')
      .eq('affected_district', candidate.affected_district ?? '')
      .eq('status', 'active')
      .maybeSingle(),
  )

  let ruleId: string
  let version: number

  if (existingRule) {
    // Update existing rule with new payload + version bump.
    version = existingRule.active_version + 1
    const { error: updErr } = await withDbTimeout(
      supabase
        .from('learning_rules')
        .update({
          rule_payload: payload as never,
          confidence: candidate.confidence,
          evidence_count: candidate.evidence_count,
          active_version: version,
        })
        .eq('id', existingRule.id),
    )
    if (updErr) {
      return { promoted: false, reason: `rule_update_failed:${updErr.code}` }
    }
    ruleId = existingRule.id
  } else {
    // Insert new rule.
    const { data: newRule, error: insErr } = await withDbTimeout(
      supabase
        .from('learning_rules')
        .insert({
          rule_type: ruleType,
          affected_service: affectedService,
          affected_problem: candidate.affected_problem,
          affected_district: candidate.affected_district,
          rule_payload: payload as never,
          confidence: candidate.confidence,
          evidence_count: candidate.evidence_count,
          status: 'active',
          active_version: 1,
          rollback_available: true,
        })
        .select('id, active_version')
        .single(),
    )
    if (insErr || !newRule) {
      return { promoted: false, reason: `rule_insert_failed:${insErr?.code ?? 'no_row'}` }
    }
    ruleId = newRule.id
    version = newRule.active_version
  }

  // Step 2: insert immutable version snapshot.
  const { error: verErr } = await withDbTimeout(
    supabase.from('learning_rule_versions').insert({
      rule_id: ruleId,
      version,
      rule_payload: payload as never,
      change_reason: `auto_promoted from candidate ${candidate.id} (n=${candidate.evidence_count}, conf=${candidate.confidence})`,
      status: 'active',
    }),
  )
  if (verErr) {
    console.warn('Promote: version insert failed (rule still active)', {
      ruleId,
      errorCode: verErr.code,
    })
  }

  // Step 3: mark candidate as auto_promoted (audit trail).
  const { error: candErr } = await withDbTimeout(
    supabase
      .from('learning_candidates')
      .update({
        status: 'auto_promoted',
        promoted_at: new Date().toISOString(),
        audit_reason: `gate_passed; ruleId=${ruleId}; version=${version}`,
      })
      .eq('id', candidate.id),
  )
  if (candErr) {
    console.warn('Promote: candidate status update failed', {
      candidateId: candidate.id,
      errorCode: candErr.code,
    })
  }

  return { promoted: true, ruleId, ruleVersion: version }
}
