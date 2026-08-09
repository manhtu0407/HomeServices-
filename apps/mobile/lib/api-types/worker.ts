import type { BroadcastStatus, JobStatus, LocalPaymentStatus, ScopeChangeStatus, ServiceType, WorkerKaelChatMode, WorkerServiceQualityStatus, WorkerVerificationStatus } from '@nestscout/shared'
import type { KaelChatProgress } from './kael'
import type { AddressAccessView } from './shared'

export type { WorkerActivityMinuteResponse, WorkerAvatarUploadResponse } from '@nestscout/shared'
export type { WorkerServiceQualityStatus }

export type { WorkerPayoutMethodSaveInput, WorkerWithdrawalRequestCreateInput } from '@nestscout/shared'

export type WorkerPayoutMethod = {
  id: string
  bank_key: string
  bank_name: string
  bank_account_masked: string
  status: 'pending_verification' | 'verified' | 'rejected'
  reviewed_at: string | null
  updated_at: string
}

export type WorkerPayoutMethodResponse = {
  payout_method: WorkerPayoutMethod | null
}

export type WorkerWithdrawalRequest = {
  id: string
  amount_vnd: number
  available_balance_before_vnd: number
  bank_key: string
  bank_name: string
  bank_account_masked: string
  status: 'pending' | 'processing' | 'paid' | 'rejected' | 'failed'
  requested_at: string
  processing_at: string | null
  processed_at: string | null
  transfer_reference: string | null
  resolution_reason: string | null
  updated_at: string
}

export type WorkerWithdrawalRequestListResponse = {
  requests: WorkerWithdrawalRequest[]
}

export type WorkerWithdrawalRequestCreateResponse = {
  request: WorkerWithdrawalRequest
}

export type WorkerProfileResponse = {
  id: string
  avatar_url: string | null
  active_minutes: number
  last_active_at: string | null
  verification_status: WorkerVerificationStatus
  is_available: boolean
  is_approved: boolean
  is_suspended: boolean
  service_types: ServiceType[]
  active_service_types?: ServiceType[]
  selected_service_types?: ServiceType[]
  service_quality?: WorkerServiceQualityStatus[]
  districts: string[]
  home_lat: number | null
  home_lng: number | null
  service_radius_km: number | null
  problem_specializations: string[]
  years_experience: number
  rating: number
  total_jobs: number
  legal_name: string | null
  date_of_birth: string | null
  gender: string | null
  bank_account_masked: string | null
  bank_name: string | null
  has_cccd: boolean
  has_selfie: boolean
}

export type WorkerAvatarUpdateResponse = {
  worker_id: string
  avatar_url: string
  updated_at: string
}

export type WorkerRegisterResponse = {
  worker_id: string
  verification_status: WorkerVerificationStatus
  submitted_at: string
}

type WorkerPerformanceBadgeId =
  | 'verified_profile'
  | 'fast_responder'
  | 'reliable_arrival'
  | 'trusted_by_customers'
  | 'steady_earner'

type WorkerPerformanceAxisId =
  | 'rating'
  | 'response'
  | 'arrival'
  | 'completion'
  | 'earnings'
  | 'work_response'
  | 'incident_handling'

export type WorkerPerformanceInsightsResponse = {
  worker_id: string
  completed_job_count: number
  review_count: number
  average_rating: number | null
  response_rate_percent: number | null
  average_response_minutes: number | null
  on_time_rate_percent: number | null
  total_broadcast_count: number
  responded_broadcast_count: number
  accepted_broadcast_count: number
  scheduled_arrival_job_count: number
  on_time_job_count: number
  paid_job_count: number
  reconciled_earnings_vnd: number | null
  work_response_review_count: number
  resolved_incident_case_count: number
  incident_rank_bonus: number
  performance_score: number | null
  badges: {
    id: WorkerPerformanceBadgeId
    status: 'earned' | 'locked'
  }[]
  performance_axes: {
    id: WorkerPerformanceAxisId
    score: number | null
  }[]
}

export type WorkerApplicationResponse = {
  application_id: string
  status: 'open'
  submitted_at: string
}

export type WorkerBroadcastsResponse = {
  broadcasts: {
    broadcast_id: string
    job_id: string
    status: BroadcastStatus
    service_type: ServiceType
    problem_summary: string | null
    district: string | null
    estimated_price_min: number | null
    estimated_price_max: number | null
    estimated_earning_min: number | null
    estimated_earning_max: number | null
    media_count: number
    worker_brief_core?: Record<string, unknown> | null
    scheduled_at: string | null
    sent_at: string | null
    expires_at: string | null
    seconds_remaining: number | null
  }[]
}

export type BroadcastListResponse = WorkerBroadcastsResponse

type WorkerAvailabilityResponse = {
  worker_id: string
  is_available: boolean
  updated_at: string
}

export type AvailabilityToggleResponse = WorkerAvailabilityResponse

export type AcceptBroadcastResponse = {
  job_id: string
  status: JobStatus
  candidate_id: string
  awaiting_customer_confirmation: true
  already_applied: boolean
}

export type DeclineBroadcastResponse = {
  job_id: string
  declined: true
}

export type WorkerScopeChangeResponse = {
  scope_change_id: string
  job_id: string
  status: ScopeChangeStatus
  created_at: string
  kael_estimate?: {
    price_min: number
    price_max: number
    confidence: number
    problem_summary: string
    advisory: string | null
    complexity_assessment: 'small' | 'medium' | 'large'
    disclaimer: string
    fallback_used: boolean
  }
  anti_fraud?: Record<string, unknown>
  worker_challenge?: Record<string, unknown>
  customer_card?: Record<string, unknown>
}

type JobIncidentStatus = 'open' | 'awaiting_worker' | 'awaiting_customer' | 'ready_for_scope_proposal' | 'scope_proposed' | 'resolved' | 'cancelled'

export type JobIncidentResponse = {
  incident: {
    id: string
    job_id: string
    status: JobIncidentStatus
    evidence_status: 'needs_more' | 'ready'
    last_summary: string | null
    last_question: string | null
    last_next_actor: 'customer' | 'worker' | null
    created_at: string
    updated_at: string
  } | null
}

export type JobIncidentScopeProposalResponse = {
  incident: NonNullable<JobIncidentResponse['incident']>
  scope_change: WorkerScopeChangeResponse
}

export type WorkerKaelClarifyResponse = {
  qa_id: string
  job_id: string
  remaining_questions: number
  answer: {
    schema_version: 'worker_qa_answer.v1'
    text: string
    safety_notes: string[]
  }
}

type WorkerKaelChatStatus = 'active' | 'closed' | 'escalated' | 'error'

export type WorkerKaelChatTurn = {
  id: string
  session_id: string
  turn_index: number
  role: 'worker' | 'kael' | 'system'
  content_type: 'text' | 'clarification' | 'guidance' | 'photo_request' | 'photo_attached' | 'error'
  text_content: string | null
  media_refs: string[]
  safety_notes: string[]
  created_at: string
}

export type WorkerKaelChatSession = {
  id: string
  job_id: string | null
  mode: WorkerKaelChatMode
  worker_id: string
  status: WorkerKaelChatStatus
  title: string | null
  pinned_at: string | null
  started_at: string
  closed_at: string | null
  total_turns: number
  progress: KaelChatProgress | null
}

export type WorkerKaelChatResponse = {
  session: WorkerKaelChatSession
  turns: WorkerKaelChatTurn[]
}

export type WorkerKaelChatListResponse = {
  sessions: WorkerKaelChatSession[]
}

export type WorkerKaelChatArchiveResponse = {
  session_id: string
  archived_at: string
}

export type WorkerKaelFeedbackResponse = {
  feedback_id: string
  status: 'new'
  created_at: string
}

export type WorkerKaelTrainingConsentResponse = {
  worker_id: string
  training_consent: boolean
  updated_at: string | null
}

export type WorkerCancellationRequestInput = {
  reason: string
  evidence_photo_urls?: string[]
}

export type WorkerCancellationResponse = {
  cancellation_id: string
  job_id: string
  status: string
  job_status: JobStatus
  broadcast_sent: boolean
  message: string
  created_at: string
  reason_code: string
  reason_category: string
  admin_review_required: boolean
  abuse_signals: string[]
  fallback_options: {
    id: string
    label_vi: string
    effect: string
    no_charge_phase0?: boolean
  }[]
}

export type WorkerJobListResponse = {
  jobs: {
    id: string
    display_code: string | null
    status: JobStatus
    service_type: ServiceType
    problem_summary: string | null
    address_building: string | null
    address_unit: string | null
    address_floor: string | null
    district: string | null
    address_access: AddressAccessView
    final_price: number | null
    estimated_earning: number | null
    payment_status?: LocalPaymentStatus | null
    payment_provider?: string | null
    payment_code?: string | null
    payment_transfer_content?: string | null
    payment_qr_image_url?: string | null
    payment_expires_at?: string | null
    payment_received_at?: string | null
    payment_amount_received?: number | null
    gross_amount?: number | null
    platform_fee?: number | null
    worker_net?: number | null
    photo_urls: string[]
    customer_evidence_photo_urls: string[]
    field_evidence_photo_urls: string[]
    completion_notes: string | null
    completion_photo_urls: string[]
    worker_brief_guidance?: Record<string, unknown> | null
    scheduled_at: string | null
    created_at: string
    matched_at: string | null
    completed_at: string | null
  }[]
}

export type WorkerRoutePreviewResponse = {
  distance_meters: number
  duration_seconds: number
}

export type EarningsResponse = {
  worker_id: string
  total_jobs_paid: number
  gross_earnings: number
  platform_fee_total: number
  net_earnings: number
  available_balance: number
  withdrawal_reserved_amount: number
  withdrawn_total: number
  cash_commission_collected_total: number
  cash_commission_due_total: number
  pending_payment_count: number
  pending_payment_amount: number
  on_hold_amount: number
  current_commission_level: number
  current_commission_rate_bps: number
  recent_transactions: {
    job_id: string
    display_code: string | null
    entry_type: 'worker_credit' | 'cash_commission_debit'
    payment_state: 'pending' | 'available' | 'on_hold' | 'reversed' | 'cash_collected' | 'cash_reconciliation_due'
    gross_amount: number
    platform_fee: number
    worker_net: number
    commission_level: number
    commission_rate_bps: number
    cash_commission_collected: number
    cash_commission_due: number
    recorded_at: string
    available_at: string | null
  }[]
  daily_earnings: {
    date: string
    gross_earnings: number
    platform_fee_total: number
    net_earnings: number
    paid_job_count: number
  }[]
  from_date: string | null
  to_date: string | null
}
