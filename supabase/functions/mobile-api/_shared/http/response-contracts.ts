export type EdgeKaelMemorySelfViewResponse = {
  subject_type: "customer" | "worker";
  memory: Record<string, unknown> | null;
};

export type EdgeKaelMemoryDeleteResponse = {
  subject_type: "customer" | "worker";
  deleted: true;
};

export type EdgePendingDecisionItem = {
  kind: "scope_change";
  scope_change_id: string;
  job_id: string;
  service_type: string | null;
  problem: string | null;
  requested_description: string;
  reason: string;
  price_min: number;
  price_max: number;
  created_at: string;
};

export type EdgePendingDecisionsResponse = {
  pending_decisions: EdgePendingDecisionItem[];
};

export type EdgeThreadSummary = {
  job_id: string;
  status: string;
  service_type: string | null;
  last_message: {
    content: string;
    sender_role: string | null;
    created_at: string;
  };
  unread_count: number;
};

export type EdgeThreadsResponse = {
  threads: EdgeThreadSummary[];
};
