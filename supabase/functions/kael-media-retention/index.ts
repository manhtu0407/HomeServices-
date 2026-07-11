import { createClient } from "@supabase/supabase-js";

const BUCKET = "kael-chat-media";
const MAX_BATCH = 100;
const DELETE_CONCURRENCY = 10;

type CleanupRow = { intent_id: string; object_path: string };

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

  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const requestedLimit = typeof body.limit === "number" ? Math.trunc(body.limit) : 50;
  const limit = Math.min(Math.max(requestedLimit, 1), MAX_BATCH);
  const claimToken = crypto.randomUUID();
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const claimed = await client.rpc("claim_kael_chat_media_cleanup_batch", {
    p_claim_token: claimToken,
    p_limit: limit,
  });
  if (claimed.error) {
    console.error("kael media retention claim failed", {
      code: claimed.error.code ?? "DB_ERROR",
    });
    return json({ error: "CLAIM_FAILED" }, 503);
  }

  const rows = normalizeRows(claimed.data);
  if (rows.length === 0) {
    return json({ claimed: 0, deleted: 0, retry_pending: 0 });
  }

  const successfulIds: string[] = [];
  let retryPending = 0;
  for (let start = 0; start < rows.length; start += DELETE_CONCURRENCY) {
    const chunk = rows.slice(start, start + DELETE_CONCURRENCY);
    const outcomes = await Promise.all(chunk.map(async (row) => {
      const removed = await client.storage.from(BUCKET).remove([row.object_path]);
      return { row, ok: !removed.error };
    }));
    for (const outcome of outcomes) {
      if (outcome.ok) successfulIds.push(outcome.row.intent_id);
      else retryPending += 1;
    }
  }

  let completed = 0;
  if (successfulIds.length > 0) {
    const finalized = await client.rpc("complete_kael_chat_media_cleanup", {
      p_claim_token: claimToken,
      p_intent_ids: successfulIds,
    });
    if (finalized.error) {
      console.error("kael media retention finalize failed", {
        code: finalized.error.code ?? "DB_ERROR",
        attempted_count: successfulIds.length,
      });
      return json({ error: "FINALIZE_FAILED", retry_pending: rows.length }, 503);
    }
    completed = typeof finalized.data === "number" ? finalized.data : 0;
  }

  return json({
    claimed: rows.length,
    deleted: completed,
    retry_pending: retryPending + Math.max(0, successfulIds.length - completed),
  });
});

function normalizeRows(value: unknown): CleanupRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    return typeof record.intent_id === "string" && typeof record.object_path === "string"
      ? [{ intent_id: record.intent_id, object_path: record.object_path }]
      : [];
  });
}

function readServiceKey() {
  const encoded = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as Record<string, unknown>;
      const preferred = parsed.default;
      if (typeof preferred === "string" && preferred) return preferred;
      const first = Object.values(parsed).find((value) => typeof value === "string" && value);
      if (typeof first === "string") return first;
    } catch {
      return "";
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
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
