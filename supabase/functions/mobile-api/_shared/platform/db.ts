// Edge service db layer (C4 6a, services/* split): Supabase-client types (DbClient/Chain) plus
// the db/dbQuery/fetch helpers the service runs queries through. Re-exported via ./_shared.ts.

import type { MobileApiContext } from "./auth.ts";
import { HCMC_DISTRICTS, normalizeDistrict } from "../../../_shared/domain.ts";
import { fetchBufferedWithTimeout } from "../../../_shared/network.ts";

const MAPS_PROVIDER_TIMEOUT_MS = 5_000;
export const MAPS_PROVIDER_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export type DbError = { code?: string; message?: string };

export type DbResult<T> = {
  data: T | null;
  error: DbError | null;
  count?: number | null;
};

export type QueryLike = PromiseLike<DbResult<unknown>>;

export type Chain = {
  select(columns?: string, options?: unknown): Chain;
  insert(value: unknown): Chain;
  delete(): Chain;
  update(value: unknown): Chain;
  upsert(value: unknown, options?: unknown): Chain;
  eq(column: string, value: unknown): Chain;
  neq(column: string, value: unknown): Chain;
  gt(column: string, value: unknown): Chain;
  gte(column: string, value: unknown): Chain;
  lte(column: string, value: unknown): Chain;
  is(column: string, value: unknown): Chain;
  in(column: string, value: unknown[]): Chain;
  contains(column: string, value: unknown[]): Chain;
  or(filter: string): Chain;
  order(column: string, options?: unknown): Chain;
  range(from: number, to: number): Chain;
  limit(count: number): Chain;
  single(): Chain;
  maybeSingle(): Chain;
  then<TResult1 = DbResult<unknown>, TResult2 = never>(
    onfulfilled?:
      | ((value: DbResult<unknown>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

export type DbClient = {
  from(table: string): Chain;
  rpc(name: string, args?: Record<string, unknown>): QueryLike;
};

export async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = MAPS_PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const boundedTimeout = Number.isFinite(timeoutMs)
    ? Math.max(1, Math.min(MAPS_PROVIDER_TIMEOUT_MS, Math.floor(timeoutMs)))
    : MAPS_PROVIDER_TIMEOUT_MS;
  return fetchBufferedWithTimeout(url, { ...init, redirect: "error" }, {
    maxResponseBytes: MAPS_PROVIDER_MAX_RESPONSE_BYTES,
    timeoutMs: boundedTimeout,
  });
}

export function db(ctx: MobileApiContext): DbClient {
  return ctx.supabase as DbClient;
}

export function workflowDb(ctx: MobileApiContext): DbClient {
  return (ctx.privilegedSupabase ?? ctx.supabase) as DbClient;
}

export async function dbQuery<T = unknown>(
  promise: QueryLike,
  ms = 10_000,
): Promise<DbResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DB timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]) as DbResult<
      T
    >;
  } catch (error) {
    return {
      data: null,
      error: {
        code: error instanceof Error && error.message.startsWith("DB timeout")
          ? "DB_TIMEOUT"
          : "DB_QUERY_FAILED",
        message: error instanceof Error ? error.name : "query failed",
      },
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function normalizeWorkerDistricts(districts: string[]): string[] | null {
  const normalized: string[] = [];
  for (const district of districts) {
    const canonical = normalizeWorkerDistrict(district);
    if (!canonical) return null;
    normalized.push(canonical);
  }
  return Array.from(new Set(normalized));
}

export function normalizeWorkerDistrict(district: string): string | null {
  const canonical = normalizeDistrict(district);
  if (canonical !== "hcmc_all") return canonical;

  const trimmed = district.trim().toLowerCase();
  if (
    trimmed === "hcmc_all" ||
    trimmed === HCMC_DISTRICTS.hcmc_all.toLowerCase()
  ) {
    return canonical;
  }
  return null;
}
