import { dbQuery, type DbClient } from "./db.ts";

export type WorkerCommissionTier = {
  level: number;
  rateBps: number;
};

/** Reads the current server policy; callers must not fall back to a fabricated rate. */
export async function getWorkerCommissionTier(
  client: DbClient,
  workerId: string,
): Promise<WorkerCommissionTier | null> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("get_worker_current_commission_tier", {
      p_worker_id: workerId,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) return null;

  const level = row.commission_level;
  const rateBps = row.commission_rate_bps;
  if (
    typeof level !== "number" || !Number.isSafeInteger(level) || level < 1 ||
    typeof rateBps !== "number" || !Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > 1500
  ) {
    return null;
  }
  return { level, rateBps };
}

export function estimateWorkerNet(
  grossAmount: number | null,
  tier: WorkerCommissionTier | null,
): number | null {
  if (
    grossAmount === null || !Number.isSafeInteger(grossAmount) || grossAmount <= 0 ||
    tier === null
  ) {
    return null;
  }
  return grossAmount - Math.round(grossAmount * tier.rateBps / 10_000);
}
