import type { ApartmentAccessProfileInput, BroadcastStatus, ComplexityLevel, JobStatus, LearningCandidateStatus, LocalPaymentStatus, ScopeChangeStatus, ServiceType, WorkerVerificationStatus } from '@nestscout/shared'
import type {
  KaelEstimate,
  CreateJobResponse,
  KaelChatStatus,
  KaelChatNextAction,
  KaelChatTurn,
  KaelChatSession,
  KaelChatResponse,
} from '@nestscout/shared'

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

export type {
  KaelEstimate,
  CreateJobResponse,
  KaelChatStatus,
  KaelChatNextAction,
  KaelChatTurn,
  KaelChatSession,
  KaelChatResponse,
}

export type KaelChatMediaUploadResponse = {
  bucket_id: 'kael-chat-media'
  object_path: string
  media_ref: string
  token: string
  signed_upload_url: string
  expires_in_seconds: number
}

export type KaelAssistantResponse = {
  answer: string
  safety_notes: string[]
  citations: string[]
  suggested_actions: Array<'open_booking' | 'check_job' | 'message_worker' | 'contact_support' | 'request_scope_change'>
  boundary: 'answered' | 'educational_only' | 'redirect' | 'unsupported' | 'fallback'
  fallback_used: boolean
}

export type KaelMemoryPayload = Record<string, unknown> & {
  customer_id?: string
  worker_id?: string
  language?: string | null
  preference_summary?: string | null
  service_preferences?: Record<string, unknown> | null
  service_skill_proficiency?: Record<string, unknown> | null
  service_skill_summary?: string | null
  safe_metadata?: Record<string, unknown> | null
  trust_signals?: Record<string, unknown> | null
  reliability_signals?: Record<string, unknown> | null
  red_flags?: Record<string, unknown> | null
  memory_version?: number | null
  last_observed_at?: string | null
}

export type KaelMemorySelfViewResponse = {
  subject_type: 'customer' | 'worker'
  memory: KaelMemoryPayload | null
}

export type CustomerKaelMemoryPreferenceKey =
  | 'preferred_address'
  | 'preferred_time_window'
  | 'budget_limit_vnd'
  | 'message_interaction_memory'
  | 'share_preferences_with_worker'

export type CustomerKaelMemoryPreferenceUpdateInput = {
  key: CustomerKaelMemoryPreferenceKey
  enabled: boolean
}

export type WorkerKaelMemoryPreferenceKey =
  | 'area_preference'
  | 'income_preference'
  | 'travel_limit'
  | 'skill_preference'
  | 'opportunity_filter'
  | 'auto_accept_work'

export type WorkerKaelMemoryPreferenceUpdateInput = {
  key: WorkerKaelMemoryPreferenceKey
  enabled: boolean
}

export type CustomerProfileInsightsResponse = {
  customer_id: string
  member_since: string | null
  kael_interaction_count: number
  completed_service_count: number
  saved_address_count: number
  preferred_service_count: number
  active_streak_days: number
  positive_review_rate_percent: number
  price_savings_vnd: number
  total_spend_vnd: number
  usage_rank_level: number
  usage_rank_points: number
  fair_price_service_count: number
  money_protection_score: number
  protected_value_vnd: number
  protected_transaction_count: number
  total_transaction_count: number
  dispute_free_rate_percent: number
  fair_price_status: 'verified' | 'mixed' | 'pending' | null
}

export type CustomerPaymentMethodSaveInput = {
  account_holder_name: string
  bank_account: string
  bank_key: string
  bank_name: string
}

export type CustomerPaymentMethodResponse = {
  payment_method: {
    id: string
    bank_key: string
    bank_name: string
    account_holder_name: string
    bank_account_masked: string
    status: 'pending_verification' | 'verified' | 'rejected'
    is_default: boolean
    verified_at: string | null
    updated_at: string
  } | null
}

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
export type ConfirmKaelChatResponse = ConfirmSearchResponse & {
  session_id: string
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
    created_at: string | null
  } | null
}

// X4 (Plan.md §27.7 — 2026-05-29): F-17 customer active-job hydration.
export type CustomerActiveJobResponse = {
  active_job: JobDetailResponse | null
}

// U-5 (Notes.md 5.4): edit/read the user-owned subset of Kael memory.
export type KaelMemoryResponse = {
  subject_type: 'customer' | 'worker'
  memory: Record<string, unknown> | null
}

// U-5 (Notes.md 5.3): pending Kael decisions the customer must make.
export type PendingDecisionItem = {
  kind: 'scope_change'
  scope_change_id: string
  job_id: string
  service_type: string | null
  problem: string | null
  requested_description: string
  reason: string
  price_min: number
  price_max: number
  created_at: string
}
export type PendingDecisionsResponse = {
  pending_decisions: PendingDecisionItem[]
}

// U-5 (Notes.md): cross-job message inbox summary.
export type ThreadSummary = {
  job_id: string
  status: string
  service_type: string | null
  last_message: {
    content: string
    sender_role: string | null
    created_at: string
  }
  unread_count: number
}
export type ThreadsResponse = {
  threads: ThreadSummary[]
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
    provider: 'sepay_vietqr'
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

export type CustomerKaelFeedbackResponse = {
  feedback_id: string
  status: 'new'
  created_at: string
}

export type KaelChatProgress = {
  current_stage:
    | 'intent_classification'
    | 'vision_analysis'
    | 'clarification'
    | 'problem_synthesis'
    | 'market_lookup'
    | 'price_synthesis'
    | 'advisory_generation'
    | 'worker_brief'
    | 'worker_assist'
    | 'scope_change'
    | 'scope_reviewing'
    | 'scope_estimating'
    | 'post_job_learning'
    | 'educational_response'
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  failure_reason?: string | null
  updated_at: string
}

export type KaelChatProgressResponse = {
  session_id: string
  progress: KaelChatProgress | null
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

export type JobMediaStage = 'before' | 'after' | 'kael_reference' | 'cancellation_evidence' | 'scope_change_evidence' | 'access_check_in'

export type JobMediaAttachInput = {
  assets: {
    object_path: string
    stage: JobMediaStage
    mime_type?: string
    file_size_bytes?: number
  }[]
}

export type ApartmentAccessAuthorizeResponse = {
  job_id: string
  release_stage: string
  already_authorized: boolean
}

export type JobMediaAttachResponse = {
  job_id: string
  photo_urls: string[]
  media: {
    bucket_id: 'job-media'
    object_path: string
    storage_ref: string
    stage: JobMediaStage
  }[]
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

export type DevicePushTokenInput = {
  platform: 'ios' | 'android' | 'web' | 'unknown'
  push_token: string
  permission_status: 'granted' | 'denied' | 'undetermined'
  safe_metadata?: Record<string, unknown>
}

export type DevicePushTokenResponse = {
  token_id: string
  enabled: boolean
  updated_at: string
}

export type KaelLearningCandidateSummary = {
  id: string
  candidate_type: string
  affected_service: ServiceType | null
  affected_problem: string | null
  affected_district: string | null
  confidence: number
  evidence_count: number
  status: LearningCandidateStatus
  audit_reason: string | null
  created_at: string
  updated_at: string
  promoted_at: string | null
  rolled_back_at: string | null
  suggested_payload: Record<string, unknown>
  evidence_snapshot: Record<string, unknown> | null
}

export type KaelLearningCandidateListResponse = {
  candidates: KaelLearningCandidateSummary[]
}

export type KaelLearningCandidateApproveResponse = {
  ok: boolean
  candidate_id: string
  rule_id: string | null
  rule_version: number | null
  status: string
  knowledge_apply: {
    ok: boolean
    error_code: string | null
    knowledge_table: string | null
    record_key: string | null
    knowledge_version: number | null
  } | null
}

export type KaelLearningCandidateRejectResponse = {
  ok: boolean
  candidate_id: string
  status: string
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
    completion_notes: string | null
    completion_photo_urls: string[]
    worker_brief_guidance?: Record<string, unknown> | null
    created_at: string
    matched_at: string | null
    completed_at: string | null
  }[]
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
