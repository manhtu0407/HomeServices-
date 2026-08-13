import { apiFailure } from "../../platform/api-failure.ts";
import { nullableString } from "../../platform/coercions.ts";
import type { AdminFinanceContracts } from "../contracts/admin-finance.ts";

type AdminFinancePeriodInput = AdminFinanceContracts["financePeriodInput"];
type AdminFinanceRange = AdminFinanceContracts["range"];
type Row = Record<string, unknown>;

const MAX_FINANCE_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;

export type ResolvedFinancePeriod = {
  preset: AdminFinanceRange | "custom";
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
};

export function resolveFinancePeriod(input: AdminFinancePeriodInput): ResolvedFinancePeriod {
  if (input.range && !input.from && !input.to) {
    const bounds = hcmcRangeBounds(input.range, input.anchor);
    const duration = Date.parse(bounds.to) - Date.parse(bounds.from);
    return {
      preset: input.range,
      from: bounds.from,
      to: bounds.to,
      previousFrom: new Date(Date.parse(bounds.from) - duration).toISOString(),
      previousTo: bounds.from,
    };
  }
  if (!input.range && !input.anchor && input.from && input.to) {
    const fromMs = Date.parse(input.from);
    const toMs = Date.parse(input.to);
    const duration = toMs - fromMs;
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_FINANCE_RANGE_MS) {
      apiFailure("VALIDATION", "Khoảng ngày tài chính phải từ 1 mili giây đến 366 ngày", 400);
    }
    return {
      preset: "custom",
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      previousFrom: new Date(fromMs - duration).toISOString(),
      previousTo: new Date(fromMs).toISOString(),
    };
  }
  apiFailure("VALIDATION", "Khoảng thời gian tài chính không hợp lệ", 400);
}

export function financeBucket(period: ResolvedFinancePeriod): "hour" | "day" | "month" {
  if (period.preset === "day") return "hour";
  if (period.preset === "year") return "month";
  const durationDays = (Date.parse(period.to) - Date.parse(period.from)) / (24 * 60 * 60 * 1_000);
  return durationDays <= 2 ? "hour" : durationDays > 92 ? "month" : "day";
}

export function parseFinanceCursor(value: string): { job_id: string; paid_at: string } {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as Row;
    const jobId = nullableString(decoded.job_id);
    const paidAt = nullableString(decoded.paid_at);
    if (!jobId || !paidAt || !Number.isFinite(Date.parse(paidAt))) throw new Error("invalid cursor");
    return { job_id: jobId, paid_at: new Date(paidAt).toISOString() };
  } catch {
    apiFailure("VALIDATION", "Con trỏ giao dịch tài chính không hợp lệ", 400);
  }
}

export function encodeFinanceCursor(value: Row): string {
  const jobId = nullableString(value.job_id);
  const paidAt = nullableString(value.paid_at);
  if (!jobId || !paidAt || !Number.isFinite(Date.parse(paidAt))) {
    apiFailure("DB_ERROR", "Con trỏ giao dịch tài chính không hợp lệ", 500);
  }
  return btoa(JSON.stringify({ job_id: jobId, paid_at: new Date(paidAt).toISOString() }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function hcmcRangeBounds(range: AdminFinanceRange, anchor?: string) {
  const reference = anchor ? new Date(anchor) : new Date();
  if (!Number.isFinite(reference.getTime())) apiFailure("VALIDATION", "Mốc thời gian không hợp lệ", 400);
  const hcmc = new Date(reference.getTime() + 7 * 60 * 60 * 1000);
  const year = hcmc.getUTCFullYear();
  const month = hcmc.getUTCMonth();
  const day = hcmc.getUTCDate();
  if (range === "day") return hcmcWindow(year, month, day, 1);
  if (range === "week") {
    const weekday = hcmc.getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    return hcmcWindow(year, month, day + mondayOffset, 7);
  }
  if (range === "month") return { from: hcmcDate(year, month, 1), to: hcmcDate(year, month + 1, 1) };
  return { from: hcmcDate(year, 0, 1), to: hcmcDate(year + 1, 0, 1) };
}

function hcmcWindow(year: number, month: number, day: number, days: number) {
  return { from: hcmcDate(year, month, day), to: hcmcDate(year, month, day + days) };
}

function hcmcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day, -7, 0, 0, 0)).toISOString();
}
