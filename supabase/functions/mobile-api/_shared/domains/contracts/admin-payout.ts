export type AdminPayoutMethodStatus =
  | "pending_verification"
  | "verified"
  | "rejected";

export type AdminWithdrawalRequestStatus =
  | "pending"
  | "processing"
  | "paid"
  | "rejected"
  | "failed";

export type AdminPayoutMethodListInput = {
  status: AdminPayoutMethodStatus | "all";
  limit: number;
  offset: number;
};

export type AdminWithdrawalRequestListInput = {
  status: AdminWithdrawalRequestStatus | "all";
  limit: number;
  offset: number;
};

export type AdminPayoutMethodSummary = {
  id: string;
  worker_id: string;
  worker_name: string | null;
  bank_key: string;
  bank_name: string;
  bank_account_masked: string;
  status: AdminPayoutMethodStatus;
  reviewed_at: string | null;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminPayoutMethodListResponse = {
  payout_methods: AdminPayoutMethodSummary[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number | null;
};

export type AdminPayoutMethodDetailResponse = {
  payout_method: AdminPayoutMethodSummary & {
    account_holder_name: string;
    bank_account: string;
  };
};

export type AdminPayoutMethodDecisionInput = {
  decision: "verify" | "reject";
  reason?: string;
};

export type AdminPayoutMethodDecisionResponse = {
  ok: true;
  payout_method_id: string;
  status: Exclude<AdminPayoutMethodStatus, "pending_verification">;
  reviewed_at: string;
};

export type AdminWithdrawalRequestSummary = {
  id: string;
  worker_id: string;
  worker_name: string | null;
  amount_vnd: number;
  available_balance_before_vnd: number;
  bank_key: string;
  bank_name: string;
  bank_account_masked: string;
  status: AdminWithdrawalRequestStatus;
  requested_at: string;
  processing_at: string | null;
  processing_by_name: string | null;
  processed_at: string | null;
  processed_by_name: string | null;
  transfer_reference: string | null;
  resolution_reason: string | null;
  updated_at: string;
};

export type AdminWithdrawalRequestListResponse = {
  withdrawal_requests: AdminWithdrawalRequestSummary[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number | null;
};

export type AdminWithdrawalRequestDetailResponse = {
  withdrawal_request: AdminWithdrawalRequestSummary & {
    account_holder_name: string;
    bank_account: string;
  };
};

export type AdminWithdrawalRequestClaimResponse = {
  ok: true;
  request_id: string;
  status: "processing";
  processing_by: string;
  processing_at: string;
};

export type AdminWithdrawalRequestResolveInput = {
  decision: "paid" | "rejected" | "failed";
  transfer_reference?: string;
  reason?: string;
};

export type AdminWithdrawalRequestResolveResponse = {
  ok: true;
  request_id: string;
  status: "paid" | "rejected" | "failed";
  processed_at: string;
};
