import type { BaselinePriceEvidenceReceipt } from "../evidence/baseline-price-evidence.ts";
import type { ScopeChangeKaelAnalysis } from "./types.ts";

export type ScopeChangeVerifiedPriceReceipt = {
  price_min: number;
  price_max: number;
  price_source: "verified_baseline";
  baseline_used: string;
  baseline_source: string;
  baseline_evidence: BaselinePriceEvidenceReceipt;
  baseline_district: string;
  reference_price_min: number;
  reference_price_max: number;
  selection_rule: "verified_neutral_midpoint_with_bilateral_confirmation";
  pricing_mode: "full_scope_total";
  pricing_basis: {
    calculation: string;
    quantity: number | null;
    unit: "cabinet_door_scope" | "accepted_scope";
    unit_price_min: number | null;
    unit_price_max: number | null;
  };
  pricing_components?: ReadonlyArray<{
    evidence_receipt: BaselinePriceEvidenceReceipt;
    kind: "approved_scope_change" | "original_confirmed_scope";
    price_max: number;
    price_min: number;
    selected_price: number;
  }>;
  stakeholder_balance: {
    customer_total: number;
    platform_fee: number;
    worker_net: number;
    commission_level: number;
    commission_rate_bps: number;
    worker_confirmation_required: true;
    customer_confirmation_required: true;
  };
  worker_price_confirmation?: {
    confirmed: true;
    confirmed_at: string;
    quote_id: string;
  };
};

export type ScopeChangeKaelEstimate =
  | (Extract<ScopeChangeKaelAnalysis, { fallback_used: false }> & ScopeChangeVerifiedPriceReceipt)
  | Extract<ScopeChangeKaelAnalysis, { fallback_used: true }>;
