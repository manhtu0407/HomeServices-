import type {
  CustomerKaelConversationCreateInput,
  CustomerKaelConversationMode,
  CustomerKaelConversationPinInput,
  CustomerKaelConversationRenameInput,
  CustomerKaelConversationTurnInput,
} from '@nestscout/shared'

export type {
  CustomerKaelConversationCreateInput,
  CustomerKaelConversationMode,
  CustomerKaelConversationPinInput,
  CustomerKaelConversationRenameInput,
  CustomerKaelConversationTurnInput,
}

export type CustomerKaelConversationSession = {
  id: string
  mode: CustomerKaelConversationMode
  customer_id: string
  case_job_id: string | null
  case_session_id: string | null
  client_request_id: string
  title: string | null
  pinned_at: string | null
  started_at: string
  updated_at: string
  total_turns: number
}

export type CustomerKaelConversationTurn = {
  id: string
  conversation_id: string
  turn_index: number
  role: 'customer' | 'kael' | 'system'
  text_content: string
  created_at: string
}

export type CustomerKaelConversationResponse = {
  session: CustomerKaelConversationSession
  turns: CustomerKaelConversationTurn[]
}

export type CustomerKaelConversationListResponse = {
  sessions: CustomerKaelConversationSession[]
}

export type CustomerKaelConversationArchiveResponse = {
  session_id: string
  archived_at: string
  case_session_id: string | null
  job_id: string | null
  job_status: import('@nestscout/shared').JobStatus | null
  case_action: 'none' | 'abandoned' | 'cancelled' | 'review_requested' | 'already_closed'
}

export type CustomerProfileInsightsResponse = {
  customer_id: string
  member_since: string | null
  kael_interaction_count: number
  completed_service_count: number
  saved_address_count: number
  preferred_service_count: number
  active_service_days: number
  active_streak_days: number
  reviewed_service_count?: number
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

export type WorkerCandidateView = {
  candidate_id: string
  worker_id: string
  status: 'proposed' | 'customer_confirmed' | 'customer_declined' | 'expired' | 'withdrawn'
  display_name: string | null
  avatar_url: string | null
  rating: number | null
  total_jobs: number
  years_experience: number
  verification_status: string
  is_favorite: boolean
  proposed_at: string
  expires_at: string | null
  customer_decided_at: string | null
}

export type WorkerCandidateResponse = {
  job_id: string
  status: import('@nestscout/shared').JobStatus
  candidate: WorkerCandidateView | null
}

export type WorkerCandidateDecisionResponse = WorkerCandidateResponse & {
  candidate: WorkerCandidateView
  already_applied: boolean
  broadcast_sent?: boolean
  message?: string
}

export type CustomerFavoriteWorkerResponse = {
  worker_id: string
  is_favorite: boolean
}
