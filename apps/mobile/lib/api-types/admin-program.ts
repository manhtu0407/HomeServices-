import type { CompensationNegotiation } from '../services/compensation-service'

import type { AmbassadorMilestoneView, WorkerViolationCaseView } from './program'

export type AdminAmbassadorProgramVersion = {
  id: string
  version: number
  status: 'draft' | 'approved' | 'retired'
  commission_vnd_per_point: number
  customer_vnd_per_point: number
  link_months: number
  network_window_days: number
  rebook_min_jobs: number
  invite_claim_days: number
  approved_at: string | null
  updated_at: string
  milestones: AmbassadorMilestoneView[]
  multipliers: Array<{ min_active_customers: number; multiplier_bps: number }>
  created_by: string | null
  approved_by: string | null
  violations: string[]
}

export type AdminAmbassadorProgramResponse = {
  approved: AdminAmbassadorProgramVersion | null
  draft: AdminAmbassadorProgramVersion | null
}

export type AdminAmbassadorProgramDraftInput = {
  commission_vnd_per_point: number
  customer_vnd_per_point: number
  link_months: number
  network_window_days: number
  rebook_min_jobs: number
  invite_claim_days: number
  milestones: Array<Omit<AmbassadorMilestoneView, 'id'>>
  multipliers: Array<{ min_active_customers: number; multiplier_bps: number }>
}

export type AdminViolationCaseSummary = WorkerViolationCaseView & {
  worker_id: string
  worker_name: string | null
}

export type AdminViolationCaseDetail = AdminViolationCaseSummary & {
  customer_id: string | null
  job_id: string | null
  evidence: Record<string, unknown>
  identity_recorded: boolean
  appeal: {
    reason: string
    evidence: Array<{ path: string; signed_url: string | null }>
    status: 'submitted' | 'upheld' | 'overturned'
    submitted_at: string
    decision_reason: string | null
  } | null
  chat_evidence: Array<{ original_body: string; matched_rules: string[]; created_at: string }>
  events: Array<{ event_kind: string; actor_id: string | null; detail: Record<string, unknown>; created_at: string }>
}

export type AdminIdentityBlock = {
  id: string
  kind: 'cccd' | 'phone' | 'email'
  case_id: string | null
  created_at: string
  lifted_at: string | null
  lift_reason: string | null
}

export type AdminViolationDecision = 'confirm' | 'dismiss' | 'fabricated_report'
export type AdminAppealDecision = 'upheld' | 'overturned'

export type AdminCompensationPayee = {
  account: { bank_name: string; account_holder_name: string; bank_account: string; verified: boolean } | null
}

export type AdminCompensationNegotiation = CompensationNegotiation & {
  customer_name: string | null
  worker_id: string
}
