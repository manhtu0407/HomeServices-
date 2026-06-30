// C-1 (Notes.md, 2026-06-13): DB-backed daily provider spend cap — the one
// enforcement gap the audit found. Backed by record_kael_provider_spend /
// get_kael_provider_spend_today (migration 20260613120000).
//
// Design contract:
//  - DISABLED BY DEFAULT. Enforcement only runs when KAEL_PROVIDER_COST_CAP_ENABLED
//    is on. When off, checkKaelProviderBudget makes NO DB call and never blocks —
//    zero behaviour change, zero added round-trips. Turn it on only after the
//    migration is applied to the target environment.
//  - FAILS OPEN. A disabled flag, a missing client, an RPC error, or a thrown
//    exception all resolve to `exhausted: false`. A monitoring guard must never
//    take down real customer estimates; over-budget protection is best-effort.
//  - Cap value comes from KAEL_PROVIDER_DAILY_CAP_USD, defaulting to the same $30
//    daily ceiling defined (but previously unenforced) in routing.config.ts.

// Mirrors routing.config.ts DAILY_PROVIDER_CAP_USD (module-local there). Keep in
// sync if that ceiling changes; the env override is the real operational knob.
const DEFAULT_DAILY_PROVIDER_CAP_USD = 30;

type BudgetDbClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type KaelProviderBudgetStatus = {
  // Whether the cap is active this turn (flag on). When false, the other fields
  // are inert and the caller should not record spend.
  readonly enforced: boolean;
  readonly exhausted: boolean;
  readonly spendUsd: number;
  readonly capUsd: number;
};

type EnvReader = (name: string) => string | undefined;

function readRuntimeEnv(name: string): string | undefined {
  return (globalThis as {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno?.env?.get?.(name);
}

function envFlagOn(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isKaelProviderCostCapEnabled(getEnv: EnvReader = readRuntimeEnv): boolean {
  return envFlagOn(getEnv("KAEL_PROVIDER_COST_CAP_ENABLED"));
}

export function kaelProviderDailyCapUsd(getEnv: EnvReader = readRuntimeEnv): number {
  const raw = Number(getEnv("KAEL_PROVIDER_DAILY_CAP_USD"));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_PROVIDER_CAP_USD;
}

// Pre-call gate. Returns exhausted=true only when enforcement is on AND today's
// recorded spend is at/over the cap. Any uncertainty resolves to not-exhausted.
export async function checkKaelProviderBudget(
  client: unknown,
  getEnv: EnvReader = readRuntimeEnv,
): Promise<KaelProviderBudgetStatus> {
  const capUsd = kaelProviderDailyCapUsd(getEnv);
  if (!isKaelProviderCostCapEnabled(getEnv)) {
    return { enforced: false, exhausted: false, spendUsd: 0, capUsd };
  }
  if (!isBudgetClient(client)) {
    return { enforced: true, exhausted: false, spendUsd: 0, capUsd };
  }
  try {
    const { data, error } = await client.rpc("get_kael_provider_spend_today");
    if (error) {
      console.warn("checkKaelProviderBudget: read failed, failing open", { error });
      return { enforced: true, exhausted: false, spendUsd: 0, capUsd };
    }
    const spendUsd = toNonNegativeNumber(data);
    return { enforced: true, exhausted: spendUsd >= capUsd, spendUsd, capUsd };
  } catch (err) {
    console.warn("checkKaelProviderBudget: threw, failing open", { err });
    return { enforced: true, exhausted: false, spendUsd: 0, capUsd };
  }
}

// Atomic increment of today's recorded spend. Best-effort: errors are swallowed
// (the cap is a guard, not a billing system). No-op for non-positive cost.
export async function recordKaelProviderSpend(
  client: unknown,
  costUsd: number,
): Promise<void> {
  if (!isBudgetClient(client)) return;
  if (!(costUsd > 0)) return;
  try {
    const { error } = await client.rpc("record_kael_provider_spend", {
      p_cost_usd: costUsd,
    });
    if (error) {
      console.warn("recordKaelProviderSpend: failed", { error });
    }
  } catch (err) {
    console.warn("recordKaelProviderSpend: threw", { err });
  }
}

function isBudgetClient(client: unknown): client is BudgetDbClient {
  return typeof (client as { rpc?: unknown } | null)?.rpc === "function";
}

function toNonNegativeNumber(value: unknown): number {
  // PostgREST may return numeric as a string to preserve precision.
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
