// Generic request-value parsers: unknown -> typed, no domain knowledge and no I/O.

import { normalizeIsoTimestamp } from "../iso-timestamp.ts";
import { apiFailure } from "./api-failure.ts";

export function optionalBoundedText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    apiFailure("VALIDATION", "Dữ liệu review learning không hợp lệ", 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    apiFailure("VALIDATION", "Dữ liệu review learning không hợp lệ", 400);
  }
  return trimmed || undefined;
}

export function requiredBoundedText(value: unknown, maxLength: number): string {
  const text = optionalBoundedText(value, maxLength);
  if (!text) apiFailure("VALIDATION", "Dữ liệu review learning không hợp lệ", 400);
  return text;
}

export function optionalPositiveInt(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  return value;
}

export function optionalPositiveIntQuery(
  value: string | null,
  min: number,
  max: number,
): number | undefined {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  return optionalPositiveInt(Number(value), min, max);
}

export function optionalBoolean(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  return value;
}

export function assertAllowedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
}

export function parseIsoParam(value: string | null, name: string): string | undefined {
  if (value === null) return undefined;
  const parsed = normalizeIsoTimestamp(value);
  if (!parsed) {
    apiFailure(
      "VALIDATION",
      `Tham số "${name}" không phải định dạng ISO hợp lệ`,
      400,
    );
  }
  return parsed;
}

