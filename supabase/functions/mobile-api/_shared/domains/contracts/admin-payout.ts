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
  cursor?: string;
  query?: string;
};

export type AdminWithdrawalRequestListInput = {
  assignment: "all" | "mine" | "unassigned";
  status: AdminWithdrawalRequestStatus | "all";
  limit: number;
  cursor?: string;
  query?: string;
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
  version: number;
};

export type AdminPayoutMethodListResponse = {
  generated_at: string;
  payout_methods: AdminPayoutMethodSummary[];
  has_more: boolean;
  next_cursor: string | null;
  total_count: number | null;
};

export type AdminPayoutMethodDetailResponse = {
  generated_at: string;
  payout_method: AdminPayoutMethodSummary;
};

export type AdminSensitivePayoutAccessInput = { reason: string };
export type AdminSensitivePayoutAccessResponse = {
  expires_at: string;
  account_holder_name: string;
  bank_account: string;
};

export type AdminPayoutMethodDecisionInput = {
  decision: "verify" | "reject";
  reason?: string;
  expected_version: number;
  client_request_id: string;
};

export type AdminPayoutMethodDecisionResponse = {
  ok: true;
  payout_method_id: string;
  status: Exclude<AdminPayoutMethodStatus, "pending_verification">;
  reviewed_at: string;
  version: number;
  generated_at: string;
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
  eligible_at: string;
  processing_at: string | null;
  processing_by_name: string | null;
  processing_by_me: boolean;
  processed_at: string | null;
  processed_by_name: string | null;
  transfer_reference_suffix: string | null;
  resolution_reason: string | null;
  updated_at: string;
  version: number;
};

export type AdminWithdrawalRequestListResponse = {
  generated_at: string;
  withdrawal_requests: AdminWithdrawalRequestSummary[];
  has_more: boolean;
  next_cursor: string | null;
  total_count: number | null;
};

export type AdminWithdrawalRequestDetailResponse = {
  generated_at: string;
  withdrawal_request: AdminWithdrawalRequestSummary;
};

export type AdminWithdrawalRequestClaimInput = {
  expected_version: number;
  client_request_id: string;
  takeover_reason?: string;
};

export type AdminWithdrawalRequestReleaseInput = {
  expected_version: number;
  client_request_id: string;
  reason: string;
};

export type AdminWithdrawalRequestClaimResponse = {
  ok: true;
  request_id: string;
  status: "processing";
  processing_by: string;
  processing_at: string;
  version: number;
  generated_at: string;
};

export type AdminWithdrawalRequestResolveInput = {
  decision: "paid" | "rejected" | "failed";
  transfer_reference?: string;
  reason?: string;
  external_transfer_confirmed?: true;
  expected_version: number;
  client_request_id: string;
};

export type AdminWithdrawalRequestResolveResponse = {
  ok: true;
  request_id: string;
  status: "paid" | "rejected" | "failed";
  processed_at: string;
  version: number;
  event_id: string;
  generated_at: string;
};

export type AdminWithdrawalRequestReleaseResponse = {
  ok: true;
  request_id: string;
  status: "pending";
  version: number;
  generated_at: string;
};
