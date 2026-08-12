import { createClient } from "@supabase/supabase-js";
import { notifyFinanceReconciliationRequired } from "../mobile-api/_shared/domains/payment/manual-bank.ts";
import type { DbClient } from "../mobile-api/_shared/platform/db.ts";

const DEFAULT_LIMIT = 100;

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const configuredSecret = Deno.env.get("PAYMENT_MAINTAINER_SECRET") ?? "";
  const providedSecret = request.headers.get("x-payment-maintainer-secret") ?? "";
  if (!configuredSecret || !constantTimeEqual(configuredSecret, providedSecret)) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = readServiceKey();
  if (!supabaseUrl || !serviceKey) return json({ error: "MAINTAINER_NOT_CONFIGURED" }, 503);

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as DbClient;
  try {
    const result = await client.rpc("maintain_manual_bank_payment_holds", { p_limit: DEFAULT_LIMIT });
    const row = Array.isArray(result.data) ? result.data[0] as Record<string, unknown> | undefined : undefined;
    if (result.error || !row) throw new Error("MAINTAINER_RPC_FAILED");
    const releasedCount = nonnegativeInteger(row.released_count);
    const directCount = nonnegativeInteger(row.direct_reconcile_count);
    const jobIds = Array.isArray(row.direct_reconcile_job_ids)
      ? row.direct_reconcile_job_ids.filter((value): value is string => typeof value === "string")
      : [];
    if (releasedCount === null || directCount === null || jobIds.length !== directCount) {
      throw new Error("MAINTAINER_RECEIPT_INVALID");
    }
    await Promise.all(jobIds.map((jobId) =>
      notifyFinanceReconciliationRequired(client, jobId, "direct_payment_timeout")
    ));
    console.info("payment maintainer completed", {
      released_count: releasedCount,
      direct_reconcile_count: directCount,
      reason_code: "payment_hold_and_direct_timeout_scan",
    });
    return json({ ok: true, released_count: releasedCount, direct_reconcile_count: directCount });
  } catch {
    console.error("payment maintainer failed", { reason_code: "maintainer_failed" });
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
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
}

function isNonEmptyStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.values(value);
  return entries.length > 0 && entries.every((item) => typeof item === "string" && item.trim().length > 0);
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

function nonnegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
