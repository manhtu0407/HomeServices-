// S4 / F1 + F4 (Plan.md §38 security hardening): durable, DB-backed AI-spend gate
// + global kill-switch.
//
// This module is intentionally STATELESS — it holds no module-level counters. Every
// reservation reads the durable ledger via RPC, so the caps survive across ephemeral,
// horizontally-scaled Supabase Edge isolates and cold starts (the durability gap audit
// F1 identified in the in-memory `costCounters`).
//
// Codex PR#68 P1 (race): the gate now RESERVES atomically before the provider call —
// `reserve_kael_ai_spend` does check + insert of the estimated cost inside one
// transaction under an advisory lock, so concurrent/parallel callers cannot all observe
// the same below-cap total and overshoot. After the call we `finalizeAiSpend` to either
// reconcile the reserved row to the ACTUAL cost (success) or release it (failure), so a
// failed/aborted call never permanently counts against a real user.
//
// Codex PR#68 P2 (timeout): the reserve RPC is wrapped in a short timeout. On timeout we
// fail OPEN (allow, no reservation) — consistent with the rest of the gate: a wiring/infra
// hiccup never wrongly blocks a real user (RULES #8 / §38 risk control). The
// KAEL_AI_KILL_SWITCH is the deliberate hard fail-closed lever for an incident.

export type SpendGateClient = {
  rpc?(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export type KaelSpendGate = {
  readonly client: SpendGateClient;
  readonly actorId: string | null;
  // Optional override; when absent callAI derives a conservative estimate from the
  // request purpose's route cost ceiling (Codex PR#68 P2).
  readonly estimatedCostUsd?: number;
};

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
export const KAEL_AI_SPEND_CAPS = Object.freeze({
  globalDailyUsd: 30,
  userDailyUsd: 1,
  userMonthlyUsd: 5,
});

// Codex PR#68 P2: bound the reserve RPC so a stalled DB call cannot outlive the stage
// timeout and let an abandoned promise resume into a provider call after fallback.
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

// Atomic check-and-reserve BEFORE the provider call. Inserts the estimated cost so
// concurrent callers see each other's in-flight reservations (Codex PR#68 P1).
export async function reserveAiSpend(
  client: SpendGateClient | null | undefined,
  args: { actorId: string | null; estimatedCostUsd?: number; purpose?: string },
): Promise<SpendReservation> {
  if (!client?.rpc) {
    // No durable counter reachable — fail OPEN, log. Kill-switch remains the hard stop.
    console.warn("kael_ai_spend reserve skipped: no rpc client (fail-open)");
    return { allowed: true, scope: "no_rpc_fail_open", reservationId: null };
  }
  const rpcCall = client.rpc("reserve_kael_ai_spend", {
    p_actor_id: args.actorId,
    p_estimated_usd: Math.max(args.estimatedCostUsd ?? 0, 0),
    p_purpose: args.purpose ?? "reserved",
    p_global_daily_cap: KAEL_AI_SPEND_CAPS.globalDailyUsd,
    p_user_daily_cap: KAEL_AI_SPEND_CAPS.userDailyUsd,
    p_user_monthly_cap: KAEL_AI_SPEND_CAPS.userMonthlyUsd,
  });
  try {
    const { data, error } = await withTimeout(
      rpcCall,
      RESERVE_RPC_TIMEOUT_MS,
      () => ({ data: "__timeout__", error: null }),
    );
    if (data === "__timeout__") {
      console.warn("kael_ai_spend reserve timed out; failing open");
      return { allowed: true, scope: "reserve_timeout_fail_open", reservationId: null };
    }
    if (error) {
      console.warn("kael_ai_spend reserve error; failing open", { code: safeErrCode(error) });
      return { allowed: true, scope: "reserve_error_fail_open", reservationId: null };
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: unknown; blocked_scope?: unknown; reservation_id?: unknown }
      | null
      | undefined;
    // Only block on an EXPLICIT allowed=false. An unrecognized shape means the gate
    // cannot make a determination — fail OPEN, never wrongly block a real user.
    if (row?.allowed === false) {
      return {
        allowed: false,
        scope: typeof row?.blocked_scope === "string" ? row.blocked_scope : "spend_cap",
        reservationId: null,
      };
    }
    if (row?.allowed === true) {
      const id = Number(row?.reservation_id);
      return { allowed: true, scope: null, reservationId: Number.isFinite(id) ? id : null };
    }
    console.warn("kael_ai_spend reserve returned unrecognized shape; failing open");
    return { allowed: true, scope: "reserve_unparsed_fail_open", reservationId: null };
  } catch (err) {
    console.warn("kael_ai_spend reserve threw; failing open", { code: safeErrCode(err) });
    return { allowed: true, scope: "reserve_exception_fail_open", reservationId: null };
  }
}

// Reconcile (actual > 0) or release (actual <= 0) the reservation after the provider
// call resolves. Best-effort: never throws into the response path.
export async function finalizeAiSpend(
  client: SpendGateClient | null | undefined,
  args: { reservationId: number | null; actorId: string | null; purpose: string; actualUsd: number },
): Promise<void> {
  if (!client?.rpc) return;
  const actual = Math.max(args.actualUsd, 0);
  try {
    if (args.reservationId !== null) {
      // finalize_kael_ai_spend: actual>0 → update reserved row to actual; actual<=0 → delete (release).
      const { error } = await client.rpc("finalize_kael_ai_spend", {
        p_reservation_id: args.reservationId,
        p_actual_usd: actual,
        p_purpose: args.purpose || "unknown",
      });
      if (error) console.warn("kael_ai_spend finalize error", { code: safeErrCode(error) });
      return;
    }
    // Fail-open reserve path (no reservation row) — still record real spend so the
    // ledger stays accurate for the global/per-user caps.
    if (actual > 0) {
      const { error } = await client.rpc("record_kael_ai_spend", {
        p_actor_id: args.actorId,
        p_purpose: args.purpose || "unknown",
        p_cost_usd: actual,
      });
      if (error) console.warn("kael_ai_spend record error", { code: safeErrCode(error) });
    }
  } catch (err) {
    console.warn("kael_ai_spend finalize threw", { code: safeErrCode(err) });
  }
}

function safeErrCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "unknown";
}
