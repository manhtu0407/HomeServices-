/**
 * `runLearningHook` — orchestrator called from the review route when a job
 * transitions to `reviewed`. Fetches the job context, invokes both observers
 * (MarketMemory + CaseReview), and if `LEARNING_AUTOPROMOTE_ENABLED`, runs the
 * evidence gate on each fresh candidate.
 *
 * Phase 1 contract:
 *   - Failures here NEVER block the customer review response.
 *   - Caller wraps in try/catch and swallows.
 *   - Returns a summary for optional event logging.
 *
 * Why synchronous (vs. queue/cron): keeps the loop simple. At pre-revenue
 * scale a single Supabase round-trip per A14 review is fine. The
 * `withDbTimeout` wrappers ensure the path can't hang.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeServiceAreaDistrict, type Database, type ServiceType, type ComplexityLevel } from '@nestscout/shared'
import { withDbTimeout } from '@/lib/db/query'
import { env } from '@/lib/env'
import { observeFinalPrice } from './market-memory'
import { observeReview } from './case-review'
import { shouldPromote, promoteCandidate, type CandidateRow } from './evidence-gate'
import type { LearningHookInput } from './types'

// =============================================================================
// Result type (returned for caller to log; never used for control flow)
// =============================================================================

export type LearningHookSummary = {
  ok: boolean
  marketCandidateId?: string
  marketEvidence?: number
  marketPromoted?: { ruleId: string; ruleVersion: number }
  caseCandidateId?: string
  caseEvidence?: number
  casePromoted?: { ruleId: string; ruleVersion: number }
  skippedReason?: string
}

// =============================================================================
// Internal: fetch full hook input for a job
// =============================================================================

async function loadHookInput(
  supabase: SupabaseClient<Database>,
  jobId: string,
): Promise<LearningHookInput | null> {
  // Single query: join jobs + reviews. scope_change_requests checked separately
  // (one extra round-trip; acceptable at low volume).
  const { data: job, error: jobErr } = await withDbTimeout(
    supabase
      .from('jobs')
      .select(
        'id, service_type, address_district, kael_complexity, kael_price_min, kael_price_max, kael_problem_identified, final_price, reviewed_at, status, service_problem_id',
      )
      .eq('id', jobId)
      .maybeSingle(),
  )

  if (jobErr || !job) return null

  // Must be a reviewed job — otherwise no signal.
  if (job.status !== 'reviewed' || !job.reviewed_at) return null

  // Need the review for rating + tags.
  const { data: review } = await withDbTimeout(
    supabase
      .from('reviews')
      .select('rating, tags')
      .eq('job_id', jobId)
      .maybeSingle(),
  )

  // Resolve problem slug. Prefer service_problem_id join when present;
  // fall back to kael_problem_identified for older rows.
  let problemSlug = job.kael_problem_identified ?? null
  if (job.service_problem_id) {
    const { data: problem } = await withDbTimeout(
      supabase
        .from('service_problems')
        .select('slug')
        .eq('id', job.service_problem_id)
        .maybeSingle(),
    )
    if (problem?.slug) problemSlug = problem.slug
  }

  if (!problemSlug) return null
  if (!job.kael_complexity || !job.kael_price_min || !job.kael_price_max) return null
  const districtCode = normalizeServiceAreaDistrict(job.address_district)
  if (!districtCode) return null

  // Detect scope change presence (any row).
  const { count: scopeChangeCount } = await withDbTimeout(
    supabase
      .from('scope_change_requests')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId),
  )

  return {
    jobId,
    serviceType: job.service_type as ServiceType,
    problemSlug,
    districtCode,
    complexityHint: job.kael_complexity as ComplexityLevel,
    baselineMin: job.kael_price_min,
    baselineMax: job.kael_price_max,
    finalPrice: job.final_price,
    rating: review?.rating ?? 0,
    reviewTags: (review?.tags as string[] | null) ?? [],
    scopeChangeRequested: (scopeChangeCount ?? 0) > 0,
    reviewedAt: job.reviewed_at,
  }
}

// =============================================================================
// Internal: after observe, evaluate gate + promote if eligible
// =============================================================================

async function maybePromote(
  supabase: SupabaseClient<Database>,
  candidateId: string,
): Promise<{ ruleId: string; ruleVersion: number } | null> {
  if (!env.learningAutopromoteEnabled) return null

  // Fetch the freshly-updated candidate row.
  const { data: candidate, error } = await withDbTimeout(
    supabase
      .from('learning_candidates')
      .select(
        'id, candidate_type, affected_service, affected_problem, affected_district, suggested_payload, confidence, evidence_count, status',
      )
      .eq('id', candidateId)
      .maybeSingle(),
  )

  if (error || !candidate) return null
  if (candidate.status === 'auto_promoted') return null  // already promoted

  // Need a service scope to be promotable.
  const affectedService = candidate.affected_service as ServiceType | null
  if (!affectedService) return null

  // Fetch similar recent candidates for contradiction check.
  const { data: similar } = await withDbTimeout(
    supabase
      .from('learning_candidates')
      .select(
        'id, candidate_type, affected_service, affected_problem, affected_district, suggested_payload, confidence, evidence_count, status',
      )
      .eq('candidate_type', candidate.candidate_type)
      .eq('affected_service', affectedService)
      .eq('affected_problem', candidate.affected_problem ?? '')
      .eq('affected_district', candidate.affected_district ?? '')
      .neq('id', candidate.id)
      .limit(50),
  )

  const decision = shouldPromote(candidate as CandidateRow, (similar as CandidateRow[] | null) ?? [])

  if (!decision.promote) {
    // Record gate evaluation in audit_reason for admin visibility. Status is
    // only bumped to 'pending_evidence' when evidence_count actually meets the
    // threshold — i.e. candidate has enough data but failed on confidence /
    // contradiction / forbidden / shape. For `insufficient_evidence`, status
    // stays `created` (still accumulating). The observe() functions own the
    // created↔pending_evidence transition based on count.
    const bumpStatus = decision.reason !== 'insufficient_evidence'
    const update: { audit_reason: string; status?: 'pending_evidence' } = {
      audit_reason: `gate evaluated: ${decision.reason}`,
    }
    if (bumpStatus) update.status = 'pending_evidence'
    await withDbTimeout(
      supabase
        .from('learning_candidates')
        .update(update)
        .eq('id', candidateId),
    )
    return null
  }

  // The RPC owns the evidence_gate_passed checkpoint and promotion write set;
  // keeping both in one transaction avoids a stranded intermediate status.
  const result = await promoteCandidate(supabase, candidate as CandidateRow)
  if (!result.promoted) return null
  return { ruleId: result.ruleId, ruleVersion: result.ruleVersion }
}

// =============================================================================
// Public entry
// =============================================================================

/**
 * Orchestrate one learning cycle for a reviewed job.
 *
 * Caller pattern (review route):
 *
 *   await runLearningHook(supabase, jobId).catch((err) => {
 *     console.warn('Learning hook failed', { jobId, errorCode: 'LEARNING_FAILED' })
 *   })
 *
 * Throws nothing externally — all errors are captured in the summary.
 */
export async function runLearningHook(
  supabase: SupabaseClient<Database>,
  jobId: string,
): Promise<LearningHookSummary> {
  const summary: LearningHookSummary = { ok: false }

  const input = await loadHookInput(supabase, jobId)
  if (!input) {
    summary.skippedReason = 'insufficient_job_context'
    return summary
  }

  // MarketMemoryService
  const marketResult = await observeFinalPrice(supabase, input)
  if (marketResult.ok) {
    summary.marketCandidateId = marketResult.candidateId
    summary.marketEvidence = marketResult.evidenceCount
    const promoted = await maybePromote(supabase, marketResult.candidateId)
    if (promoted) summary.marketPromoted = promoted
  }

  // CaseReviewService
  const caseResult = await observeReview(supabase, input)
  if (caseResult.ok) {
    summary.caseCandidateId = caseResult.candidateId
    summary.caseEvidence = caseResult.evidenceCount
    const promoted = await maybePromote(supabase, caseResult.candidateId)
    if (promoted) summary.casePromoted = promoted
  }

  summary.ok = marketResult.ok || caseResult.ok
  return summary
}
