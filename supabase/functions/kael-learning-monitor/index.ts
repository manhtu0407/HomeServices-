import { createClient } from "@supabase/supabase-js";
import {
  readJsonRequestBounded,
  RequestJsonError,
} from "../_shared/request-json.ts";
import { monitorLearningRules } from "../mobile-api/_shared/kael/learning/cron/monitor-learning-rules.ts";
import type { LearningQueueDbClient } from "../mobile-api/_shared/kael/learning/cron/process-learning-queue.ts";

// Scheduled entry point for the learning monitor. It exists because mobile-api
// authenticates a user JWT and looks the caller's role up in profiles, which pg_cron
// cannot produce without a standing admin token. Secret-header auth mirrors
// kael-media-retention, the repository's other cron-driven function.
//
// Whether this rolls anything back is decided by KAEL_LEARNING_AUTO_ROLLBACK, not here.
// With that flag false the call is observe-only and returns loop_health.

const MAX_JSON_BODY_BYTES = 4 * 1024;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const configuredSecret = Deno.env.get("KAEL_LEARNING_MONITOR_SECRET") ?? "";
  const providedSecret = request.headers.get("x-kael-learning-monitor-secret") ?? "";
  if (!configuredSecret || !constantTimeEqual(configuredSecret, providedSecret)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = readServiceKey();
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "MONITOR_NOT_CONFIGURED" }, 503);
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

  const limit = parseLimit(parsedBody);
  if (limit === null) {
    return json({ error: "INVALID_REQUEST" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const summary = await monitorLearningRules(
      supabase as unknown as LearningQueueDbClient,
      { limit },
    );
    return json({ ok: true, ...summary });
  } catch (error) {
    // Safe metadata only: the summary can name rule and candidate ids but never
    // customer data, and the error name keeps provider detail out of the response.
    console.error("kael learning monitor failed", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "MONITOR_FAILED" }, 500);
  }
});

function parseLimit(body: unknown): number | null {
  if (body === null || body === undefined) return DEFAULT_LIMIT;
  if (typeof body !== "object" || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).limit;
  if (raw === undefined || raw === null) return DEFAULT_LIMIT;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < 1 || raw > MAX_LIMIT) return null;
  return raw;
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
