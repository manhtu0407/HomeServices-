import type {
  ServiceType,
  ComplexityLevel,
  JobStatus,
  WorkerVerificationStatus,
  BroadcastStatus,
  ScopeChangeStatus,
} from '../constants'

export type KaelEstimate = {
  service_type: ServiceType
  problem_category: string
  problem_summary: string
  complexity: ComplexityLevel
  price_min: number
  price_max: number
  confidence: number
  advisory: string | null
  disclaimer: string
}

export type ServiceCatalogResponse = {
  services: {
    id: string
    service_type: ServiceType
    label_vi: string
    problems: {
      id: string
      slug: string
      label_vi: string
      default_complexity: ComplexityLevel
    }[]
    baselines: {
      complexity: ComplexityLevel
      district_code: string
      price_min: number
      price_max: number
    }[]
  }[]
}

export type CreateJobResponse = {
  job_id: string
  status: JobStatus
  estimate: KaelEstimate
  fallback_used: boolean
}

export type JobDetailResponse = {
  job: {
    id: string
    status: JobStatus
    service_type: ServiceType
    description: string
    problem_chips: string[]
    photo_urls: string[]
    address_building: string | null
    address_unit: string | null
    address_floor: string | null
    address_district: string | null
    scheduled_at: string | null
    kael_problem_identified: string | null
    kael_complexity: ComplexityLevel | null
    kael_price_min: number | null
    kael_price_max: number | null
    kael_advisory: string | null
    final_price: number | null
    completion_notes: string | null
    completion_photo_urls: string[]
    created_at: string
    matched_at: string | null
    arrived_at: string | null
    completed_at: string | null
    confirmed_at: string | null
    paid_at: string | null
    reviewed_at: string | null
  }
  broadcast_state: {
    active_count: number
    seconds_remaining: number | null
  } | null
  current_scope_change: {
    id: string
    status: ScopeChangeStatus
    requested_description: string | null
    reason: string | null
    price_min: number | null
    price_max: number | null
    created_at: string | null
  } | null
}

export type ConfirmSearchResponse = {
  job_id: string
  status: JobStatus
  broadcast_sent: boolean
  worker: {
    full_name: string
    rating: number
    total_jobs: number
  } | null
  message: string
}

export type StatusUpdateResponse = {
  job_id: string
  from_status: JobStatus
  to_status: JobStatus
  updated_at: string
}

export type ConfirmCompletionResponse = {
  job_id: string
  status: JobStatus
  final_price: number | null
}

export type ReviewResponse = {
  review_id: string
  job_id: string
  status: JobStatus
}

// =============================================================================
// Worker flow responses (B0-B8)
// =============================================================================

export type WorkerProfileResponse = {
  id: string
  verification_status: WorkerVerificationStatus
  is_available: boolean
  is_approved: boolean
  is_suspended: boolean
  service_types: ServiceType[]
  districts: string[]
  years_experience: number
  rating: number
  total_jobs: number
  // PII fields — only returned to self/admin
  legal_name: string | null
  date_of_birth: string | null
  gender: string | null
  bank_account_masked: string | null  // e.g., "****1234" — never raw
  bank_name: string | null
  has_cccd: boolean
  has_selfie: boolean
}

export type WorkerRegisterResponse = {
  worker_id: string
  verification_status: WorkerVerificationStatus
  submitted_at: string
}

export type AvailabilityToggleResponse = {
  worker_id: string
  is_available: boolean
  updated_at: string
}

export type BroadcastListResponse = {
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
    sent_at: string | null
    expires_at: string | null
    seconds_remaining: number | null
  }[]
}

export type AcceptBroadcastResponse = {
  job_id: string
  status: JobStatus
  full_address: {
    building: string | null
    unit: string | null
    floor: string | null
    district: string | null
  }
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
}

export type CustomerScopeDecisionResponse = {
  scope_change_id: string
  job_id: string
  status: ScopeChangeStatus
  decided_at: string
}

export type WorkerJobListResponse = {
  jobs: {
    id: string
    status: JobStatus
    service_type: ServiceType
    problem_summary: string | null
    address_building: string | null
    address_unit: string | null
    address_floor: string | null
    district: string | null
    final_price: number | null
    estimated_earning: number | null
    created_at: string
    matched_at: string | null
    completed_at: string | null
  }[]
}

export type EarningsResponse = {
  worker_id: string
  total_jobs_paid: number
  gross_earnings: number       // sum of final_price across paid jobs
  platform_fee_total: number   // 10% of gross
  net_earnings: number         // gross - platform_fee_total
  pending_payment_count: number
  pending_payment_amount: number
  from_date: string | null
  to_date: string | null
}
