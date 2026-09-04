import { nullableString } from "../../platform/coercions.ts";
import { apiFailure } from "../../platform/api-failure.ts";

type Row = Record<string, unknown>;

export function afterSubAdminCursor(rows: Row[], cursor: string | undefined): Row[] {
  if (!cursor) return rows;
  const decoded = decodeSubAdminCursor(cursor);
  return rows.filter((row) => {
    const candidate = subAdminCursorParts(row);
    return candidate.timestamp < decoded.timestamp
      || (candidate.timestamp === decoded.timestamp && candidate.userId < decoded.userId);
  });
}

export function encodeSubAdminCursor(row: Row): string {
  return btoa(subAdminCursorKey(row));
}

function decodeSubAdminCursor(cursor: string) {
  try {
    const decoded = atob(cursor);
    const [updatedAt, userId, extra] = decoded.split("|");
    const timestamp = Date.parse(updatedAt ?? "");
    if (extra !== undefined || !updatedAt || !userId || !Number.isFinite(timestamp) || !isUuid(userId)) {
      throw new Error("invalid cursor");
    }
    return { timestamp, userId };
  } catch {
    apiFailure("VALIDATION", "Con trỏ danh sách Sub Admin không hợp lệ", 400);
  }
}

function subAdminCursorKey(row: Row): string {
  const { updatedAt, userId } = subAdminCursorParts(row);
  return `${updatedAt}|${userId}`;
}

function subAdminCursorParts(row: Row) {
  const updatedAt = nullableString(row.updated_at);
  const userId = nullableString(row.user_id);
  const timestamp = Date.parse(updatedAt ?? "");
  if (!updatedAt || !userId || !Number.isFinite(timestamp)) {
    apiFailure("DB_ERROR", "Danh sách Sub Admin có con trỏ không hợp lệ", 500);
  }
  return { timestamp, updatedAt, userId };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
