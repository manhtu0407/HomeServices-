import type {
  CustomerProfileInsightsResponse,
  EarningsResponse,
  WorkerJobListResponse,
  WorkerPerformanceInsightsResponse,
  WorkerProfileResponse,
} from '../api-types'

export function sameCustomerProfileInsights(left: CustomerProfileInsightsResponse | null, right: CustomerProfileInsightsResponse) {
  if (!left) return false
  return left.customer_id === right.customer_id
    && left.member_since === right.member_since
    && left.kael_interaction_count === right.kael_interaction_count
    && left.completed_service_count === right.completed_service_count
    && left.saved_address_count === right.saved_address_count
    && left.preferred_service_count === right.preferred_service_count
    && left.active_service_days === right.active_service_days
    && left.active_streak_days === right.active_streak_days
    && left.reviewed_service_count === right.reviewed_service_count
    && left.positive_review_rate_percent === right.positive_review_rate_percent
    && left.price_savings_vnd === right.price_savings_vnd
    && left.total_spend_vnd === right.total_spend_vnd
    && left.usage_rank_level === right.usage_rank_level
    && left.usage_rank_points === right.usage_rank_points
    && left.fair_price_service_count === right.fair_price_service_count
    && left.money_protection_score === right.money_protection_score
    && left.protected_value_vnd === right.protected_value_vnd
    && left.protected_transaction_count === right.protected_transaction_count
    && left.total_transaction_count === right.total_transaction_count
    && left.dispute_free_rate_percent === right.dispute_free_rate_percent
    && left.fair_price_status === right.fair_price_status
}

export function sameWorkerProfile(left: WorkerProfileResponse | null, right: WorkerProfileResponse) {
  if (!left) return false
  return left.id === right.id
    && left.avatar_url === right.avatar_url
    && left.active_minutes === right.active_minutes
    && left.last_active_at === right.last_active_at
    && left.verification_status === right.verification_status
    && left.is_available === right.is_available
    && left.is_approved === right.is_approved
    && left.is_suspended === right.is_suspended
    && left.years_experience === right.years_experience
    && left.rating === right.rating
    && left.total_jobs === right.total_jobs
    && left.home_lat === right.home_lat
    && left.home_lng === right.home_lng
    && left.service_radius_km === right.service_radius_km
    && left.legal_name === right.legal_name
    && left.date_of_birth === right.date_of_birth
    && left.gender === right.gender
    && left.bank_account_masked === right.bank_account_masked
    && left.bank_name === right.bank_name
    && left.has_cccd === right.has_cccd
    && left.has_selfie === right.has_selfie
    && sameStringArray(left.service_types, right.service_types)
    && sameStringArray(left.districts, right.districts)
    && sameStringArray(left.problem_specializations, right.problem_specializations)
}

export function sameWorkerEarnings(left: EarningsResponse | null, right: EarningsResponse) {
  if (!left) return false
  return left.worker_id === right.worker_id
    && left.total_jobs_paid === right.total_jobs_paid
    && left.gross_earnings === right.gross_earnings
    && left.platform_fee_total === right.platform_fee_total
    && left.net_earnings === right.net_earnings
    && left.pending_payment_count === right.pending_payment_count
    && left.pending_payment_amount === right.pending_payment_amount
    && sameWorkerDailyEarnings(left.daily_earnings, right.daily_earnings)
    && left.from_date === right.from_date
    && left.to_date === right.to_date
}

export function sameWorkerPerformanceInsights(left: WorkerPerformanceInsightsResponse | null, right: WorkerPerformanceInsightsResponse) {
  if (!left) return false
  return left.worker_id === right.worker_id
    && left.completed_job_count === right.completed_job_count
    && left.review_count === right.review_count
    && left.average_rating === right.average_rating
    && left.response_rate_percent === right.response_rate_percent
    && left.average_response_minutes === right.average_response_minutes
    && left.on_time_rate_percent === right.on_time_rate_percent
    && left.total_broadcast_count === right.total_broadcast_count
    && left.responded_broadcast_count === right.responded_broadcast_count
    && left.accepted_broadcast_count === right.accepted_broadcast_count
    && left.scheduled_arrival_job_count === right.scheduled_arrival_job_count
    && left.on_time_job_count === right.on_time_job_count
    && left.paid_job_count === right.paid_job_count
    && left.reconciled_earnings_vnd === right.reconciled_earnings_vnd
    && left.work_response_review_count === right.work_response_review_count
    && left.resolved_incident_case_count === right.resolved_incident_case_count
    && left.incident_rank_bonus === right.incident_rank_bonus
    && left.performance_score === right.performance_score
    && sameWorkerPerformanceBadges(left.badges, right.badges)
    && sameWorkerPerformanceAxes(left.performance_axes, right.performance_axes)
}

export function sameWorkerJobs(left: WorkerJobListResponse['jobs'], right: WorkerJobListResponse['jobs']) {
  return left.length === right.length && left.every((job, index) => sameWorkerJob(job, right[index]))
}

function sameWorkerJob(
  left: WorkerJobListResponse['jobs'][number],
  right: WorkerJobListResponse['jobs'][number],
) {
  return left.id === right.id
    && left.display_code === right.display_code
    && left.status === right.status
    && left.service_type === right.service_type
    && left.problem_summary === right.problem_summary
    && left.address_building === right.address_building
    && left.address_unit === right.address_unit
    && left.address_floor === right.address_floor
    && left.district === right.district
    && left.final_price === right.final_price
    && left.estimated_earning === right.estimated_earning
    && sameStringArray(left.photo_urls, right.photo_urls)
    && left.completion_notes === right.completion_notes
    && left.scheduled_at === right.scheduled_at
    && left.created_at === right.created_at
    && left.matched_at === right.matched_at
    && left.completed_at === right.completed_at
    && sameStringArray(left.completion_photo_urls, right.completion_photo_urls)
    && sameAddressAccessView(left.address_access, right.address_access)
}

function sameAddressAccessView(
  left: WorkerJobListResponse['jobs'][number]['address_access'],
  right: WorkerJobListResponse['jobs'][number]['address_access'],
) {
  return left.release_stage === right.release_stage
    && left.exact_unit_released === right.exact_unit_released
    && left.check_in_required === right.check_in_required
    && left.identity_check_required === right.identity_check_required
    && left.customer_handoff_required === right.customer_handoff_required
    && left.evidence_mode === right.evidence_mode
}

function sameWorkerPerformanceBadges(
  left: WorkerPerformanceInsightsResponse['badges'],
  right: WorkerPerformanceInsightsResponse['badges'],
) {
  return left.length === right.length && left.every((item, index) => {
    const next = right[index]
    return item.id === next.id && item.status === next.status
  })
}

function sameWorkerPerformanceAxes(
  left: WorkerPerformanceInsightsResponse['performance_axes'],
  right: WorkerPerformanceInsightsResponse['performance_axes'],
) {
  return left.length === right.length && left.every((item, index) => {
    const next = right[index]
    return item.id === next.id && item.score === next.score
  })
}

function sameWorkerDailyEarnings(left: EarningsResponse['daily_earnings'] | null | undefined, right: EarningsResponse['daily_earnings'] | null | undefined) {
  const leftItems = left ?? []
  const rightItems = right ?? []
  return leftItems.length === rightItems.length && leftItems.every((item, index) => {
    const next = rightItems[index]
    return item.date === next.date
      && item.gross_earnings === next.gross_earnings
      && item.platform_fee_total === next.platform_fee_total
      && item.net_earnings === next.net_earnings
      && item.paid_job_count === next.paid_job_count
  })
}

function sameStringArray(left: readonly string[] | null | undefined, right: readonly string[] | null | undefined) {
  const leftItems = left ?? []
  const rightItems = right ?? []
  return leftItems.length === rightItems.length && leftItems.every((item, index) => item === rightItems[index])
}
