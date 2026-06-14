// S4 / F1 + F4 (Plan.md §38 security hardening): durable, DB-backed AI-spend gate
// + global kill-switch.
//
// This module is intentionally STATELESS — it holds no module-level counters. Every
// check reads the durable ledger via the `check_kael_ai_spend` RPC, so the caps
// survive across ephemeral, horizontally-scaled Supabase Edge isolates and cold
// starts (the durability gap audit F1 identified in the in-memory `costCounters`).
//
// Fail-open policy: a missing rpc surface or a DB error on the CHECK fails OPEN
// (allow) so a wiring/infra hiccup never wrongly blocks a real user (RULES #8 /
// §38 risk control). The KAEL_AI_KILL_SWITCH is the deliberate hard fail-closed
// lever for an incident.

export type SpendGateClient = {
  rpc?(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export type KaelSpendGate = {
  readonly client: SpendGateClient;
  readonly actorId: string | null;
  readonly estimatedCostUsd?: number;
};

export type SpendVerdict = {
  readonly allowed: boolean;
  readonly scope: string | null;
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

export async function checkAiSpendAllowed(
  client: SpendGateClient | null | undefined,
  args: { actorId: string | null; estimatedCostUsd?: number },
): Promise<SpendVerdict> {
  if (!client?.rpc) {
    // No durable counter reachable — fail OPEN, log. Kill-switch remains the hard stop.
    console.warn("kael_ai_spend gate skipped: no rpc client (fail-open)");
    return { allowed: true, scope: "no_rpc_fail_open" };
  }
  try {
    const { data, error } = await client.rpc("check_kael_ai_spend", {
      p_actor_id: args.actorId,
      p_estimated_usd: Math.max(args.estimatedCostUsd ?? 0, 0),
      p_global_daily_cap: KAEL_AI_SPEND_CAPS.globalDailyUsd,
      p_user_daily_cap: KAEL_AI_SPEND_CAPS.userDailyUsd,
      p_user_monthly_cap: KAEL_AI_SPEND_CAPS.userMonthlyUsd,
    });
    if (error) {
      console.warn("kael_ai_spend check error; failing open", {
        code: safeErrCode(error),
      });
      return { allowed: true, scope: "gate_error_fail_open" };
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: unknown; blocked_scope?: unknown }
      | null
      | undefined;
    // Only block on an EXPLICIT allowed=false from the RPC. An unrecognized response
    // shape means the gate cannot make a determination — fail OPEN, never wrongly
    // block a real user (RULES #8 / §38 risk control). The kill-switch is the hard stop.
    if (row?.allowed === true) return { allowed: true, scope: null };
    if (row?.allowed === false) {
      return {
        allowed: false,
        scope: typeof row?.blocked_scope === "string" ? row.blocked_scope : "spend_cap",
      };
    }
    console.warn("kael_ai_spend check returned unrecognized shape; failing open");
    return { allowed: true, scope: "gate_unparsed_fail_open" };
  } catch (err) {
    console.warn("kael_ai_spend check threw; failing open", {
      code: safeErrCode(err),
    });
    return { allowed: true, scope: "gate_exception_fail_open" };
  }
}

export async function recordAiSpend(
  client: SpendGateClient | null | undefined,
  args: { actorId: string | null; purpose: string; costUsd: number },
): Promise<void> {
  if (!client?.rpc || !(args.costUsd > 0)) return;
  try {
    const { error } = await client.rpc("record_kael_ai_spend", {
      p_actor_id: args.actorId,
      p_purpose: args.purpose || "unknown",
      p_cost_usd: args.costUsd,
    });
    if (error) {
      console.warn("kael_ai_spend record error", { code: safeErrCode(error) });
    }
  } catch (err) {
    console.warn("kael_ai_spend record threw", { code: safeErrCode(err) });
  }
}

function safeErrCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "unknown";
}
