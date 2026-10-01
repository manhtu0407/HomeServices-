import type {
  EdgeCustomerKaelConversationMode,
  JobStatus,
  ServiceType,
} from "../../../../_shared/domain.ts";
import type { KaelPerformanceProfileId } from "../../platform/kael-contracts.ts";

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
  profile_id: KaelPerformanceProfileId | null;
  service_type: ServiceType | null;
  started_at: string;
  updated_at: string;
  total_turns: number;
};

export type EdgeCustomerKaelConversationTurnResponse = {
  id: string;
  conversation_id: string;
  client_request_id: string | null;
  turn_index: number;
  role: "customer" | "kael" | "system";
  text_content: string;
  media_refs?: string[];
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
