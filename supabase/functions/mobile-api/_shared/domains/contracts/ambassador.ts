export type EdgeAmbassadorMilestone = {
  id: string;
  rank: number;
  title_vi: string;
  title_en: string;
  points_required: number;
  reward_vnd: number;
};

export type EdgeAmbassadorMultiplierTier = {
  min_active_customers: number;
  multiplier_bps: number;
};

export type EdgeAmbassadorProgram = {
  id: string;
  version: number;
  status: "draft" | "approved" | "retired";
  commission_vnd_per_point: number;
  customer_vnd_per_point: number;
  link_months: number;
  network_window_days: number;
  rebook_min_jobs: number;
  invite_claim_days: number;
  approved_at: string | null;
  updated_at: string;
  milestones: EdgeAmbassadorMilestone[];
  multipliers: EdgeAmbassadorMultiplierTier[];
};

export type EdgeAdminAmbassadorProgramVersion = EdgeAmbassadorProgram & {
  created_by: string | null;
  approved_by: string | null;
  violations: string[];
};

export type EdgeAdminAmbassadorProgramResponse = {
  approved: EdgeAdminAmbassadorProgramVersion | null;
  draft: EdgeAdminAmbassadorProgramVersion | null;
};

export type EdgeAmbassadorPointEntryKind =
  | "order_accrual"
  | "accrual_reversal"
  | "redemption"
  | "penalty_debit"
  | "penalty_forfeit"
  | "appeal_restore"
  | "admin_correction";

export type EdgeAmbassadorPointEntry = {
  id: string;
  entry_kind: EdgeAmbassadorPointEntryKind;
  points_milli: number;
  commission_basis_vnd: number | null;
  multiplier_bps: number | null;
  created_at: string;
};

export type EdgeAmbassadorRedemption = {
  id: string;
  milestone_id: string;
  reward_vnd: number;
  tax_withheld_vnd: number;
  net_vnd: number;
  created_at: string;
};

export type EdgeAmbassadorSummaryResponse = {
  program: EdgeAmbassadorProgram | null;
  referral_code: string | null;
  points_milli: number;
  linked_customers: number;
  active_customers: number;
  multiplier_bps: number;
  redemption_frozen_until: string | null;
  network_frozen_until: string | null;
  tax_policy_ready: boolean;
  recent_entries: EdgeAmbassadorPointEntry[];
  redemptions: EdgeAmbassadorRedemption[];
};

export type EdgeAmbassadorCodeResponse = {
  referral_code: string;
};

export type EdgeAmbassadorRedeemReceipt = {
  redemption_id: string;
  reward_vnd: number;
  tax_withheld_vnd: number;
  net_vnd: number;
  points_left_milli: number;
  replayed: boolean;
};

export type EdgeReferralClaimOutcome =
  | "LINKED"
  | "ALREADY_LINKED"
  | "CODE_NOT_FOUND"
  | "LINKED_TO_OTHER_WORKER"
  | "CLAIM_WINDOW_CLOSED"
  | "ALREADY_TRANSACTED"
  | "RATE_LIMITED"
  | "PROGRAM_UNAVAILABLE";

export type EdgeReferralClaimResponse = {
  outcome: EdgeReferralClaimOutcome;
  linked_worker_id: string | null;
};

export type EdgeInviteClaimStatus =
  | "open"
  | "linked"
  | "window_closed"
  | "transacted"
  | "program_unavailable";

export type EdgeCustomerMembershipResponse = {
  points: number;
  customer_vnd_per_point: number | null;
  linked_worker: {
    worker_id: string;
    display_name: string | null;
    source: "invite_code" | "rebook";
    expires_at: string;
  } | null;
  // null while the database still runs the summary that predates invite_claim.
  invite_claim: {
    status: EdgeInviteClaimStatus;
    closes_at: string | null;
    claim_days: number | null;
    link_months: number | null;
  } | null;
  recent_entries: Array<{
    job_id: string;
    entry_kind: "accrual" | "reversal";
    points: number;
    created_at: string;
  }>;
};
