import type {
  EdgeKaelCaseWorkPhase,
  EdgeKaelIntakeConfirmation,
} from "../../../../_shared/contracts.ts";
import type { ComplexityLevel, ServiceType } from "../../../../_shared/domain.ts";
import type {
  EdgeConfirmationOperationReceipt,
  EdgeIntakeCoverage,
  EdgeQuoteMode,
} from "../../../../_shared/contracts/stage1-reliability.ts";

export type EdgeKaelEstimate = {
  service_type: ServiceType;
  problem_category: string;
  problem_summary: string;
  complexity: ComplexityLevel;
  price_min: number;
  price_max: number;
  confidence: number;
  advisory: string | null;
  disclaimer: string;
};

export type EdgeKaelChatStatus =
  | "active"
  | "collecting_evidence"
  | "estimate_ready"
  | "confirmed"
  | "abandoned"
  | "unsupported";

export type EdgeKaelChatNextAction =
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
  | "request_evidence"
  | "collect_required"
  | "offer_review"
  | "rfq_review"
  | "inspection_review"
  | "blocked"
  | "reconcile_confirmation";

export type EdgeKaelChatTurnResponse = {
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
  estimate: EdgeKaelEstimate | null;
  created_at: string;
};

export type EdgeKaelChatSessionResponse = {
  id: string;
  job_id: string | null;
  customer_id: string;
  service_type: ServiceType;
  status: EdgeKaelChatStatus;
  case_phase: EdgeKaelCaseWorkPhase;
  diagnosis_scope: Record<string, unknown> | null;
  scheduled_at: string | null;
  estimate: EdgeKaelEstimate | null;
  started_at: string;
  estimate_ready_at: string | null;
  total_turns: number;
  total_cost_usd: number;
  next_action: EdgeKaelChatNextAction;
  intake_confirmation?: EdgeKaelIntakeConfirmation | null;
  quote_mode?: EdgeQuoteMode;
  policy_version?: number | null;
  intake_coverage?: EdgeIntakeCoverage | null;
  confirmation_operation?: EdgeConfirmationOperationReceipt | null;
};

export type EdgeKaelChatResponse = {
  session: EdgeKaelChatSessionResponse;
  turns: EdgeKaelChatTurnResponse[];
};

export type EdgeKaelChatProgressResponse = {
  session_id: string;
  progress: {
    current_stage: string;
    status: "queued" | "running" | "completed" | "failed";
    progress: number;
    failure_reason: string | null;
    updated_at: string;
  } | null;
};

export type EdgeKaelChatMediaUploadResponse = {
  bucket_id: "kael-chat-media";
  object_path: string;
  media_ref: string;
  token: string;
  signed_upload_url: string;
  expires_in_seconds: number;
};
