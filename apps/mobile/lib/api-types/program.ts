export type AmbassadorMilestoneView = {
  id: string
  rank: number
  title_vi: string
  title_en: string
  points_required: number
  reward_vnd: number
}

export type AmbassadorProgramView = {
  id: string
  version: number
  commission_vnd_per_point: number
  link_months: number
  network_window_days: number
  invite_claim_days: number
  milestones: AmbassadorMilestoneView[]
  multipliers: Array<{ min_active_customers: number; multiplier_bps: number }>
}

export type AmbassadorPointEntryKind =
  | 'order_accrual'
  | 'accrual_reversal'
  | 'redemption'
  | 'penalty_debit'
  | 'penalty_forfeit'
  | 'appeal_restore'
  | 'admin_correction'

export type AmbassadorPointEntryView = {
  id: string
  entry_kind: AmbassadorPointEntryKind
  points_milli: number
  created_at: string
}

export type AmbassadorRedemptionView = {
  id: string
  milestone_id: string
  reward_vnd: number
  tax_withheld_vnd: number
  net_vnd: number
  created_at: string
}

export type WorkerAmbassadorSummary = {
  program: AmbassadorProgramView | null
  referral_code: string | null
  points_milli: number
  linked_customers: number
  active_customers: number
  multiplier_bps: number
  redemption_frozen_until: string | null
  network_frozen_until: string | null
  tax_policy_ready: boolean
  recent_entries: AmbassadorPointEntryView[]
  redemptions: AmbassadorRedemptionView[]
}

export type AmbassadorRedeemReceiptView = {
  redemption_id: string
  reward_vnd: number
  tax_withheld_vnd: number
  net_vnd: number
  points_left_milli: number
  replayed: boolean
}

export type ViolationConsequenceView = {
  entry_kind: string
  effective_until: string | null
  restored: boolean
}

export type WorkerViolationCaseView = {
  id: string
  violation_code: string
  level: number
  source: 'detector' | 'admin' | 'customer_report'
  statement: string | null
  status: 'proposed' | 'confirmed' | 'dismissed' | 'fabricated_report'
  decision_deadline_at: string
  decided_at: string | null
  decision_reason: string | null
  appeal_status: 'none' | 'submitted' | 'upheld' | 'overturned'
  appeal_deadline_at: string | null
  suspended_pending_review: boolean
  created_at: string
  consequences: ViolationConsequenceView[]
}

export type DisciplinePolicyView = {
  l1_matching_days: number
  l2_points_debit: number
  l2_network_freeze_days: number
  l3_freeze_days: number
  strike_window_months: number
  appeal_window_days: number
  withdrawal_hold_days: number
}

export type AppealEvidenceUploadIntent = {
  path: string
  signed_url: string
  token: string
}
