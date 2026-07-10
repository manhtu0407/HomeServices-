// Canonical mobile-api response contracts for the Edge runtime.
// This is the Deno-side mirror of packages/shared/src/types/api-responses.ts. The Edge cannot import
// packages/shared directly (Deno/npm + Supabase deploy-root boundary), so these contracts live here as
// the single Edge home and are kept byte-equivalent to the shared canonical. A value-level parity test
// (packages/shared/src/__tests__/mobile-wiring.test.ts) fails CI if the two drift. Edit both together.
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

export type KaelChatNextAction =
  | "await_input"
  | "collect_evidence"
  | "ask_photo"
  | "ask_video"
  | "estimate_ready"
  | "unsupported"
  | "budget_exceeded"
  | "confirmed";

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
