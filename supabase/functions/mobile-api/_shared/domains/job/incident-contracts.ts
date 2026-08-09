import type { JobStatus } from "../../../../_shared/domain.ts";

export const OPENABLE_JOB_STATUSES = new Set<JobStatus>([
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
]);

export const INCIDENT_MESSAGES = {
  load: "Không thể tải Kael Công việc",
  inspect: "Không thể kiểm tra Kael Công việc",
  open: "Không thể mở Kael Công việc",
  update: "Không thể cập nhật Kael Công việc",
};

export type IncidentRow = Record<string, unknown>;
export type JobRow = Record<string, unknown>;
export type JobMessageRow = {
  id: string;
  sender_role: "customer" | "worker" | "kael";
  content: string;
};
export type IncidentHistoryRow = {
  source_kind: "incident_opened" | "incident_updated" | "job_chat_message";
  actor_role: "customer" | "worker";
  content: string | null;
  media_refs: unknown;
};
export type AtomicIncidentRow = Record<string, unknown> & {
  error_code?: string | null;
  incident?: unknown;
  ok?: boolean;
};
export type IncidentSource = {
  assistantClaimId: string;
  eventId: string;
  revision: number;
};
