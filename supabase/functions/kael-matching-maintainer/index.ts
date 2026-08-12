import { createClient } from "@supabase/supabase-js";
import { reconcileExpiredSavedWorkerMatches } from "../mobile-api/_shared/domains/matching/matching-preference.ts";
import type { DbClient } from "../mobile-api/_shared/platform/db.ts";

const DEFAULT_LIMIT = 50;

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const configuredSecret = Deno.env.get("KAEL_MATCHING_MAINTAINER_SECRET") ?? "";
  const providedSecret = request.headers.get("x-kael-matching-maintainer-secret") ?? "";
  if (!configuredSecret || !constantTimeEqual(configuredSecret, providedSecret)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = readServiceKey();
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "MAINTAINER_NOT_CONFIGURED" }, 503);
  }

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const summary = await reconcileExpiredSavedWorkerMatches(
      client as unknown as DbClient,
      DEFAULT_LIMIT,
    );
    console.info("kael matching maintainer completed", {
      reconciled_count: summary.reconciled,
      failed_count: summary.failed,
      reason_code: "expired_saved_worker_scan",
    });
    return json({ ok: true, ...summary });
  } catch {
    console.error("kael matching maintainer failed", {
      reason_code: "reconcile_failed",
    });
    return json({ error: "MAINTAINER_FAILED" }, 500);
  }
});

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
