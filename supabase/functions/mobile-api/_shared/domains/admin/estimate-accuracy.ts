import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { nullableNumber, nullableString } from "../../platform/coercions.ts";

const SERVICES = Object.freeze(["electrical", "plumbing", "cleaning", "hvac", "upholstery", "handyman"] as const);
const COMPLEXITIES = Object.freeze(["small", "medium", "large"] as const);

export function parseKaelEstimateAccuracyInput(url: URL) {
  const service = optionalEnum(url.searchParams.get("service_type"), SERVICES, "service_type");
  const complexity = optionalEnum(url.searchParams.get("complexity"), COMPLEXITIES, "complexity");
  const month = url.searchParams.get("month")?.trim() || undefined;
  if (month && !/^20\d{2}-(?:0[1-9]|1[0-2])-01$/.test(month)) {
    apiFailure("VALIDATION", "Bộ lọc month phải có dạng YYYY-MM-01", 400);
  }
  const limitRaw = Number(url.searchParams.get("limit") ?? 100);
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 500) {
    apiFailure("VALIDATION", "Bộ lọc limit không hợp lệ", 400);
  }
  return { service, complexity, month, limit: limitRaw };
}

export async function listKaelEstimateAccuracy(
  ctx: MobileApiContext,
  input: ReturnType<typeof parseKaelEstimateAccuracyInput>,
) {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được xem độ chính xác báo giá Kael", 403);
  }
  let query = db(ctx)
    .from("kael_estimate_accuracy")
    .select("service_type,complexity,month,job_count,in_band_count,in_band_rate,under_count,over_count,median_miss_ratio,p90_miss_ratio")
    .order("month", { ascending: false })
    .limit(input.limit);
  if (input.service) query = query.eq("service_type", input.service);
  if (input.complexity) query = query.eq("complexity", input.complexity);
  if (input.month) query = query.eq("month", input.month);
  const result = await dbQuery<Array<Record<string, unknown>>>(query);
  if (result.error) apiFailure("DB_ERROR", "Không thể tải độ chính xác báo giá Kael", 500);
  return {
    rows: (result.data ?? []).map((row) => ({
      service_type: required(row.service_type),
      complexity: required(row.complexity),
      month: required(row.month),
      job_count: nullableNumber(row.job_count) ?? 0,
      in_band_count: nullableNumber(row.in_band_count) ?? 0,
      in_band_rate: nullableNumber(row.in_band_rate) ?? 0,
      under_count: nullableNumber(row.under_count) ?? 0,
      over_count: nullableNumber(row.over_count) ?? 0,
      median_miss_ratio: nullableNumber(row.median_miss_ratio) ?? 0,
      p90_miss_ratio: nullableNumber(row.p90_miss_ratio) ?? 0,
    })),
  };
}

function required(value: unknown): string {
  const parsed = nullableString(value);
  if (!parsed) apiFailure("DB_ERROR", "Dữ liệu độ chính xác Kael không hợp lệ", 500);
  return parsed;
}

function optionalEnum<T extends readonly string[]>(value: string | null, allowed: T, field: string): T[number] | undefined {
  if (!value) return undefined;
  if (!(allowed as readonly string[]).includes(value)) apiFailure("VALIDATION", `Bộ lọc ${field} không hợp lệ`, 400);
  return value as T[number];
}
