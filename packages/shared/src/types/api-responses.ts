import type {
  ServiceType,
  ComplexityLevel,
  JobStatus,
  WorkerVerificationStatus,
  BroadcastStatus,
  ScopeChangeStatus,
} from '../constants'
import type { LocalPaymentStatus } from '../mobile-workflow'
import type { ApartmentAccessProfileInput, KaelChatProgress } from '../validation'

export type AddressAccessView = {
  release_stage: 'area_only' | 'building_released' | 'unit_released'
  exact_unit_released: boolean
  worker_checked_in: boolean
  check_in_required: boolean
  identity_check_required: boolean
  customer_handoff_required: boolean
  evidence_mode: 'none' | 'geofence' | 'manual_photo'
  access_profile: ApartmentAccessProfileInput
}

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
  // A-2 honesty fields surfaced from estimate_card_v3 (optional; canonical superset for mobile).
  needs_inspection?: boolean
  price_source?: string | null
  needs_inspection_reason?: string | null
  market_signals?: string | null
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
  display_code?: string
  status: JobStatus
  estimate: KaelEstimate
  estimate_card_v3?: Record<string, unknown>
  final_price?: number | null
  fallback_used: boolean
  broadcast_sent?: boolean
  message?: string
}

export type KaelChatStatus =
  | 'active'
  | 'collecting_evidence'
  | 'estimate_ready'
  | 'confirmed'
  | 'abandoned'
  | 'unsupported'

export type KaelCaseWorkPhase =
  | 'analysis'
  | 'offer_review'
  | 'matching'
  | 'worker_candidate_review'
  | 'worker_en_route'
  | 'service_execution'
  | 'scope_change_review'
  | 'completion_review'
  | 'payment'
  | 'review'
  | 'closed'

export type KaelChatNextAction =
  | 'await_input'
  | 'collect_evidence'
  | 'ask_photo'
  | 'ask_video'
  | 'estimate_ready'
  | 'unsupported'
  | 'budget_exceeded'
  | 'confirmed'
  | 'ask_question'
  | 'request_evidence'

export type KaelChatTurn = {
  id: string
  session_id: string
  turn_index: number
  role: 'customer' | 'kael' | 'system'
  content_type:
    | 'text'
    | 'photo_request'
    | 'video_request'
    | 'photo_attached'
    | 'video_attached'
    | 'clarification'
    | 'analysis'
    | 'estimate'
    | 'error'
  text_content: string | null
  media_refs: string[]
  estimate: KaelEstimate | null
  // Smart clarification: present on content_type='clarification' turns (optional; canonical superset).
  clarification?: { question: string | null; missing_slots: string[] } | null
  created_at: string
}

export type KaelChatSession = {
  id: string
  job_id: string | null
  customer_id: string
  service_type: ServiceType
  status: KaelChatStatus
  case_phase: KaelCaseWorkPhase
  diagnosis_scope: Record<string, unknown> | null
  scheduled_at: string | null
  estimate: KaelEstimate | null
  started_at: string
  estimate_ready_at: string | null
  total_turns: number
  total_cost_usd: number
  next_action: KaelChatNextAction
}

export type KaelChatResponse = {
  session: KaelChatSession
  turns: KaelChatTurn[]
}

export type PlacesAutocompleteResponse = {
  suggestions: {
    place_id: string
    label: string
    main_text: string
    secondary_text: string | null
  }[]
  fallback_used: boolean
}

export type PlacesResolveResponse = {
  fallback_used: boolean
  label: string | null
  location: { lat: number; lng: number } | null
  place_id: string
  provider: 'vietmap' | 'google_maps' | 'fallback'
}

export type JobDetailResponse = {
  job: {
    id: string
    display_code?: string
    status: JobStatus
    service_type: ServiceType
    description: string
    problem_chips: string[]
    photo_urls: string[]
    customer_evidence_photo_urls: string[]
    field_evidence_photo_urls: string[]
    address_building: string | null
    address_unit: string | null
    address_floor: string | null
    address_district: string | null
    address_access: AddressAccessView
    scheduled_at: string | null
    kael_problem_identified: string | null
    kael_complexity: ComplexityLevel | null
    kael_price_min: number | null
    kael_price_max: number | null
    kael_advisory: string | null
    kael_estimate_card_v3: Record<string, unknown> | null
    kael_worker_brief_core: Record<string, unknown> | null
    kael_worker_brief_guidance: Record<string, unknown> | null
    kael_progress: KaelChatProgress | null
    final_price: number | null
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
  worker: {
    avatar_url: string | null
    display_code?: string | null
    full_name: string
    id: string
    rating: number
    review_count?: number | null
    total_jobs: number
  } | null
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
    kael_computed_min: number | null
    kael_computed_max: number | null
    kael_review: Record<string, unknown> | null
    kael_progress: KaelChatProgress | null
    evidence_photo_urls: string[]
    request_timing: 'pre_arrival' | 'on_site'
    resume_job_status: JobStatus | null
    created_at: string | null
  } | null
}

export type JobMessageResponse = {
  id: string
  job_id: string
  sender_id: string | null
  sender_role: 'customer' | 'worker' | 'kael'
  content: string
  is_read: boolean
  created_at: string
}

export type JobMessageListResponse = {
  job_id: string
  messages: JobMessageResponse[]
}

export type JobMessageSendResponse = {
  message: JobMessageResponse
}

export type ConfirmSearchResponse = {
  job_id: string
  status: JobStatus
  broadcast_sent: boolean
  worker: {
    avatar_url: string | null
    display_code?: string | null
    full_name: string
    id: string
    rating: number
    review_count?: number | null
    total_jobs: number
  } | null
  message: string
}

export type ConfirmKaelChatResponse = ConfirmSearchResponse & {
  session_id: string
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

export type PaymentIntentResponse = {
  job_id: string
  status: JobStatus
  payment: {
    provider: 'sepay_vietqr' | 'staging_simulator'
    status: LocalPaymentStatus
    gross_amount: number | null
    platform_fee: number | null
    worker_net: number | null
    payment_code: string | null
    transfer_content: string | null
    qr_image_url: string | null
    expires_at: string | null
    received_at: string | null
    amount_received: number | null
    updated_at: string | null
  }
}

export type CustomerCancellationResponse = {
  cancellation_id: string
  job_id: string
  status: 'requested'
  job_status: JobStatus
  sub_case:
    | 'before_a7'
    | 'after_a7_before_worker_accept'
    | 'after_worker_accept'
    | 'after_worker_completed_trigger_dispute'
    | 'scheduled_job'
  reason_code: string
  reason_category: string
  admin_review_required: boolean
  phase0_no_monetary_penalty: boolean
  worker_goodwill: Record<string, unknown> | null
  abuse_signals: string[]
  message: string
  created_at: string
}

export type DisputeOpenResponse = {
  dispute_id: string
  job_id: string
  status: string
  dispute_type: string
  evidence_snapshot_id: string
  admin_review_required: boolean
  priority: 'low' | 'medium' | 'high' | 'critical'
  evidence_locked_at: string
  message: string
  created_at: string
}

export type DisputeCounterStatementResponse = {
  dispute_id: string
  status: string
  counter_party_statement_submitted: boolean
  updated_at: string
}

export type DisputeAdminDecisionResponse = {
  dispute_id: string
  status: string
  outcome: string
  decided_at: string
}

export type ReviewResponse = {
  review_id: string
  job_id: string
  status: JobStatus
}

// =============================================================================
// Worker flow responses (B0-B8)
// =============================================================================

export type WorkerServiceQualityStatus = {
  average_rating: number | null
  locked_until: string | null
  review_count: number
  service_type: ServiceType
  status: 'available' | 'quality_locked'
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
  active_service_types: ServiceType[]
  selected_service_types: ServiceType[]
  service_quality: WorkerServiceQualityStatus[]
  districts: string[]
  home_lat: number | null
  home_lng: number | null
  service_radius_km: number | null
  problem_specializations: string[]
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

export type WorkerAvatarUploadResponse = {
  bucket_id: 'worker-avatars'
  object_path: string
  avatar_ref: string
  token: string
  signed_upload_url: string
  expires_in_seconds: number
}

export type WorkerActivityMinuteResponse = {
  worker_id: string
  active_minutes: number
  last_active_at: string
  incremented: boolean
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
    media_count: number
    worker_brief_core?: Record<string, unknown> | null
    scheduled_at: string | null
    sent_at: string | null
    expires_at: string | null
    seconds_remaining: number | null
  }[]
}

export type AcceptBroadcastResponse = {
  job_id: string
  status: JobStatus
  candidate_id: string
  awaiting_customer_confirmation: true
  already_applied: boolean
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
}

export type CustomerScopeDecisionResponse = {
  scope_change_id: string
  job_id: string
  status: ScopeChangeStatus
  decided_at: string
}

export type WorkerCancellationResponse = {
  cancellation_id: string
  job_id: string
  status: string
  job_status: JobStatus
  broadcast_sent: boolean
  message: string
  created_at: string | null
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

export type EarningsResponse = {
  worker_id: string
  total_jobs_paid: number
  gross_earnings: number       // sum of frozen gross_amount across paid jobs
  platform_fee_total: number   // sum of frozen platform_fee across paid jobs
  net_earnings: number         // sum of frozen worker_net across paid jobs
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

export type NotificationListResponse = {
  unread_count: number
  notifications: {
    id: string
    title: string
    body: string
    event_type: string
    status: string
    job_id: string | null
    created_at: string
    read_at: string | null
  }[]
}

export type NotificationReadResponse = {
  notification_id: string
  status: 'read'
  read_at: string
}

export type DevicePushTokenResponse = {
  token_id: string
  enabled: boolean
  updated_at: string
}

export type DevicePushTokenUnregisterResponse = {
  token_id: string | null
  unregistered: boolean
  updated_at: string
}
