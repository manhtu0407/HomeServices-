import type { BroadcastStatus, JobStatus, LocalPaymentStatus, ScopeChangeStatus, ServiceType, WorkerVerificationStatus } from '@nestscout/shared'
import type { CustomerPaymentMethodSaveInput } from './customer'
import type { KaelChatProgress } from './kael'
import type { AddressAccessView } from './shared'

export type WorkerPayoutMethodSaveInput = CustomerPaymentMethodSaveInput

export type WorkerPayoutMethodResponse = {
  payout_method: {
    bank_key: string
    bank_name: string
    account_holder_name: string
    bank_account_masked: string
    status: 'pending_verification' | 'verified' | 'rejected'
    updated_at: string
  }
  worker_profile: WorkerProfileResponse
}

export type WorkerProfileResponse = {
  id: string
  verification_status: WorkerVerificationStatus
  is_available: boolean
  is_approved: boolean
  is_suspended: boolean
  service_types: ServiceType[]
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

export type WorkerRegisterResponse = {
  worker_id: string
  verification_status: WorkerVerificationStatus
  submitted_at: string
}

export type WorkerPerformanceBadgeId =
  | 'verified_profile'
  | 'fast_responder'
  | 'reliable_arrival'
  | 'trusted_by_customers'
  | 'steady_earner'

export type WorkerPerformanceAxisId =
  | 'rating'
  | 'response'
  | 'arrival'
  | 'completion'
  | 'earnings'

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
    worker_brief_core?: Record<string, unknown> | null
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
  full_address: {
    building: string | null
    unit: string | null
    floor: string | null
    district: string | null
  }
  address_access: AddressAccessView
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

export type WorkerKaelChatStatus = 'active' | 'closed' | 'escalated' | 'error'

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
  job_id: string
  worker_id: string
  status: WorkerKaelChatStatus
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

export type WorkerCancellationDecisionInput = {
  decision: 'approve' | 'reject'
  review_note?: string
}

export type WorkerCancellationDecisionResponse = {
  cancellation_id: string
  job_id: string
  status: string
  job_status: JobStatus
  broadcast_sent: boolean
  message: string
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
    completion_notes: string | null
    completion_photo_urls: string[]
    worker_brief_guidance?: Record<string, unknown> | null
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
  pending_payment_count: number
  pending_payment_amount: number
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
