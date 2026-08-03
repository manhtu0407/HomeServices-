import type {
  LearningSkillCandidate,
  LearningSkillTrigger,
} from "./skills/registry.ts";
type DbError = { code?: string; message?: string };
type DbResult<T = unknown> = { data: T | null; error: DbError | null };
type QueryLike<T = unknown> = PromiseLike<DbResult<T>>;

type QueryBuilder<T = unknown> = {
  select(columns?: string): QueryBuilder<T>;
  insert(value: unknown): QueryBuilder<T>;
  update(value: unknown): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  gte(column: string, value: unknown): QueryBuilder<T>;
  lte(column: string, value: unknown): QueryBuilder<T>;
  order(column: string, options?: Record<string, unknown>): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  single(): QueryBuilder<T>;
  maybeSingle(): QueryBuilder<T>;
  then: QueryLike<T>["then"];
};

export type LearningQueueDbClient = {
  from(table: string): QueryBuilder;
  rpc?(name: string, args?: Record<string, unknown>): QueryBuilder | QueryLike;
};

export type QueuedLearningRow = {
  id: string;
  event_type: LearningSkillTrigger;
  skill_id: string;
  job_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  queue_state: string;
  input_payload: Record<string, unknown>;
  candidate_payload: LearningSkillCandidate;
  attempts: number;
  created_at: string;
};

export type QueueLearningForBatchSummary = {
  queued: number;
  manual_review: number;
  rejected: number;
  skill_ids: string[];
  error_code?: string;
};

export type ProcessLearningQueueSummary = {
  selected: number;
  submitted: number;
  realtime_fallback: number;
  batch_id?: string;
  provider_batch_id?: string;
  skipped_reason?: string;
  error_code?: string;
};
export type ClaimedLearningQueueRows = {
  claimId: string;
  rows: QueuedLearningRow[];
  errorCode?: string;
};

export async function claimLearningQueueRows(
  client: LearningQueueDbClient,
  options: {
    limit: number;
    now: Date;
  },
): Promise<ClaimedLearningQueueRows> {
  const claimId = crypto.randomUUID();
  if (!client.rpc) {
    return { claimId, rows: [], errorCode: "CLAIM_RPC_UNAVAILABLE" };
  }
  const rowsResult = await client.rpc("claim_kael_learning_queue_atomic", {
    p_claim_id: claimId,
    p_limit: options.limit,
    p_now: options.now.toISOString(),
  });
  if (rowsResult.error) {
    return { claimId, rows: [], errorCode: rowsResult.error.code ?? "DB_ERROR" };
  }
  const rows = Array.isArray(rowsResult.data)
    ? rowsResult.data as QueuedLearningRow[]
    : [];
  return { claimId, rows };
}
export function buildPostJobLearningMessages(row: QueuedLearningRow) {
  return [
    {
      role: "system" as const,
      content:
        "You are Kael's background learning processor. Return compact JSON only. Never change prices, payments, bookings, worker approval, or service scope.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        event_type: row.event_type,
        skill_id: row.skill_id,
        candidate: row.candidate_payload,
        input: row.input_payload,
        expected_output: {
          format: "json_object",
          root: "candidate",
          instruction:
            "Return exactly {\"candidate\": <candidate>} with no prose. Preserve the candidate schema fields and only add safe aggregate evidence under candidate.payload.evidence_snapshot when available.",
          evidence_snapshot: {
            evidence_count: "integer count of safe reviewed transactions",
            confidence: "number from 0 to 1",
            completed_transaction_count: "integer count of completed/reviewed transactions",
            recent_contradiction_ratio: "number from 0 to 1",
          },
          forbidden:
            "Do not return raw chat text, addresses, phone numbers, payment data, final-price mutations, booking actions, or expanded service scope.",
        },
      }),
    },
  ];
}
