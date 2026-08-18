import type {
  BroadcastStatus,
  JobStatus,
  ServiceType,
} from "../../../../_shared/domain.ts";
import type { SafeOriginalScopePriceQuote } from "../matching/original-scope-price-quote.ts";

export type EdgeAvailabilityToggleResponse = {
  worker_id: string;
  is_available: boolean;
  updated_at: string;
};

export type EdgeAcceptBroadcastResponse = {
  job_id: string;
  status: JobStatus;
  candidate_id: string;
  awaiting_customer_confirmation: true;
  already_applied: boolean;
};

export type EdgeDeclineBroadcastResponse = { job_id: string; declined: true };

export type EdgeBroadcastListResponse = {
  broadcasts: {
    broadcast_id: string;
    job_id: string;
    status: BroadcastStatus;
    service_type: ServiceType;
    problem_summary: string | null;
    district: string | null;
    estimated_price_min: number | null;
    estimated_price_max: number | null;
    estimated_earning_min: number | null;
    estimated_earning_max: number | null;
    media_count: number;
    worker_brief_core?: Record<string, unknown> | null;
    scheduled_at: string | null;
    sent_at: string | null;
    expires_at: string | null;
    seconds_remaining: number | null;
    original_scope_price_quote: SafeOriginalScopePriceQuote;
  }[];
};

export type EdgeEarningsResponse = {
  worker_id: string;
  total_jobs_paid: number;
  gross_earnings: number;
  platform_fee_total: number;
  net_earnings: number;
  available_balance: number;
  withdrawal_reserved_amount: number;
  withdrawn_total: number;
  collateral_reserved_amount: number;
  cash_commission_collected_total: number;
  cash_commission_due_total: number;
  pending_payment_count: number;
  pending_payment_amount: number;
  provisional_payment_count: number;
  provisional_payment_amount: number;
  on_hold_amount: number;
  current_commission_level: number;
  current_commission_rate_bps: number;
  withdrawal_eligible_at: string | null;
  recent_transactions: {
    job_id: string;
    display_code: string | null;
    entry_type: "worker_credit" | "cash_commission_debit";
    payment_state: "pending" | "available" | "on_hold" | "reversed" | "cash_collected" | "cash_reconciliation_due";
    settlement_state: "pending" | "customer_claimed" | "admin_verified" | "admin_rejected";
    gross_amount: number;
    platform_fee: number;
    worker_net: number;
    commission_level: number;
    commission_rate_bps: number;
    cash_commission_collected: number;
    cash_commission_due: number;
    recorded_at: string;
    available_at: string | null;
  }[];
  daily_earnings: {
    date: string;
    gross_earnings: number;
    platform_fee_total: number;
    net_earnings: number;
    paid_job_count: number;
  }[];
  from_date: string | null;
  to_date: string | null;
};
