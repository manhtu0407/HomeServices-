// Canonical mobile-api response contracts for the Edge runtime.
// This is the Deno-side mirror of the mobile shared API-response contracts. The Edge cannot import
// workspace packages directly (Deno/npm + Supabase deploy-root boundary), so these contracts live here as
// the single Edge home and are kept byte-equivalent to the shared canonical. A value-level parity test
// the shared mobile-wiring parity test fails CI if the two drift. Edit both together.
import type { ComplexityLevel, JobStatus, ServiceType } from "./domain.ts";

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
  needs_inspection_reason?: string | null;
  market_signals?: string | null;
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
  scheduled_at: string | null;
  estimate: KaelEstimate | null;
  started_at: string;
  estimate_ready_at: string | null;
  total_turns: number;
  total_cost_usd: number;
  next_action: KaelChatNextAction;
};

export type KaelChatResponse = {
  session: KaelChatSession;
  turns: KaelChatTurn[];
};
