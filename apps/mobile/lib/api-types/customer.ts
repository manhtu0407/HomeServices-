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
