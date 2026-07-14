import type { EdgeCustomerKaelConversationMode, JobStatus } from "../../../_shared/domain.ts";

export type EdgeCustomerKaelConversationCaseAction =
  | "none"
  | "abandoned"
  | "cancelled"
  | "review_requested"
  | "already_closed";

export type EdgeCustomerKaelConversationSessionResponse = {
  id: string;
  mode: EdgeCustomerKaelConversationMode;
  customer_id: string;
  case_job_id: string | null;
  case_session_id: string | null;
  client_request_id: string;
  title: string | null;
  pinned_at: string | null;
  started_at: string;
  updated_at: string;
  total_turns: number;
};

export type EdgeCustomerKaelConversationTurnResponse = {
  id: string;
  conversation_id: string;
  turn_index: number;
  role: "customer" | "kael" | "system";
  text_content: string;
  created_at: string;
};

export type EdgeCustomerKaelConversationResponse = {
  session: EdgeCustomerKaelConversationSessionResponse;
  turns: EdgeCustomerKaelConversationTurnResponse[];
};

export type EdgeCustomerKaelConversationListResponse = {
  sessions: EdgeCustomerKaelConversationSessionResponse[];
};

export type EdgeCustomerKaelConversationArchiveResponse = {
  session_id: string;
  archived_at: string;
  case_session_id: string | null;
  job_id: string | null;
  job_status: JobStatus | null;
  case_action: EdgeCustomerKaelConversationCaseAction;
};
