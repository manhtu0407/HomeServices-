import { createClient } from "@supabase/supabase-js";
import { fetchBufferedWithTimeout } from "../_shared/network.ts";
import {
  readJsonRequestBounded,
  RequestJsonError,
} from "../_shared/request-json.ts";
import {
  isStorageRemoveSuccess,
  parseCleanupLimit,
  parseCleanupRows,
  parseCompletedCount,
} from "./retention-guards.ts";

const BUCKET = "kael-chat-media";
const JOB_MEDIA_BUCKET = "job-media";
const MAX_BATCH = 100;
const DELETE_CONCURRENCY = 10;
const STORAGE_TIMEOUT_MS = 15_000;
const MAX_JSON_BODY_BYTES = 4 * 1024;
const SUPABASE_MAX_RESPONSE_BYTES = 1024 * 1024;

type CleanupPlan = {
  bucket: typeof BUCKET | typeof JOB_MEDIA_BUCKET;
  claimRpc: "claim_kael_chat_media_cleanup_batch" | "claim_job_media_cleanup_batch";
  completeRpc: "complete_kael_chat_media_cleanup" | "complete_job_media_cleanup";
  label: "job" | "kael";
};

const CLEANUP_PLANS: CleanupPlan[] = [
  {
    bucket: BUCKET,
    claimRpc: "claim_kael_chat_media_cleanup_batch",
    completeRpc: "complete_kael_chat_media_cleanup",
    label: "kael",
  },
  {
    bucket: JOB_MEDIA_BUCKET,
    claimRpc: "claim_job_media_cleanup_batch",
    completeRpc: "complete_job_media_cleanup",
    label: "job",
  },
];

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const configuredSecret = Deno.env.get("KAEL_MEDIA_RETENTION_SECRET") ?? "";
  const providedSecret = request.headers.get("x-kael-retention-secret") ?? "";
  if (!configuredSecret || !constantTimeEqual(configuredSecret, providedSecret)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = readServiceKey();
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "RETENTION_NOT_CONFIGURED" }, 503);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await readJsonRequestBounded(request, MAX_JSON_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestJsonError) {
      return json({ error: error.code }, error.status);
    }
    return json({ error: "INVALID_JSON" }, 400);
  }
  let limit: number;
  try {
    limit = parseCleanupLimit(parsedBody, MAX_BATCH, 50);
  } catch {
    return json({ error: "INVALID_REQUEST" }, 400);
  }
  const claimToken = crypto.randomUUID();
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: retentionFetch },
  });

  let claimedTotal = 0;
  let deletedTotal = 0;
  let retryPendingTotal = 0;
  const outcomes = await Promise.all(CLEANUP_PLANS.map(async (plan) => ({
    plan,
    outcome: await processCleanupPlan(client, plan, claimToken, limit),
  })));
  const failedQueues: CleanupPlan["label"][] = [];
  for (const { plan, outcome } of outcomes) {
    if ("error" in outcome) {
      failedQueues.push(plan.label);
      retryPendingTotal += outcome.retry_pending ?? 0;
      continue;
    }
    claimedTotal += outcome.claimed;
    deletedTotal += outcome.deleted;
    retryPendingTotal += outcome.retryPending;
  }

  if (failedQueues.length > 0) {
    return json({
      error: "CLEANUP_PARTIAL_FAILURE",
      failed_queues: failedQueues,
      claimed: claimedTotal,
      deleted: deletedTotal,
      retry_pending: retryPendingTotal,
    }, 503);
  }

  return json({
    claimed: claimedTotal,
    deleted: deletedTotal,
    retry_pending: retryPendingTotal,
  });
});

async function processCleanupPlan(
  client: ReturnType<typeof createClient>,
  plan: CleanupPlan,
  claimToken: string,
  limit: number,
): Promise<
  | { claimed: number; deleted: number; retryPending: number }
  | { error: string; retry_pending?: number }
> {
  let claimed;
  try {
    claimed = await withTimeout(client.rpc(plan.claimRpc, {
      p_claim_token: claimToken,
      p_limit: limit,
    }));
  } catch {
    return { error: "CLAIM_FAILED" };
  }
  if (claimed.error) {
    console.error("media retention claim failed", {
      code: claimed.error.code ?? "DB_ERROR",
      queue: plan.label,
    });
    return { error: "CLAIM_FAILED" };
  }

  let rows: ReturnType<typeof parseCleanupRows>;
  try {
    rows = parseCleanupRows(claimed.data, plan.bucket, limit);
  } catch {
    console.error("media retention claim response invalid", {
      queue: plan.label,
    });
    return { error: "CLAIM_RESPONSE_INVALID" };
  }
  if (rows.length === 0) return { claimed: 0, deleted: 0, retryPending: 0 };

  const successfulIds: string[] = [];
  let retryPending = 0;
  for (let start = 0; start < rows.length; start += DELETE_CONCURRENCY) {
    const chunk = rows.slice(start, start + DELETE_CONCURRENCY);
    const outcomes = await Promise.all(chunk.map(async (row) => {
      try {
        const removed = plan.bucket === BUCKET
          ? await withTimeout(client.storage.from(BUCKET).remove([row.object_path]))
          : await withTimeout(client.storage.from(JOB_MEDIA_BUCKET).remove([row.object_path]));
        return { row, ok: isStorageRemoveSuccess(removed) };
      } catch {
        return { row, ok: false };
      }
    }));
    for (const outcome of outcomes) {
      if (outcome.ok) successfulIds.push(outcome.row.intent_id);
      else retryPending += 1;
    }
  }

  let completed = 0;
  if (successfulIds.length > 0) {
    let finalized;
    try {
      finalized = await withTimeout(client.rpc(plan.completeRpc, {
        p_claim_token: claimToken,
        p_intent_ids: successfulIds,
      }));
    } catch {
      return { error: "FINALIZE_FAILED", retry_pending: rows.length };
    }
    if (finalized.error) {
      console.error("media retention finalize failed", {
        attempted_count: successfulIds.length,
        code: finalized.error.code ?? "DB_ERROR",
        queue: plan.label,
      });
      return { error: "FINALIZE_FAILED", retry_pending: rows.length };
    }
    try {
      completed = parseCompletedCount(finalized.data, successfulIds.length);
    } catch {
      console.error("media retention finalize response invalid", {
        queue: plan.label,
      });
      return { error: "FINALIZE_RESPONSE_INVALID", retry_pending: rows.length };
    }
  }

  return {
    claimed: rows.length,
    deleted: completed,
    retryPending: retryPending + Math.max(0, successfulIds.length - completed),
  };
}

async function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Media retention timeout")), STORAGE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function retentionFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetchBufferedWithTimeout(input, { ...init, redirect: "error" }, {
    maxResponseBytes: SUPABASE_MAX_RESPONSE_BYTES,
    timeoutMs: STORAGE_TIMEOUT_MS,
    validateJsonResponses: true,
  });
}

function readServiceKey() {
  const encoded = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as unknown;
      if (!isNonEmptyStringRecord(parsed)) return "";
      return parsed.default ?? Object.values(parsed)[0] ?? "";
    } catch {
      return "";
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
}

function isNonEmptyStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([, item]) =>
    typeof item === "string" && item.trim().length > 0
  );
}

function constantTimeEqual(expected: string, actual: string) {
  const left = new TextEncoder().encode(expected);
  const right = new TextEncoder().encode(actual);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
