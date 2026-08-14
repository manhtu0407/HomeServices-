// Canonical mobile-api response contracts for the Edge runtime.
// This is the Deno-side mirror of the mobile shared API-response contracts. The Edge cannot import
// workspace packages directly (Deno/npm + Supabase deploy-root boundary), so these contracts live here as
// the single Edge home and are kept byte-equivalent to the shared canonical. A value-level parity test
// the shared mobile-wiring parity test fails CI if the two drift. Edit both together.
import type { ComplexityLevel, JobStatus, ServiceType } from "./domain.ts";

export type KaelEstimateAnalysisReceipt = {
  schema_version: "analysis_receipt.v1";
  evidence: {
    analysis_status?: "analyzed" | "not_provided" | "unavailable";
    findings?: {
      confidence: "low" | "medium" | "high";
      evidence_index: number;
      evidence_kind: "photo" | "video_frame";
      observation: string;
      possible_meaning: string | null;
    }[];
    photo_count: number;
    video_frame_count: number;
    voice_transcript_count: number;
    skipped: boolean;
  };
  market: {
    accepted_source_count: number | null;
    high_trust_source_count: number | null;
    quorum_met: boolean | null;
  };
  problem?: {
    remaining_uncertainty: string | null;
    recommended_scope: string | null;
    severity_indicators: string[];
    summary: string;
  };
};

type BaselinePriceEvidenceReceiptResponse = {
  schema_version: "baseline_price_evidence_receipt.v1";
  accepted_source_count: number;
  aggregate_price_min: number;
  aggregate_price_max: number;
  high_trust_source_count: number;
  quorum_met: true;
  required_quorum: number;
  unit: BaselinePriceEvidenceUnitResponse;
  sources: BaselinePriceEvidenceSourceResponse[];
};

type BaselinePriceEvidenceSourceResponse = {
  domain: string;
  url: string;
  observed_at: string;
  price_min: number;
  price_max: number;
  unit: BaselinePriceEvidenceUnitResponse;
  effective_tier: 1 | 2;
  weight: number;
  normalization?: {
    original_price_min: number;
    original_price_max: number;
    original_unit: "per_item";
    quantity: number;
    calculation: string;
  };
};

type BaselinePriceEvidenceUnitResponse =
  | "per_visit"
  | "per_cabinet_door"
  | "per_item";

type KaelPriceReasoningReceipt = {
  schema_version: "price_reasoning_receipt.v1";
  receipt_id: string;
  problem: {
    confirmed_facts: string[];
    possible_causes: {
      statement: string;
      basis: ("customer_report" | "visual_evidence" | "service_profile" | "knowledge")[];
      confidence: "low" | "medium" | "high";
    }[];
    unknowns: string[];
  };
  scope: {
    included: string[];
    conditional: string[];
    excluded: string[];
  };
  costs: {
    currency: "VND";
    total_min: number;
    total_max: number;
    reconciliation: "package_total" | "exact";
    components: {
      kind:
        | "service_package"
        | "labor"
        | "travel"
        | "materials"
        | "replacement_parts"
        | "equipment"
        | "other";
      status:
        | "priced"
        | "included_unitemized"
        | "conditional_unpriced"
        | "excluded"
        | "undetermined";
      amount_min: number | null;
      amount_max: number | null;
      explanation: string;
    }[];
  };
  scenarios: {
    low: { total: number; conditions: string[]; scope: string[] };
    high: { total: number; conditions: string[]; scope: string[] };
  };
  fairness: {
    price_source:
      | "perplexity_validated"
      | "baseline_with_market"
      | "baseline_only"
      | "inspection_required";
    confidence: "low" | "medium" | "high";
    baseline_evidence?: BaselinePriceEvidenceReceiptResponse | null;
    market_source_count: number | null;
    high_trust_source_count: number | null;
    quorum_met: boolean | null;
    cap_statement: string;
    remaining_uncertainty: string[];
  };
};

type MatchingState = {
  strategy: "pending_choice" | "general" | "saved_worker_first";
  stage:
    | "awaiting_choice"
    | "saved_worker_search"
    | "general_search"
    | "candidate_ready"
    | "recovery_required"
    | "exhausted"
    | "stopped";
  checks: {
    kind: "service_capability" | "service_area" | "availability";
    state: "pending" | "verified";
  }[];
  batch: {
    attempt: number;
    recipient_count: number;
    deadline_at: string | null;
    seconds_remaining: number | null;
    strategy: "saved_worker" | "general";
  } | null;
  event_history: {
    kind:
      | "awaiting_customer_choice"
      | "saved_worker_requested"
      | "saved_worker_no_response"
      | "saved_worker_declined"
      | "saved_worker_unavailable"
      | "search_expanded"
      | "general_batch_sent"
      | "matching_recovery_required"
      | "no_worker_found"
      | "candidate_ready"
      | "search_stopped";
    occurred_at: string;
    recipient_count?: number;
  }[];
};

type FavoriteWorkerForMatching = {
  id: string;
  avatar_url: string | null;
  display_name: string | null;
  rating: number | null;
  total_jobs: number;
  availability: "available" | "unavailable";
  availability_reason: "not_available_for_this_request" | null;
};

type FavoriteWorkersForMatchingResponse = {
  job_id: string;
  workers: FavoriteWorkerForMatching[];
};

export type EdgeKaelMatchingContracts = {
  priceReasoningReceipt: KaelPriceReasoningReceipt;
  matchingState: MatchingState;
  favoriteWorker: FavoriteWorkerForMatching;
  favoriteWorkersResponse: FavoriteWorkersForMatchingResponse;
};

export type KaelEstimate = {
  service_type: ServiceType;
  problem_category: string;
  problem_summary: string;
  complexity: ComplexityLevel;
  price_min: number;
  price_max: number;
  confidence: number;
  advisory: string | null;
  disclaimer: string;
  needs_inspection?: boolean;
  price_source?: string | null;
  complexity_reasoning?: string | null;
  needs_inspection_reason?: string | null;
  market_signals?: string | null;
  analysis_receipt?: KaelEstimateAnalysisReceipt | null;
  price_reasoning_receipt?: KaelPriceReasoningReceipt | null;
};

export type CreateJobResponse = {
  job_id: string;
  display_code?: string;
  status: JobStatus;
  estimate: KaelEstimate;
  estimate_card_v3?: Record<string, unknown>;
  final_price?: number | null;
  fallback_used: boolean;
  broadcast_sent?: boolean;
  message?: string;
};

export type KaelChatStatus =
  | "active"
  | "collecting_evidence"
  | "estimate_ready"
  | "confirmed"
  | "abandoned"
  | "unsupported";

export type EdgeKaelCaseWorkPhase =
  | "analysis"
  | "offer_review"
  | "matching"
  | "worker_candidate_review"
  | "worker_en_route"
  | "service_execution"
  | "scope_change_review"
  | "completion_review"
  | "payment"
  | "review"
  | "closed";

type KaelCaseWorkPhase = EdgeKaelCaseWorkPhase;

export type KaelChatNextAction =
  | "confirm_intake"
  | "await_input"
  | "collect_evidence"
  | "ask_photo"
  | "ask_video"
  | "estimate_ready"
  | "unsupported"
  | "budget_exceeded"
  | "confirmed"
  | "ask_question"
  | "request_evidence";

export type EdgeKaelIntakeConfirmation = {
  version: 1;
  source: "booking";
  status: "pending" | "confirmed" | "correction_requested";
  blocking: boolean;
  checked_at: string;
  confirmed_at: string | null;
  correction_requested_at: string | null;
  focus: string;
  question: string;
  fields: Array<{
    key: "service" | "problem" | "description" | "location" | "schedule";
    label: string;
    value: string;
    state: "clear" | "attention" | "invalid";
    note: string | null;
  }>;
  issues: Array<{
    code:
      | "profile_mismatch"
      | "problem_missing"
      | "description_too_short"
      | "service_mismatch"
      | "out_of_scope"
      | "unsafe_input"
      | "location_missing"
      | "schedule_invalid"
      | "schedule_past"
      | "schedule_window_mismatch"
      | "safety_attention";
    field: "service" | "problem" | "description" | "location" | "schedule";
    severity: "attention" | "blocking";
    message: string;
  }>;
  intake: {
    service_type: ServiceType;
    profile_id:
      | "electric_diagnose"
      | "water_diagnose"
      | "clean_scope"
      | "air_scope"
      | "fabric_scope"
      | "task_scope";
    description: string;
    problem_chips: string[];
    address_label: string;
    address_district: string;
    scheduled_at: string;
    schedule_window: {
      date: string;
      start: string;
      end: string;
      time_zone: "Asia/Ho_Chi_Minh";
    };
  };
};

type KaelIntakeConfirmation = EdgeKaelIntakeConfirmation;

export type KaelChatTurn = {
  id: string;
  session_id: string;
  turn_index: number;
  role: "customer" | "kael" | "system";
  content_type:
    | "text"
    | "photo_request"
    | "video_request"
    | "photo_attached"
    | "video_attached"
    | "clarification"
    | "analysis"
    | "estimate"
    | "error";
  text_content: string | null;
  media_refs: string[];
  estimate: KaelEstimate | null;
  clarification?: { question: string | null; missing_slots: string[] } | null;
  created_at: string;
};

export type KaelChatSession = {
  id: string;
  job_id: string | null;
  customer_id: string;
  service_type: ServiceType;
  status: KaelChatStatus;
  case_phase: KaelCaseWorkPhase;
  diagnosis_scope: Record<string, unknown> | null;
  evidence_previews?: {
    evidence_index: number;
    evidence_kind: "photo" | "video_frame";
    url: string;
  }[];
  scheduled_at: string | null;
  estimate: KaelEstimate | null;
  started_at: string;
  estimate_ready_at: string | null;
  total_turns: number;
  total_cost_usd: number;
  next_action: KaelChatNextAction;
  intake_confirmation?: KaelIntakeConfirmation | null;
};

export type KaelChatResponse = {
  session: KaelChatSession;
  turns: KaelChatTurn[];
};
