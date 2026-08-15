import { nullableString } from "../../platform/coercions.ts";
import { apiFailure } from "../../platform/api-failure.ts";

export function safeCandidateBirthYear(value: unknown): number | null {
  const date = nullableString(value);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const year = Number(date.slice(0, 4));
  const currentYear = new Date().getUTCFullYear();
  return Number.isSafeInteger(year) && year >= 1900 && year <= currentYear ? year : null;
}

export function safeCandidateGender(value: unknown): "male" | "female" | "other" | null {
  return value === "male" || value === "female" || value === "other" ? value : null;
}

export function requiredCandidateInteger(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0
    ? Number(value)
    : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    apiFailure("DB_ERROR", "Dữ liệu hồ sơ thợ đề xuất không hợp lệ", 500);
  }
  return parsed;
}

export function requiredCandidateString(value: unknown): string {
  const parsed = nullableString(value);
  if (!parsed?.trim()) {
    apiFailure("DB_ERROR", "Dữ liệu hồ sơ thợ đề xuất không hợp lệ", 500);
  }
  return parsed;
}
