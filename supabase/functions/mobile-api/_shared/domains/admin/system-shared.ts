import { apiFailure } from "../../platform/api-failure.ts";
import { nullableNumber, nullableString } from "../../platform/coercions.ts";
import type { AdminSystemContracts } from "../contracts/admin-system.ts";

type AdminSystemReceipt = AdminSystemContracts["receipt"];

export type SystemRow = Record<string, unknown>;

export function requiredString(row: SystemRow, key: string): string {
  const value = nullableString(row[key]);
  if (!value) apiFailure("DB_ERROR", `Dữ liệu hệ thống thiếu ${key}`, 500);
  return value;
}

export function requiredNumber(row: SystemRow, key: string): number {
  const value = nullableNumber(row[key]);
  if (value === null) apiFailure("DB_ERROR", `Dữ liệu hệ thống thiếu ${key}`, 500);
  return value;
}

export function requiredInteger(row: SystemRow, key: string): number {
  const value = requiredNumber(row, key);
  if (!Number.isSafeInteger(value) || value < 0) apiFailure("DB_ERROR", `Dữ liệu hệ thống sai ${key}`, 500);
  return value;
}

export function asRecord(value: unknown): SystemRow | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as SystemRow : null;
}

export function asRows(value: unknown): SystemRow[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const row = asRecord(item);
    return row ? [row] : [];
  }) : [];
}

export function serializeSystemReceipt(value: unknown): AdminSystemReceipt {
  const row = Array.isArray(value) ? asRecord(value[0]) : asRecord(value);
  if (!row) apiFailure("DB_ERROR", "Biên nhận hệ thống không hợp lệ", 500);
  return {
    event_id: requiredString(row, "event_id"),
    action: requiredString(row, "action"),
    resource_id: requiredString(row, "resource_id"),
    actor_id: requiredString(row, "actor_id"),
    recorded_at: requiredString(row, "recorded_at"),
    new_version: requiredInteger(row, "new_version"),
    replayed: row.replayed === true,
  };
}

export function aggregateDataQuality(qualities: Array<"available" | "partial" | "unavailable">) {
  if (qualities.every((quality) => quality === "unavailable")) return "unavailable" as const;
  if (qualities.every((quality) => quality === "available")) return "available" as const;
  return "partial" as const;
}
