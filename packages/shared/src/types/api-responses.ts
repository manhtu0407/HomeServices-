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
import type { WorkflowResponses } from './workflow-responses'
import type {
  BaselinePriceEvidenceReceiptResponse,
  KaelEstimateAnalysisReceipt,
} from './price-evidence-responses'
export type {
  BaselinePriceEvidenceReceiptResponse,
  KaelEstimateAnalysisReceipt,
} from './price-evidence-responses'
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

export type KaelPriceReasoningReceipt = {
  schema_version: 'price_reasoning_receipt.v1'
  receipt_id: string
  problem: {
    confirmed_facts: string[]
    possible_causes: {
      statement: string
      basis: ('customer_report' | 'visual_evidence' | 'service_profile' | 'knowledge')[]
      confidence: 'low' | 'medium' | 'high'
    }[]
    unknowns: string[]
  }
  scope: {
    included: string[]
    conditional: string[]
    excluded: string[]
  }
  costs: {
    currency: 'VND'
    total_min: number
    total_max: number
    reconciliation: 'package_total' | 'exact'
    components: {
      kind:
        | 'service_package'
        | 'labor'
        | 'travel'
        | 'materials'
        | 'replacement_parts'
        | 'equipment'
        | 'other'
      status:
        | 'priced'
        | 'included_unitemized'
        | 'conditional_unpriced'
        | 'excluded'
        | 'undetermined'
      amount_min: number | null
      amount_max: number | null
      explanation: string
    }[]
  }
  scenarios: {
    low: { total: number; conditions: string[]; scope: string[] }
    high: { total: number; conditions: string[]; scope: string[] }
  }
  fairness: {
    price_source:
      | 'perplexity_validated'
      | 'baseline_with_market'
      | 'baseline_only'
      | 'inspection_required'
    confidence: 'low' | 'medium' | 'high'
    baseline_evidence?: BaselinePriceEvidenceReceiptResponse | null
    market_source_count: number | null
    high_trust_source_count: number | null
    quorum_met: boolean | null
    cap_statement: string
    remaining_uncertainty: string[]
  }
}

export type MatchingState = {
  strategy: 'pending_choice' | 'general' | 'saved_worker_first'
  stage:
    | 'awaiting_choice'
    | 'saved_worker_search'
    | 'general_search'
    | 'candidate_ready'
    | 'recovery_required'
    | 'exhausted'
    | 'stopped'
  checks: {
    kind: 'service_capability' | 'service_area' | 'availability'
    state: 'pending' | 'verified'
  }[]
  batch: {
    attempt: number
    recipient_count: number
    deadline_at: string | null
    seconds_remaining: number | null
    strategy: 'saved_worker' | 'general'
  } | null
  event_history: {
    kind:
      | 'awaiting_customer_choice'
      | 'saved_worker_requested'
      | 'saved_worker_no_response'
      | 'saved_worker_declined'
      | 'saved_worker_unavailable'
      | 'search_expanded'
      | 'general_batch_sent'
      | 'matching_recovery_required'
      | 'no_worker_found'
      | 'candidate_ready'
      | 'search_stopped'
    occurred_at: string
    recipient_count?: number
  }[]
}

export type { FavoriteWorkerForMatching, FavoriteWorkersForMatchingResponse } from './favorite-worker-responses'

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
  complexity_reasoning?: string | null
  needs_inspection_reason?: string | null
  market_signals?: string | null
  analysis_receipt?: KaelEstimateAnalysisReceipt | null
  price_reasoning_receipt?: KaelPriceReasoningReceipt | null
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
  | 'confirm_intake'
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

export type KaelIntakeConfirmation = {
  version: 1
  source: 'booking'
  status: 'pending' | 'confirmed' | 'correction_requested'
  blocking: boolean
  checked_at: string
  confirmed_at: string | null
  correction_requested_at: string | null
  focus: string
  question: string
  fields: {
    key: 'service' | 'problem' | 'description' | 'location' | 'schedule'
    label: string
    value: string
    state: 'clear' | 'attention' | 'invalid'
    note: string | null
  }[]
  issues: {
    code:
      | 'profile_mismatch'
      | 'problem_missing'
      | 'description_too_short'
      | 'service_mismatch'
      | 'out_of_scope'
      | 'unsafe_input'
      | 'location_missing'
      | 'schedule_invalid'
      | 'schedule_past'
      | 'schedule_window_mismatch'
      | 'safety_attention'
    field: 'service' | 'problem' | 'description' | 'location' | 'schedule'
    severity: 'attention' | 'blocking'
    message: string
  }[]
  intake: {
    service_type: ServiceType
    profile_id: 'electric_diagnose' | 'water_diagnose' | 'clean_scope' | 'air_scope' | 'fabric_scope' | 'task_scope'
    description: string
    problem_chips: string[]
    address_label: string
    address_district: string
    scheduled_at: string
    schedule_window: {
      date: string
      start: string
      end: string
      time_zone: 'Asia/Ho_Chi_Minh'
    }
  }
}

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
  evidence_previews?: {
    evidence_index: number
    evidence_kind: 'photo' | 'video_frame'
    url: string
  }[]
  scheduled_at: string | null
  estimate: KaelEstimate | null
  started_at: string
  estimate_ready_at: string | null
  total_turns: number
  total_cost_usd: number
  next_action: KaelChatNextAction
  intake_confirmation?: KaelIntakeConfirmation | null
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
    payment_rail_available?: boolean
    payment_rail_provider?: 'platform_bank_manual' | 'sepay_vietqr' | null
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
    payment_receipt?: {
      method: 'platform_bank_manual' | 'direct_worker'
      status: string
      gross_amount: number
      customer_transfer_claimed_at: string | null
      customer_transferred_at: string | null
      response_deadline: string | null
      hold_until: string | null
      customer_confirmed_at: string | null
      worker_confirmed_at: string | null
      collateral_amount: number | null
      direct_payment_available?: boolean | null
      bank_code: string | null
      account_holder: string | null
      account_masked: string | null
    } | null
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
  matching_state: MatchingState | null
  current_job_incident?: {
    id: string
    status: 'open' | 'awaiting_worker' | 'awaiting_customer' | 'ready_for_scope_proposal'
    evidence_status: 'needs_more' | 'ready'
    reported_description: string | null
    reported_reason: string | null
    evidence_count: number
    last_summary: string | null
    last_question: string | null
    last_next_actor: 'customer' | 'worker' | null
    created_at: string
    updated_at: string
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

export type ConfirmCompletionResponse = WorkflowResponses['confirmCompletion']
export type ConfirmKaelChatResponse = WorkflowResponses['confirmKaelChat']
export type ConfirmSearchResponse = WorkflowResponses['confirmSearch']
export type CustomerCancellationResponse = WorkflowResponses['customerCancellation']
export type DirectWorkerPaymentResponse = WorkflowResponses['directWorkerPayment']
export type DirectWorkerPaymentResponseInput = WorkflowResponses['directWorkerPaymentResponse']
export type DirectWorkerPaymentSelectInput = WorkflowResponses['directWorkerPaymentSelect']
export type DisputeAdminDecisionResponse = WorkflowResponses['disputeAdminDecision']
export type DisputeCounterStatementResponse = WorkflowResponses['disputeCounterStatement']
export type DisputeOpenResponse = WorkflowResponses['disputeOpen']
export type ManualBankPaymentClaimInput = WorkflowResponses['manualBankPaymentClaim']
export type ManualBankPaymentClaimResponse = WorkflowResponses['manualBankPaymentClaimResponse']
export type MatchingPreferenceResponse = WorkflowResponses['matchingPreference']
export type PaymentIntentResponse = WorkflowResponses['paymentIntent']
export type StatusUpdateResponse = WorkflowResponses['statusUpdate']
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
  available_balance: number    // in-app payable balance after held and completed withdrawals
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

export type WorkerCashPaymentConfirmationResponse = {
  job_id: string
  outcome: 'confirmed' | 'already_confirmed'
  status: JobStatus
  payment: {
    provider: 'cash'
    status: 'cash_confirmed'
    gross_amount: number
    platform_fee: number
    worker_net: number
    commission_level: number
    commission_rate_bps: number
    cash_commission_collected: number
    cash_commission_due: number
    received_at: string
    updated_at: string
  }
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
