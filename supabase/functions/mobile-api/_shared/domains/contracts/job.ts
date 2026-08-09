import type {
  ApartmentAccessProfileInput,
  JobStatus,
  MessageSender,
} from "../../../../_shared/domain.ts";
import type {
  EdgeKaelEstimate,
} from "./kael-chat.ts";
import type {
  EdgeWorkerScopeChangeResponse,
} from "./worker.ts";

export type EdgeCreateJobResponse = {
  job_id: string;
  display_code?: string;
  status: JobStatus;
  estimate: EdgeKaelEstimate;
  estimate_card_v3?: Record<string, unknown>;
  final_price?: number | null;
  fallback_used: boolean;
  broadcast_sent?: boolean;
  message?: string;
};

export type EdgeConfirmSearchResponse = {
  job_id: string;
  status: JobStatus;
  broadcast_sent: boolean;
  worker: null | { full_name: string; rating: number; total_jobs: number };
  message: string;
};

export type EdgeStatusUpdateResponse = {
  job_id: string;
  from_status: JobStatus;
  to_status: JobStatus;
  updated_at: string;
};

export type EdgeConfirmCompletionResponse = {
  job_id: string;
  status: JobStatus;
  final_price: number | null;
};

export type EdgeReviewResponse = { review_id: string; job_id: string; status: JobStatus };

export type EdgeAddressAccessView = {
  release_stage: "area_only" | "building_released" | "unit_released";
  exact_unit_released: boolean;
  worker_checked_in: boolean;
  check_in_required: boolean;
  identity_check_required: boolean;
  customer_handoff_required: boolean;
  evidence_mode: "none" | "geofence" | "manual_photo";
  access_profile: ApartmentAccessProfileInput;
};

export type EdgeWorkerCandidateView = {
  candidate_id: string;
  worker_id: string;
  status: "proposed" | "customer_confirmed" | "customer_declined" | "expired" | "withdrawn";
  display_name: string | null;
  avatar_url: string | null;
  rating: number | null;
  total_jobs: number;
  years_experience: number;
  verification_status: string;
  is_favorite: boolean;
  proposed_at: string;
  expires_at: string | null;
  customer_decided_at: string | null;
};

export type EdgeWorkerCandidateResponse = {
  job_id: string;
  status: JobStatus;
  candidate: EdgeWorkerCandidateView | null;
};

export type EdgeConfirmWorkerCandidateResponse = EdgeWorkerCandidateResponse & {
  candidate: EdgeWorkerCandidateView;
  already_applied: boolean;
};

export type EdgeRejectWorkerCandidateResponse = EdgeWorkerCandidateResponse & {
  candidate: EdgeWorkerCandidateView;
  already_applied: boolean;
  broadcast_sent: boolean;
  message: string;
};

export type EdgeJobIncidentStatus =
  | "open"
  | "awaiting_worker"
  | "awaiting_customer"
  | "ready_for_scope_proposal"
  | "scope_proposed"
  | "resolved"
  | "cancelled";

export type EdgeJobIncident = {
  id: string;
  job_id: string;
  status: EdgeJobIncidentStatus;
  evidence_status: "needs_more" | "ready";
  last_summary: string | null;
  last_question: string | null;
  last_next_actor: "customer" | "worker" | null;
  created_at: string;
  updated_at: string;
};

export type EdgeJobIncidentResponse = { incident: EdgeJobIncident | null };

export type EdgeJobIncidentScopeProposalResponse = {
  incident: EdgeJobIncident;
  scope_change: EdgeWorkerScopeChangeResponse;
};

export type EdgeDisputeOpenResponse = {
  dispute_id: string;
  job_id: string;
  status: string;
  dispute_type: string;
  evidence_snapshot_id: string;
  admin_review_required: boolean;
  priority: "low" | "medium" | "high" | "critical";
  evidence_locked_at: string;
  message: string;
  created_at: string;
};

export type EdgeDisputeCounterStatementResponse = {
  dispute_id: string;
  status: string;
  counter_party_statement_submitted: boolean;
  updated_at: string;
};

export type EdgeDisputeAdminDecisionResponse = {
  dispute_id: string;
  status: string;
  outcome: string;
  decided_at: string;
};

export type EdgeJobMediaAttachResponse = {
  job_id: string;
  photo_urls: string[];
  media: {
    bucket_id: "job-media";
    object_path: string;
    storage_ref: string;
    stage: "before" | "after" | "kael_reference" | "cancellation_evidence" | "scope_change_evidence" | "access_check_in";
  }[];
};

export type EdgeJobMessageResponse = {
  id: string;
  job_id: string;
  sender_id: string | null;
  sender_role: MessageSender;
  content: string;
  is_read: boolean;
  created_at: string;
};

export type EdgeJobMessageListResponse = {
  job_id: string;
  messages: EdgeJobMessageResponse[];
};

export type EdgeJobMessageSendResponse = {
  message: EdgeJobMessageResponse;
};
