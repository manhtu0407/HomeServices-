import { apiFailure } from "../../platform/api-failure.ts";
import { nullableString } from "../../platform/coercions.ts";

export function serializeJobMessage(row: Record<string, unknown>) {
  const senderRole = requiredMessageSenderRole(row.sender_role);
  if (
    typeof row.is_read !== "boolean" ||
    (row.sender_id !== null && row.sender_id !== undefined &&
      typeof row.sender_id !== "string")
  ) {
    apiFailure("DB_ERROR", "Dữ liệu tin nhắn không hợp lệ", 500);
  }
  return {
    id: requiredDbString(row.id, "Dữ liệu tin nhắn không hợp lệ"),
    job_id: requiredDbString(row.job_id, "Dữ liệu tin nhắn không hợp lệ"),
    sender_id: nullableString(row.sender_id),
    sender_role: senderRole,
    content: requiredDbString(row.content, "Dữ liệu tin nhắn không hợp lệ"),
    is_read: row.is_read,
    created_at: requiredDbString(
      row.created_at,
      "Dữ liệu tin nhắn không hợp lệ",
    ),
  };
}

function requiredDbString(value: unknown, message: string): string {
  const parsed = typeof value === "string" && value.trim().length > 0
    ? value
    : null;
  if (!parsed) apiFailure("DB_ERROR", message, 500);
  return parsed;
}

function requiredMessageSenderRole(
  value: unknown,
): "customer" | "worker" | "kael" {
  if (value === "customer" || value === "worker" || value === "kael") {
    return value;
  }
  apiFailure("DB_ERROR", "Dữ liệu tin nhắn không hợp lệ", 500);
}
