import type { ComplexityLevel, JobStatus, LocalPaymentStatus, MatchingState, ScopeChangeStatus, ServiceType, UserRole } from '@nestscout/shared'
export type {
  DirectWorkerPaymentResponse,
  DirectWorkerPaymentResponseInput,
  DirectWorkerPaymentSelectInput,
  ManualBankPaymentClaimInput,
  ManualBankPaymentClaimResponse,
} from '@nestscout/shared'
import type { KaelChatProgress } from './kael'
import type { AddressAccessView } from './shared'

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

export type CustomerActiveJobResponse = {
  active_job: JobDetailResponse | null
}

export type CustomerServiceHistoryItem = {
  ended_at: string
  final_price: number | null
  id: string
  service_type: ServiceType
  status: JobStatus
  worker: {
    avatar_url: string | null
    display_name: string | null
    id: string
    is_favorite: boolean
  } | null
}

export type CustomerServiceHistoryResponse = {
  service_history: CustomerServiceHistoryItem[]
}

type PendingDecisionItem = {
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

type ThreadSummary = {
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
  matching_state?: MatchingState | null
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
    provider: 'sepay_vietqr' | 'staging_simulator' | 'platform_bank_manual'
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
  safe_metadata?: {
    project_id_available?: boolean
    role?: UserRole | null
    source?: 'expo-notifications'
  }
}

export type DevicePushTokenResponse = {
  token_id: string
  enabled: boolean
  updated_at: string
}

export type CustomerScopeDecisionResponse = {
  scope_change_id: string
  job_id: string
  status: ScopeChangeStatus
  decided_at: string
}
