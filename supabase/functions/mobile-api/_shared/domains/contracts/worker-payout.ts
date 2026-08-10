export type WorkerPayoutMethodStatus =
  | "pending_verification"
  | "verified"
  | "rejected";

export type WorkerWithdrawalRequestStatus =
  | "pending"
  | "processing"
  | "paid"
  | "rejected"
  | "failed";

export type EdgeWorkerPayoutMethod = {
  id: string;
  bank_key: string;
  bank_name: string;
  bank_account_masked: string;
  status: WorkerPayoutMethodStatus;
  reviewed_at: string | null;
  updated_at: string;
};

export type EdgeWorkerPayoutMethodResponse = {
  payout_method: EdgeWorkerPayoutMethod | null;
};

export type EdgeWorkerWithdrawalRequest = {
  id: string;
  amount_vnd: number;
  available_balance_before_vnd: number;
  bank_key: string;
  bank_name: string;
  bank_account_masked: string;
  status: WorkerWithdrawalRequestStatus;
  requested_at: string;
  processing_at: string | null;
  processed_at: string | null;
  transfer_reference: string | null;
  resolution_reason: string | null;
  updated_at: string;
};

export type EdgeWorkerWithdrawalRequestListResponse = {
  requests: EdgeWorkerWithdrawalRequest[];
};

export type EdgeWorkerWithdrawalRequestCreateResponse = {
  request: EdgeWorkerWithdrawalRequest;
};
