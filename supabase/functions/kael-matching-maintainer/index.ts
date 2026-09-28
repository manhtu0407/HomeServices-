import { createClient } from "@supabase/supabase-js";
import { resolveHarnessEnvironment } from "../_shared/harness/environment.ts";
import { readHarnessRuntimeRelease } from "../_shared/harness/release.ts";
import { reconcileExpiredMatchingLeases } from "../mobile-api/_shared/domains/matching/expiry-maintenance.ts";
import { reconcileExpiredSavedWorkerMatches } from "../mobile-api/_shared/domains/matching/matching-preference.ts";
import { dispatchConfirmationMatchingOutbox } from "../mobile-api/_shared/domains/kael-chat/confirmation-outbox-dispatcher.ts";
import { dispatchWorkerReplacementOutbox } from "../mobile-api/_shared/domains/matching/replacement-outbox.ts";
import type { EdgeAiSecrets } from "../mobile-api/_shared/kael/index.ts";
import type { DbClient } from "../mobile-api/_shared/platform/db.ts";
import { reconcileMatchingPushReceipts } from "../mobile-api/_shared/platform/push.ts";
import { dispatchOfficialMatchPush } from "../mobile-api/_shared/domains/notification/official-match-push.ts";
import { dispatchWorkerReplyNudges } from "../mobile-api/_shared/domains/notification/worker-reply-nudge.ts";

const DEFAULT_LIMIT = 50;

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const providedSecret = request.headers.get("x-kael-matching-maintainer-secret") ?? "";
  if (!providedSecret) {
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
  const configuredSecret = Deno.env.get("KAEL_MATCHING_MAINTAINER_SECRET") ?? "";
  const environmentAuthorized = Boolean(configuredSecret) &&
    constantTimeEqual(configuredSecret, providedSecret);
  if (
    !environmentAuthorized &&
    !await databaseMaintainerAuthorized(client as unknown as DbClient, providedSecret)
  ) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  try {
    const dbClient = client as unknown as DbClient;
    const maintainerId = `matching-maintainer:${Deno.env.get("DENO_DEPLOYMENT_ID") ?? crypto.randomUUID()}`;
    const release = readHarnessRuntimeRelease((name) => Deno.env.get(name));
    const environment = resolveHarnessEnvironment({
      url: supabaseUrl, environment: Deno.env.get("NESTSCOUT_ENVIRONMENT"),
    }).name;
    // Independent notification recovery must neither delay matching nor be abandoned if it fails.
    const officialMatchPushTask = dispatchOfficialMatchPush(dbClient, {
      environment,
      releaseId: release.releaseId, deploymentId: release.deploymentId, dispatcherId: maintainerId,
    }).then(
      (result) => ({ failed: false, result }),
      (error: unknown) => {
        const reasonCode = error instanceof Error && /^[A-Z][A-Z0-9_]{1,63}$/u.test(error.message)
          ? error.message : "OFFICIAL_MATCH_PUSH_DISPATCH_FAILED";
        console.warn("official match push dispatch failed", { reason_code: reasonCode });
        return { failed: true, result: { error_code: "OFFICIAL_MATCH_PUSH_DISPATCH_FAILED" } };
      },
    );
    try {
      const outbox = await dispatchConfirmationMatchingOutbox(
        dbClient,
        readMatchingSecrets(supabaseUrl),
        {
          dispatcherId: maintainerId,
          limit: 20,
          leaseSeconds: 45,
        },
      );
      const summary = await reconcileExpiredSavedWorkerMatches(
        dbClient,
        DEFAULT_LIMIT,
      );
      const replacements = await dispatchWorkerReplacementOutbox(dbClient, { dispatcherId: maintainerId });
      const pushReceipts = await reconcileMatchingPushReceipts(dbClient, maintainerId);
      const matchingExpiry = await reconcileExpiredMatchingLeases(dbClient, {
        environment,
        releaseId: release.releaseId,
        deploymentId: release.deploymentId,
      });
      // A reminder that fails must not fail the matching run it rides on.
      const replyNudges = await dispatchWorkerReplyNudges(dbClient, {
        limit: 50, environment, releaseId: release.releaseId,
      }).catch(() => ({ claimed: 0, pushed: 0, pushFailed: 0, error_code: "REPLY_NUDGE_DISPATCH_FAILED" }));
      const { failed: officialMatchPushFailed, result: officialMatchPush } = await officialMatchPushTask;
      console.info("kael matching maintainer completed", {
        official_match_push_failed: officialMatchPushFailed,
        official_match_push: officialMatchPush,
        reconciled_count: summary.reconciled,
        failed_count: summary.failed,
        reason_code: "expired_saved_worker_scan",
        confirmation_outbox_claimed: outbox.claimed,
        confirmation_outbox_completed: outbox.completed,
        confirmation_outbox_retry_scheduled: outbox.retryScheduled,
        confirmation_outbox_dead_lettered: outbox.deadLettered,
        confirmation_outbox_lease_lost: outbox.leaseLost,
        replacement_outbox_claimed: replacements.claimed,
        replacement_outbox_completed: replacements.completed,
        replacement_outbox_dead_lettered: replacements.deadLettered,
        push_receipts_checked: pushReceipts.checked,
        push_receipts_provider_handoffs: pushReceipts.providerHandoffs,
        push_receipts_failed: pushReceipts.failed,
        push_receipts_unresolved: pushReceipts.unresolved,
        push_receipts_tokens_disabled: pushReceipts.tokensDisabled,
        matching_expiry_reconciled: matchingExpiry.reconciled,
        reply_nudges: replyNudges,
      });
      return json({
        ok: !officialMatchPushFailed,
        official_match_push: officialMatchPush,
        confirmation_outbox: outbox,
        replacement_outbox: replacements,
        push_receipts: pushReceipts,
        saved_worker_reconcile: summary,
        matching_expiry: matchingExpiry,
        reply_nudges: replyNudges,
      }, officialMatchPushFailed ? 500 : 200);
    } finally {
      await officialMatchPushTask;
    }
  } catch {
    console.error("kael matching maintainer failed", {
      reason_code: "reconcile_failed",
    });
    return json({ error: "MAINTAINER_FAILED" }, 500);
  }
});

async function databaseMaintainerAuthorized(
  client: DbClient,
  providedSecret: string,
) {
  try {
    const { data, error } = await client.rpc("verify_kael_matching_maintainer_secret", {
      p_secret: providedSecret,
    });
    return !error && data === true;
  } catch {
    return false;
  }
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

function readMatchingSecrets(supabaseUrl: string): EdgeAiSecrets {
  return {
    supabaseUrl,
    anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? undefined,
    perplexityApiKey: Deno.env.get("PERPLEXITY_API_KEY") ?? undefined,
    deepseekApiKey: Deno.env.get("DEEPSEEK_API_KEY") ?? undefined,
    vietmapApiKey: Deno.env.get("VIETMAP_API_KEY") ?? Deno.env.get("VIETMAP_MAPS_API_KEY") ?? undefined,
    googleMapsApiKey: Deno.env.get("GOOGLE_MAPS_API_KEY") ?? Deno.env.get("GOOGLE_MAP_KEY") ?? undefined,
    durableGuardsEnabled: readBooleanFlag(Deno.env.get("KAEL_DURABLE_GUARDS_ENABLED")),
  };
}

function readBooleanFlag(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
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
