import type { SupabaseClient } from '@supabase/supabase-js'
import { REVIEW_TAGS, type Database } from '@nestscout/shared'
import { postgresNullableRpcArg, withDbTimeout } from '@/lib/db/query'
import type { LearningHookInput } from './types'

export type LearningObservationCandidateType = 'price_prior_update' | 'analysis_rule'

export type LearningObservationResult =
  | { ok: true; candidateId: string; isNew: boolean; confidence: number; evidenceCount: number }
  | { ok: false; reason: string }

function canonicalReviewTags(reviewTags: string[]): string[] {
  return REVIEW_TAGS.filter((tag) => reviewTags.includes(tag))
}

function rejectionReason(errorCode: string | null): string {
  if (!errorCode) return 'rpc_rejected:unknown'
  if (errorCode === 'NO_SIGNAL_YET') return 'no_signal_yet'
  return `rpc_rejected:${errorCode.toLowerCase()}`
}

export async function recordLearningObservation(
  supabase: SupabaseClient<Database>,
  candidateType: LearningObservationCandidateType,
  input: LearningHookInput,
): Promise<LearningObservationResult> {
  const { data, error } = await withDbTimeout(
    supabase.rpc('record_learning_observation_atomic', {
      p_job_id: input.jobId,
      p_candidate_type: candidateType,
      p_affected_service: input.serviceType,
      p_affected_problem: input.problemSlug,
      p_affected_district: input.districtCode,
      p_complexity: input.complexityHint,
      p_baseline_min: input.baselineMin,
      p_baseline_max: input.baselineMax,
      p_final_price: postgresNullableRpcArg(input.finalPrice),
      p_rating: input.rating,
      p_review_tags: canonicalReviewTags(input.reviewTags),
      p_scope_change_requested: input.scopeChangeRequested,
      p_reviewed_at: input.reviewedAt,
    }),
  )

  if (error) return { ok: false, reason: `rpc_failed:${error.code ?? 'unknown'}` }
  const row = data?.[0]
  if (!row) return { ok: false, reason: 'rpc_failed:no_row' }
  if (!row.ok) return { ok: false, reason: rejectionReason(row.error_code) }
  if (!row.candidate_id) return { ok: false, reason: 'rpc_failed:missing_candidate' }

  return {
    ok: true,
    candidateId: row.candidate_id,
    isNew: row.is_new,
    confidence: row.confidence,
    evidenceCount: row.evidence_count,
  }
}
