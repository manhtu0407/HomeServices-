export type EdgeCompensationStatus = "awaiting_worker" | "awaiting_customer" | "agreed" | "declined" | "expired";

export type EdgeCompensationOffer = {
  actor_role: "customer" | "worker";
  action: "claim" | "counter" | "accept" | "decline";
  amount_vnd: number | null;
  note: string | null;
  created_at: string;
};

export type EdgeCompensationNegotiation = {
  id: string;
  case_id: string;
  job_id: string | null;
  violation_code: string;
  worker_name: string | null;
  status: EdgeCompensationStatus;
  current_amount_vnd: number;
  respond_by: string;
  offers_left: number;
  agreed_at: string | null;
  payout: { status: "reserved" | "paid"; amount_vnd: number; paid_at: string | null } | null;
  offers: EdgeCompensationOffer[];
  evidence: Array<{ path: string; signed_url: string | null }>;
};

export type EdgeCompensationPolicy = {
  min_vnd: number;
  max_vnd: number;
  response_days: number;
  max_offers: number;
};

export type EdgeCustomerCompensationItem = {
  case_id: string;
  job_id: string;
  violation_code: string;
  worker_name: string | null;
  decided_at: string;
  negotiation: EdgeCompensationNegotiation | null;
};

export type EdgeCustomerCompensationResponse = {
  policy: EdgeCompensationPolicy;
  refund_account_ready: boolean;
  items: EdgeCustomerCompensationItem[];
};

export type EdgeWorkerCompensationResponse = {
  policy: EdgeCompensationPolicy;
  withdrawable_vnd: number;
  negotiations: EdgeCompensationNegotiation[];
};

export type EdgeAdminCompensationNegotiation = EdgeCompensationNegotiation & {
  customer_name: string | null;
  worker_id: string;
};

export type EdgeAdminCompensationResponse = {
  negotiations: EdgeAdminCompensationNegotiation[];
};

export type EdgeCompensationEvidenceUpload = {
  path: string;
  signed_url: string;
  token: string;
};

export type EdgeCompensationPayee = {
  account: {
    bank_name: string;
    account_holder_name: string;
    bank_account: string;
    verified: boolean;
  } | null;
};
