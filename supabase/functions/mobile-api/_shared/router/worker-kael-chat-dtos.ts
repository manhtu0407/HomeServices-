import type { WorkerKaelChatCreateInput } from "../../../_shared/domain.ts";

export type EdgeWorkerKaelChatStatus = "active" | "closed" | "escalated" | "error";

export type EdgeWorkerKaelChatTurnResponse = {
  id: string;
  session_id: string;
  turn_index: number;
  role: "worker" | "kael" | "system";
  content_type: "text" | "clarification" | "guidance" | "photo_request" | "photo_attached" | "error";
  text_content: string | null;
  media_refs: string[];
  safety_notes: string[];
  created_at: string;
};

export type EdgeWorkerKaelChatSessionResponse = {
  id: string;
  job_id: string;
  mode: WorkerKaelChatCreateInput["mode"];
  worker_id: string;
  status: EdgeWorkerKaelChatStatus;
  title: string | null;
  pinned_at: string | null;
  started_at: string;
  closed_at: string | null;
  total_turns: number;
  progress: {
    current_stage: string;
    status: "queued" | "running" | "completed" | "failed";
    progress: number;
    failure_reason: string | null;
    updated_at: string;
  } | null;
};

export type EdgeWorkerKaelChatResponse = {
  session: EdgeWorkerKaelChatSessionResponse;
  turns: EdgeWorkerKaelChatTurnResponse[];
};

export type EdgeWorkerKaelChatListResponse = {
  sessions: EdgeWorkerKaelChatSessionResponse[];
};

export type EdgeWorkerKaelChatArchiveResponse = {
  session_id: string;
  archived_at: string;
};
