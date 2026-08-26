import { apiFailure } from "../../platform/api-failure.ts";

export type AdminSystemCursor = { primary: string; id: string };

export function encodeAdminSystemCursor(cursor: AdminSystemCursor): string {
  return btoa(JSON.stringify(cursor));
}

export function decodeAdminSystemCursor(value: string | undefined): AdminSystemCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value)) as Record<string, unknown>;
    if (typeof parsed.primary !== "string" || typeof parsed.id !== "string" || !parsed.primary || !parsed.id) {
      throw new Error("invalid cursor");
    }
    return { primary: parsed.primary, id: parsed.id };
  } catch {
    apiFailure("VALIDATION", "Con trỏ dữ liệu hệ thống không hợp lệ", 400);
  }
}

export function afterDescendingCursor<T>(
  rows: T[],
  cursor: AdminSystemCursor | null,
  getKey: (row: T) => AdminSystemCursor,
): T[] {
  if (!cursor) return rows;
  return rows.filter((row) => {
    const key = getKey(row);
    return key.primary < cursor.primary || (key.primary === cursor.primary && key.id < cursor.id);
  });
}
