// Reservations live in the durable ledger and are created atomically before provider
// I/O. callAI reserves the full bounded retry envelope, then reconciles successful
// usage while retaining conservative estimates for attempts with unknown billing.
// Reserve RPC failures remain fail-open for availability; the kill-switch is the
// explicit fail-closed incident control.

export type SpendGateClient = {
  rpc?(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export type KaelSpendGate = {
  readonly client: SpendGateClient;
  readonly actorId: string | null;
  readonly failureMode?: "fail-open" | "fail-closed";
  // Per-attempt override; callAI multiplies it by the bounded attempt count.
  readonly estimatedCostUsd?: number;
};

export function createRuntimeKaelSpendGate(
  client: SpendGateClient,
  actorId: string | null,
  trace: { readonly environment?: string | null } | null | undefined,
): KaelSpendGate {
  return {
    client,
    actorId,
    failureMode: trace?.environment === "local" ? "fail-open" : "fail-closed",
  };
}

export type SpendReservation = {
  readonly allowed: boolean;
  readonly scope: string | null;
  // Non-null only when a row was actually reserved in the ledger. null on a fail-open
  // path (no rpc / error / timeout / unparsed) — there is nothing to reconcile/release.
  readonly reservationId: number | null;
};

// Conservative, tunable defaults. Per-user caps are generous relative to real usage
// (~$0.01–0.015 per estimate → userDaily=1 USD ≈ 70–100 estimates/day) so legitimate
// users are never blocked; globalDaily is the wallet-DoS ceiling (consumes the
// previously-declared-but-never-used dailyProviderCapUsd). The kill-switch is the
// manual emergency brake, independent of these caps.
export type KaelAiSpendCaps = Readonly<{
  globalDailyUsd: number;
  userDailyUsd: number;
  userMonthlyUsd: number;
}>;

export const KAEL_AI_SPEND_CAP_DEFAULTS: KaelAiSpendCaps = Object.freeze({
  globalDailyUsd: 30,
  userDailyUsd: 1,
  userMonthlyUsd: 5,
});

// Bound the reserve RPC so a stalled DB call cannot outlive the provider stage.
const RESERVE_RPC_TIMEOUT_MS = 2_000;

// Honest Vietnamese unavailable state for the kill-switch / hard-block path
// (RULES #8 — no fake success).
export const KAEL_AI_UNAVAILABLE_VI =
  "Kael tạm thời không khả dụng. Vui lòng thử lại sau ít phút.";

function readRuntimeEnv(name: string): string | undefined {
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno?.env?.get;
  return denoGet?.(name);
}

export function readKaelAiSpendCaps(
  getEnv: (name: string) => string | undefined = readRuntimeEnv,
): KaelAiSpendCaps {
  return Object.freeze({
    globalDailyUsd: positiveUsd(
      getEnv("KAEL_AI_GLOBAL_DAILY_CAP_USD"),
      KAEL_AI_SPEND_CAP_DEFAULTS.globalDailyUsd,
    ),
    userDailyUsd: positiveUsd(
      getEnv("KAEL_AI_USER_DAILY_CAP_USD"),
      KAEL_AI_SPEND_CAP_DEFAULTS.userDailyUsd,
    ),
    userMonthlyUsd: positiveUsd(
      getEnv("KAEL_AI_USER_MONTHLY_CAP_USD"),
      KAEL_AI_SPEND_CAP_DEFAULTS.userMonthlyUsd,
    ),
  });
}

function positiveUsd(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  console.warn("invalid Kael spend cap; using safe default");
  return fallback;
}

function readBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isKaelAiKillSwitchEnabled(
  getEnv: (name: string) => string | undefined = readRuntimeEnv,
): boolean {
  return readBoolean(getEnv("KAEL_AI_KILL_SWITCH"));
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  onTimeout: () => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Atomic reservation makes concurrent callers observe each other's in-flight spend.
export async function reserveAiSpend(
  client: SpendGateClient | null | undefined,
  args: {
    actorId: string | null;
    estimatedCostUsd?: number;
    purpose?: string;
    failureMode?: "fail-open" | "fail-closed";
    runId?: string | null;
    traceId?: string | null;
    releaseId?: string | null;
    providerAttemptId?: string | null;
  },
): Promise<SpendReservation> {
  const failureMode = args.failureMode ?? "fail-open";
  if (!client?.rpc) {
    console.warn("kael_ai_spend reserve skipped: no rpc client", { failureMode });
    return unavailableReservation(failureMode, "no_rpc");
  }
  const caps = readKaelAiSpendCaps();
  const baseArgs = {
    p_actor_id: args.actorId,
    p_estimated_usd: Math.max(args.estimatedCostUsd ?? 0, 0),
    p_purpose: args.purpose ?? "reserved",
    p_global_daily_cap: caps.globalDailyUsd,
    p_user_daily_cap: caps.userDailyUsd,
    p_user_monthly_cap: caps.userMonthlyUsd,
  };
  const lineageArgs = {
    ...baseArgs,
    p_harness_run_id: args.runId ?? null,
    p_harness_trace_id: args.traceId ?? null,
    p_harness_release_id: args.releaseId ?? null,
    p_provider_attempt_id: args.providerAttemptId ?? null,
  };
  let rpcCall = client.rpc("reserve_kael_ai_spend", lineageArgs);
  try {
    const { data, error } = await withTimeout(
      rpcCall,
      RESERVE_RPC_TIMEOUT_MS,
      () => ({ data: "__timeout__", error: null }),
    );
    if (data === "__timeout__") {
      console.warn("kael_ai_spend reserve timed out", { failureMode });
      return unavailableReservation(failureMode, "reserve_timeout");
    }
    if (error && isMissingLineageOverload(error)) {
      rpcCall = client.rpc("reserve_kael_ai_spend", baseArgs);
      const fallback = await withTimeout(
        rpcCall,
        RESERVE_RPC_TIMEOUT_MS,
        () => ({ data: "__timeout__", error: null }),
      );
      if (fallback.data === "__timeout__") {
        return unavailableReservation(failureMode, "reserve_timeout");
      }
      if (fallback.error) {
        console.warn("kael_ai_spend reserve fallback error", {
          code: safeErrCode(fallback.error),
          failureMode,
        });
        return unavailableReservation(failureMode, "reserve_error");
      }
      return parseReservation(fallback.data, failureMode);
    }
    if (error) {
      console.warn("kael_ai_spend reserve error", {
        code: safeErrCode(error),
        failureMode,
      });
      return unavailableReservation(failureMode, "reserve_error");
    }
    return parseReservation(data, failureMode);
  } catch (err) {
    console.warn("kael_ai_spend reserve threw", {
      code: safeErrCode(err),
      failureMode,
    });
    return unavailableReservation(failureMode, "reserve_exception");
  }
}

// Reconcile (actual > 0) or release (actual <= 0) the reservation after the provider
// call resolves. Best-effort: never throws into the response path.
export async function finalizeAiSpend(
  client: SpendGateClient | null | undefined,
  args: {
    reservationId: number | null;
    actorId: string | null;
    purpose: string;
    actualUsd: number;
    runId?: string | null;
    traceId?: string | null;
    releaseId?: string | null;
    providerAttemptId?: string | null;
  },
): Promise<void> {
  if (!client?.rpc) return;
  const actual = Math.max(args.actualUsd, 0);
  try {
    if (args.reservationId !== null) {
      // finalize_kael_ai_spend: actual>0 → update reserved row to actual; actual<=0 → delete (release).
      const lineageArgs = {
        p_reservation_id: args.reservationId,
        p_actual_usd: actual,
        p_purpose: args.purpose || "unknown",
        p_harness_run_id: args.runId ?? null,
        p_harness_trace_id: args.traceId ?? null,
        p_harness_release_id: args.releaseId ?? null,
        p_provider_attempt_id: args.providerAttemptId ?? null,
      };
      let result = await client.rpc("finalize_kael_ai_spend", lineageArgs);
      if (result.error && isMissingLineageOverload(result.error)) {
        result = await client.rpc("finalize_kael_ai_spend", {
          p_reservation_id: args.reservationId,
          p_actual_usd: actual,
          p_purpose: args.purpose || "unknown",
        });
      }
      if (result.error) {
        console.warn("kael_ai_spend finalize error", {
          code: safeErrCode(result.error),
        });
      }
      return;
    }
    // Fail-open reserve path (no reservation row) — still record real spend so the
    // ledger stays accurate for the global/per-user caps.
    if (actual > 0) {
      const lineageArgs = {
        p_actor_id: args.actorId,
        p_purpose: args.purpose || "unknown",
        p_cost_usd: actual,
        p_harness_run_id: args.runId ?? null,
        p_harness_trace_id: args.traceId ?? null,
        p_harness_release_id: args.releaseId ?? null,
        p_provider_attempt_id: args.providerAttemptId ?? null,
      };
      let result = await client.rpc("record_kael_ai_spend", lineageArgs);
      if (result.error && isMissingLineageOverload(result.error)) {
        result = await client.rpc("record_kael_ai_spend", {
          p_actor_id: args.actorId,
          p_purpose: args.purpose || "unknown",
          p_cost_usd: actual,
        });
      }
      if (result.error) {
        console.warn("kael_ai_spend record error", {
          code: safeErrCode(result.error),
        });
      }
    }
  } catch (err) {
    console.warn("kael_ai_spend finalize threw", { code: safeErrCode(err) });
  }
}

function parseReservation(
  data: unknown,
  failureMode: "fail-open" | "fail-closed",
): SpendReservation {
  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed?: unknown; blocked_scope?: unknown; reservation_id?: unknown }
    | null
    | undefined;
  if (row?.allowed === false) {
    return {
      allowed: false,
      scope: typeof row.blocked_scope === "string"
        ? row.blocked_scope
        : "spend_cap",
      reservationId: null,
    };
  }
  if (row?.allowed === true) {
    const id = Number(row.reservation_id);
    return {
      allowed: true,
      scope: null,
      reservationId: Number.isFinite(id) ? id : null,
    };
  }
  console.warn("kael_ai_spend reserve returned unrecognized shape", {
    failureMode,
  });
  return unavailableReservation(failureMode, "reserve_unparsed");
}

function unavailableReservation(
  failureMode: "fail-open" | "fail-closed",
  reason: string,
): SpendReservation {
  return failureMode === "fail-closed"
    ? { allowed: false, scope: `${reason}_fail_closed`, reservationId: null }
    : { allowed: true, scope: `${reason}_fail_open`, reservationId: null };
}

function isMissingLineageOverload(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "PGRST202" || candidate.code === "42883" ||
    typeof candidate.message === "string" &&
      candidate.message.includes("function") &&
      candidate.message.includes("not found");
}

function safeErrCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "unknown";
}
